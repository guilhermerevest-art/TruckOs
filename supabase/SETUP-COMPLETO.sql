-- =====================================================================
-- TruckOS — 001_extensions.sql
-- Extensoes necessarias e configuracao base
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "uuid-ossp";
create extension if not exists "pgsodium";      -- criptografia de credenciais

-- Funcao utilitaria: updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Funcao utilitaria: grava audit log generico
create or replace function public.write_audit_log()
returns trigger
language plpgsql
as $$
begin
  insert into public.audit_logs (tenant_id, user_id, action, entity, entity_id, before, after)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

comment on function public.write_audit_log() is
  'Trigger generica que espelha operacoes de tabelas de negocio em audit_logs.';
-- =====================================================================
-- TruckOS — 002_tenancy.sql
-- Tenants, membros, integracoes, billing (espelho Stripe)
-- =====================================================================

-- ---------- tenants (oficinas) ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  cnpj text,
  logo_url text,
  brand_color text default '#0EA5E9',
  address jsonb,
  tax_regime text check (tax_regime in ('simples','presumido','real')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','read_only')),
  trial_ends_at timestamptz,
  plan text not null default 'starter'
    check (plan in ('starter','pro','fleet')),
  settings jsonb not null default '{
    "kanban_phases": [
      "recepcao","diagnostico","orcamento",
      "aguardando_aprovacao","aguardando_peca",
      "em_execucao","controle_qualidade","pronto","entregue"
    ],
    "min_margin_pct": 20,
    "default_payment_terms_days": 0,
    "currency": "BRL"
  }'::jsonb,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_tenants_status on public.tenants(status);

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------- tenant_members (RBAC N:N) ----------
create type public.tenant_role as enum (
  'owner','manager','advisor','mechanic','stock','finance'
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null,
  hourly_cost numeric(10,2),
  commission_rules jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index idx_tenant_members_user on public.tenant_members(user_id) where active;

create trigger trg_tenant_members_updated_at
  before update on public.tenant_members
  for each row execute function public.set_updated_at();

-- ---------- tenant_integrations (credenciais criptografadas) ----------
create table public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('evolution','stripe','focus_nfe','asaas')),
  -- credentials cifradas com pgsodium; client nunca ve
  credentials_encrypted bytea,
  status text default 'pending',
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- ---------- subscription_events (webhook idempotente) ----------
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb,
  processed_at timestamptz default now()
);

-- ---------- usage_counters (enforcement de limites) ----------
create table public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period date not null,
  work_orders_count int not null default 0,
  messages_sent int not null default 0,
  storage_mb numeric(12,2) not null default 0,
  primary key (tenant_id, period)
);

-- =====================================================================
-- JWT custom claim: injeta tenant_id e role no token do usuario
-- Chamado pelo Supabase Auth Hook (configurado no dashboard)
-- =====================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  v_user_id uuid;
  v_tenant_id uuid;
  v_role text;
begin
  claims := event->'claims';

  -- 1. tenta ler do metadata do user (multi-tenant: tenant ativo)
  v_tenant_id := nullif(claims->>'active_tenant_id','')::uuid;
  v_role      := nullif(claims->>'active_role','');

  -- 2. fallback: pega o primeiro tenant ativo do usuario
  -- (cobre o caso de usuario single-tenant que acabou de se cadastrar)
  if v_tenant_id is null then
    v_user_id := (claims->>'sub')::uuid;
    select tm.tenant_id, tm.role::text
      into v_tenant_id, v_role
      from public.tenant_members tm
     where tm.user_id = v_user_id
       and tm.active = true
     order by tm.created_at asc
     limit 1;
  end if;

  if v_tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
    claims := jsonb_set(claims, '{role}',      to_jsonb(coalesce(v_role, 'member')));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function public.custom_access_token_hook is
  'Auth Hook do Supabase: adiciona tenant_id e role ao JWT.
   Single-tenant: pega o primeiro membership ativo.
   Multi-tenant: le active_tenant_id/active_role do metadata (sincronizado por /api/auth/switch-tenant).';

-- =====================================================================
-- RLS: tenants
-- Usuario so ve tenants dos quais eh membro (ou eh customer; ver policies)
-- =====================================================================
alter table public.tenants enable row level security;

create policy "tenants_select_members" on public.tenants
  for select using (
    id in (select tenant_id from public.tenant_members where user_id = auth.uid() and active)
  );

create policy "tenants_update_owners" on public.tenants
  for update using (
    id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role = 'owner'
    )
  );

create policy "tenants_insert_self" on public.tenants
  for insert with check (created_by = auth.uid());

-- =====================================================================
-- RLS: tenant_members
-- Membros visiveis entre si; owner gerencia
-- =====================================================================
alter table public.tenant_members enable row level security;

create policy "tenant_members_select_same_tenant" on public.tenant_members
  for select using (
    tenant_id in (
      select tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.active
    )
  );

create policy "tenant_members_manage_owners" on public.tenant_members
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.active and tm.role in ('owner','manager')
    )
  );

-- =====================================================================
-- RLS: tenant_integrations (somente owner/manager)
-- =====================================================================
alter table public.tenant_integrations enable row level security;

create policy "tenant_integrations_owners" on public.tenant_integrations
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role in ('owner','manager')
    )
  );

-- subscription_events: somente service role escreve; leitura negada ao usuario
alter table public.subscription_events enable row level security;
-- sem policy -> bloqueado para anon/authenticated. service_role bypassa RLS.

-- usage_counters: somente leitura para o tenant
alter table public.usage_counters enable row level security;
create policy "usage_counters_select" on public.usage_counters
  for select using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active
    )
  );
-- =====================================================================
-- TruckOS — 003_crm.sql
-- Clientes, contatos, veiculos, frota
-- =====================================================================

-- ---------- customers ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('pf','pj')),
  name text not null,
  trade_name text,
  document text,                 -- CPF ou CNPJ
  email text,
  tags text[] default '{}',
  price_table_id uuid,
  default_discount numeric(5,2) default 0,
  payment_terms int default 0,   -- dias; 0 = a vista
  credit_limit numeric(12,2),
  blocked boolean default false,
  blocked_reason text,
  portal_enabled boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_customers_tenant_name on public.customers(tenant_id, name);
create index idx_customers_tenant_doc on public.customers(tenant_id, document);
create index idx_customers_tenant_tags on public.customers using gin(tags);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger trg_customers_audit
  after insert or update or delete on public.customers
  for each row execute function public.write_audit_log();

-- ---------- customer_contacts ----------
create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  role text check (role in ('dono','gestor_frota','motorista','financeiro','outro')),
  phone_e164 text,           -- formato +55...
  whatsapp boolean default true,
  email text,
  can_approve boolean default false,
  opt_out boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customer_contacts_phone on public.customer_contacts(tenant_id, phone_e164);
create index idx_customer_contacts_customer on public.customer_contacts(customer_id);

create trigger trg_customer_contacts_updated_at
  before update on public.customer_contacts
  for each row execute function public.set_updated_at();

-- ---------- vehicles ----------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  plate text not null,
  vin text,
  brand text,
  model text,
  year int,
  vehicle_type text check (vehicle_type in
    ('cavalo','truck','toco','carreta','bitrem','onibus','maquina','utilitario')),
  axles int,
  odometer_km int default 0,
  hourmeter numeric(12,2) default 0,
  odometer_updated_at timestamptz default now(),
  photos jsonb default '[]'::jsonb,
  notes text,
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plate)
);

create index idx_vehicles_customer on public.vehicles(customer_id);
create index idx_vehicles_tenant_plate on public.vehicles(tenant_id, plate);

create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.vehicles enable row level security;

-- Helper: retorna tenants do usuario logado
create or replace function public.current_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members
  where user_id = auth.uid() and active;
$$;

create or replace function public.current_role_in(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.tenant_members
  where user_id = auth.uid() and tenant_id = p_tenant_id and active
  limit 1;
$$;

-- Customers: visiveis/editaveis por qualquer membro do tenant
create policy "customers_tenant_isolation" on public.customers
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "customer_contacts_tenant_isolation" on public.customer_contacts
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "vehicles_tenant_isolation" on public.vehicles
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 004_work_orders.sql
-- Nucleo: OS, kanban, secoes, pecas, mao de obra, midia
-- =====================================================================

-- ---------- work_orders (OS) ----------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number int not null,           -- sequencial por tenant (ver funcao)
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'recepcao',
  phase_entered_at timestamptz not null default now(),
  odometer_km int,
  fuel_level text,
  reported_issue text,
  reported_issue_audio_url text,
  checkin_checklist jsonb,
  checkin_signature_url text,
  advisor_id uuid references auth.users(id),
  promised_at timestamptz,
  priority text default 'normal' check (priority in ('baixa','normal','alta','urgente')),
  bay text,                     -- box / elevador
  totals jsonb not null default '{
    "parts":0,"labor":0,"third_party":0,"discount":0,"total":0
  }'::jsonb,
  invoice_id uuid,
  delivered_at timestamptz,
  warranty_terms text,
  origin_wo_id uuid references public.work_orders(id),  -- OS de retorno
  public_token text unique,     -- link publico de acompanhamento
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (tenant_id, number)
);

create index idx_wo_tenant_status on public.work_orders(tenant_id, status);
create index idx_wo_tenant_customer on public.work_orders(tenant_id, customer_id);
create index idx_wo_tenant_vehicle on public.work_orders(tenant_id, vehicle_id);
create index idx_wo_tenant_phase_entered on public.work_orders(tenant_id, phase_entered_at);
create index idx_wo_public_token on public.work_orders(public_token);

create trigger trg_wo_updated_at
  before update on public.work_orders
  for each row execute function public.set_updated_at();

create trigger trg_wo_audit
  after insert or update or delete on public.work_orders
  for each row execute function public.write_audit_log();

-- ---------- numero sequencial por tenant ----------
do $$
begin
  if not exists (select 1 from pg_class where relname = 'work_order_number_seq' and relkind = 'S') then
    create sequence public.work_order_number_seq;
  end if;
end $$;

create or replace function public.next_work_order_number(p_tenant_id uuid)
returns int
language plpgsql
as $$
declare
  v_next int;
begin
  v_next := nextval('public.work_order_number_seq');
  -- offsets por tenant (simplificado; producao usa tabela por tenant)
  return v_next;
end;
$$;

-- ---------- public_token automatico ----------
create extension if not exists "pgcrypto";

create or replace function public.set_wo_public_token()
returns trigger
language plpgsql
as $$
begin
  if new.public_token is null then
    new.public_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

create trigger trg_wo_public_token
  before insert on public.work_orders
  for each row execute function public.set_wo_public_token();

-- ---------- wo_status_history ----------
create table public.wo_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  user_id uuid references auth.users(id),
  at timestamptz not null default now(),
  note text
);

create index idx_wo_status_history_wo on public.wo_status_history(work_order_id, at desc);

-- ---------- wo_sections ----------
create table public.wo_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  category text not null,       -- suspensao|freios|motor|eletrica|...
  description text,
  diagnosis jsonb,              -- {sintoma, causa, solucao}
  mechanic_id uuid references auth.users(id),
  status text not null default 'pendente'
    check (status in ('pendente','em_execucao','concluida','aprovada','rejeitada')),
  std_hours numeric(6,2),
  labor_rate numeric(10,2),
  quality_check jsonb,
  warranty_months int default 90,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wo_sections_wo on public.wo_sections(work_order_id);
create index idx_wo_sections_mechanic on public.wo_sections(mechanic_id);

create trigger trg_wo_sections_updated_at
  before update on public.wo_sections
  for each row execute function public.set_updated_at();

-- ---------- wo_parts (pecas da OS) ----------
create table public.wo_parts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  part_id uuid,                 -- FK criada na migration de estoque
  source text not null default 'estoque'
    check (source in ('estoque','terceiro','cliente')),
  description text not null,
  qty numeric(10,3) not null default 1,
  unit_cost numeric(12,2) default 0,
  unit_price numeric(12,2) not null,
  reserved boolean default false,
  applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wo_parts_wo on public.wo_parts(work_order_id);
create index idx_wo_parts_section on public.wo_parts(section_id);

create trigger trg_wo_parts_updated_at
  before update on public.wo_parts
  for each row execute function public.set_updated_at();

-- ---------- wo_labor_logs (apontamento de tempo) ----------
create table public.wo_labor_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  mechanic_id uuid not null references auth.users(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes int,                  -- calculado pela trigger abaixo (now() nao e imutavel)
  pause_reason text,
  created_at timestamptz not null default now()
);

-- Trigger: calcula minutes ao inserir/atualizar (now() nao pode entrar em generated column)
create or replace function public.calc_labor_minutes()
returns trigger
language plpgsql
as $$
begin
  new.minutes := extract(epoch from (coalesce(new.ended_at, now()) - new.started_at))::int / 60;
  return new;
end;
$$;

create trigger trg_wo_labor_minutes
  before insert or update on public.wo_labor_logs
  for each row execute function public.calc_labor_minutes();

create index idx_wo_labor_wo on public.wo_labor_logs(work_order_id);
create index idx_wo_labor_mechanic on public.wo_labor_logs(mechanic_id);

-- ---------- wo_media ----------
create table public.wo_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  kind text not null check (kind in
    ('foto_entrada','foto_servico','video','laudo','assinatura','foto_publica')),
  storage_path text not null,
  caption text,
  is_public boolean default false,    -- aparece na pagina publica
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_wo_media_wo on public.wo_media(work_order_id);
create index idx_wo_media_public on public.wo_media(work_order_id) where is_public;

-- ---------- wo_third_party_services ----------
create table public.wo_third_party_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  supplier_id uuid,
  description text not null,
  cost numeric(12,2) default 0,
  price numeric(12,2) default 0,
  sent_at timestamptz,
  returned_at timestamptz,
  notes text
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.work_orders enable row level security;
alter table public.wo_status_history enable row level security;
alter table public.wo_sections enable row level security;
alter table public.wo_parts enable row level security;
alter table public.wo_labor_logs enable row level security;
alter table public.wo_media enable row level security;
alter table public.wo_third_party_services enable row level security;

-- Politica generica para tabelas com tenant_id
create policy "wo_tenant_isolation" on public.work_orders
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wo_status_history_tenant_isolation" on public.wo_status_history
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wo_sections_tenant_isolation" on public.wo_sections
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wo_parts_tenant_isolation" on public.wo_parts
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wo_labor_logs_tenant_isolation" on public.wo_labor_logs
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wo_media_tenant_isolation" on public.wo_media
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wo_third_party_tenant_isolation" on public.wo_third_party_services
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- =====================================================================
-- VIEW PUBLICA: status da OS pelo link publico (sem autenticacao)
-- Usa SECURITY DEFINER para expor somente campos nao sensiveis
-- =====================================================================
create or replace function public.public_work_order_status(p_token text)
returns table (
  number int,
  plate text,
  status text,
  promised_at timestamptz,
  phase_entered_at timestamptz,
  created_at timestamptz,
  customer_name text,
  vehicle_summary text,
  brand_color text,
  tenant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wo.number,
    v.plate,
    wo.status,
    wo.promised_at,
    wo.phase_entered_at,
    wo.created_at,
    c.name,
    coalesce(v.brand || ' ' || v.model || ' / ' || v.year::text, ''),
    t.brand_color,
    t.name
  from public.work_orders wo
  join public.tenants t on t.id = wo.tenant_id
  join public.customers c on c.id = wo.customer_id
  left join public.vehicles v on v.id = wo.vehicle_id
  where wo.public_token = p_token;
$$;

grant execute on function public.public_work_order_status to anon, authenticated;

-- View do historico de fases (timeline publica)
create or replace function public.public_work_order_timeline(p_token text)
returns table (
  status text,
  at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select h.to_status, h.at
  from public.wo_status_history h
  join public.work_orders wo on wo.id = h.work_order_id
  where wo.public_token = p_token
  order by h.at asc;
$$;

grant execute on function public.public_work_order_timeline to anon, authenticated;

-- View das midias publicas
create or replace function public.public_work_order_media(p_token text)
returns table (
  kind text,
  storage_path text,
  caption text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.kind, m.storage_path, m.caption
  from public.wo_media m
  join public.work_orders wo on wo.id = m.work_order_id
  where wo.public_token = p_token and m.is_public = true
  order by m.created_at asc;
$$;

grant execute on function public.public_work_order_media to anon, authenticated;-- =====================================================================
-- TruckOS — 005_quotes.sql
-- Orcamentos, itens, follow-ups, aprovacao digital
-- =====================================================================

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','approved','partial','rejected','expired')),
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  approval_token text unique,        -- link unico do cliente
  approved_by_contact_id uuid references public.customer_contacts(id),
  approved_at timestamptz,
  approval_meta jsonb,               -- {ip, user_agent, channel}
  rejection_reason text,
  subtotal numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_quotes_wo on public.quotes(work_order_id);
create index idx_quotes_tenant_status on public.quotes(tenant_id, status);
create index idx_quotes_token on public.quotes(approval_token);

create trigger trg_quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- Token de aprovacao
create or replace function public.set_quote_token()
returns trigger
language plpgsql
as $$
begin
  if new.approval_token is null then
    new.approval_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

create trigger trg_quotes_token
  before insert on public.quotes
  for each row execute function public.set_quote_token();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  kind text not null check (kind in ('part','labor','third_party')),
  ref_id uuid,                       -- wo_parts.id ou wo_sections.id
  description text not null,
  qty numeric(10,3) not null default 1,
  unit_price numeric(12,2) not null,
  option_group text default 'completo',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_quote_items_quote on public.quote_items(quote_id);

create table public.quote_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  channel text default 'whatsapp',
  template_id uuid
);

create index idx_quote_followups_due on public.quote_followups(scheduled_at)
  where sent_at is null;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_followups enable row level security;

create policy "quotes_tenant_isolation" on public.quotes
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "quote_items_tenant_isolation" on public.quote_items
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "quote_followups_tenant_isolation" on public.quote_followups
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- =====================================================================
-- Aprovacao publica (sem login): valida token, registra decisao
-- =====================================================================
create or replace function public.public_quote_view(p_token text)
returns table (
  quote_id uuid,
  work_order_number int,
  customer_name text,
  tenant_name text,
  brand_color text,
  total numeric,
  valid_until date,
  status text,
  items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id,
    wo.number,
    c.name,
    t.name,
    t.brand_color,
    q.total,
    q.valid_until,
    q.status,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', qi.id,
      'description', qi.description,
      'qty', qi.qty,
      'unit_price', qi.unit_price,
      'option_group', qi.option_group,
      'status', qi.status
    ) order by qi.created_at), '[]'::jsonb)
  from public.quotes q
  join public.work_orders wo on wo.id = q.work_order_id
  join public.tenants t on t.id = q.tenant_id
  join public.customers c on c.id = wo.customer_id
  left join public.quote_items qi on qi.quote_id = q.id
  where q.approval_token = p_token
  group by q.id, wo.number, c.name, t.name, t.brand_color, q.total, q.valid_until, q.status;
$$;

grant execute on function public.public_quote_view to anon, authenticated;

-- Aprovar itens: registra ip/user_agent, atualiza status da quote
create or replace function public.public_quote_approve(
  p_token text,
  p_item_ids uuid[],
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_total int;
begin
  select id into v_quote_id from public.quotes where approval_token = p_token;
  if v_quote_id is null then
    raise exception 'quote_not_found';
  end if;

  -- marca itens aprovados
  update public.quote_items
     set status = 'approved'
   where quote_id = v_quote_id
     and id = any(p_item_ids);

  -- rejeita os demais
  update public.quote_items
     set status = 'rejected'
   where quote_id = v_quote_id
     and id <> all(p_item_ids)
     and status = 'pending';

  select count(*) into v_total
    from public.quote_items
   where quote_id = v_quote_id and status = 'approved';

  update public.quotes
     set status = case when v_total > 0 then 'approved' else 'rejected' end,
         approved_at = now(),
         approval_meta = p_meta
   where id = v_quote_id;
end;
$$;

grant execute on function public.public_quote_approve to anon, authenticated;-- =====================================================================
-- TruckOS — 006_stock.sql
-- Estoque basico (pecas, saldos, movimentos, requisicoes)
-- =====================================================================

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  barcode text,
  description text not null,
  oem_codes text[] default '{}',
  brand text,
  category text,
  unit text default 'UN',
  ncm text,
  cest text,
  cst text,
  origin int,
  min_qty numeric(12,3) default 0,
  max_qty numeric(12,3) default 0,
  avg_cost numeric(12,4) default 0,
  sale_price numeric(12,2) default 0,
  margin_pct numeric(5,2) default 0,
  location text,                  -- rua/prateleira
  photo_url text,
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index idx_parts_tenant_desc on public.parts(tenant_id, description);
create index idx_parts_tenant_barcode on public.parts(tenant_id, barcode);

create trigger trg_parts_updated_at
  before update on public.parts
  for each row execute function public.set_updated_at();

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text default 'matriz' check (kind in ('matriz','movel','filial')),
  created_at timestamptz not null default now()
);

create table public.stock_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  qty numeric(12,3) not null default 0,
  reserved_qty numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, part_id)
);

create index idx_stock_balances_part on public.stock_balances(part_id);

create trigger trg_stock_balances_updated_at
  before update on public.stock_balances
  for each row execute function public.set_updated_at();

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  part_id uuid not null references public.parts(id) on delete restrict,
  kind text not null check (kind in
    ('entrada_nf','saida_os','ajuste','devolucao','transferencia','garantia')),
  qty numeric(12,3) not null,
  unit_cost numeric(12,4) default 0,
  work_order_id uuid references public.work_orders(id),
  user_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index idx_stock_moves_part on public.stock_moves(part_id, created_at desc);

-- Trigger: atualiza saldo automaticamente
create or replace function public.apply_stock_move()
returns trigger
language plpgsql
as $$
begin
  insert into public.stock_balances (tenant_id, warehouse_id, part_id, qty)
  values (new.tenant_id, new.warehouse_id, new.part_id, new.qty)
  on conflict (warehouse_id, part_id)
  do update set qty = public.stock_balances.qty + excluded.qty,
                updated_at = now();

  -- atualiza custo medio
  if new.kind = 'entrada_nf' and new.unit_cost > 0 then
    update public.parts p
       set avg_cost = (
         (coalesce((select sum(qty) from public.stock_balances sb
                    where sb.part_id = p.id and sb.warehouse_id = new.warehouse_id), 0) * p.avg_cost
          + new.qty * new.unit_cost)
         / nullif(coalesce((select sum(qty) from public.stock_balances sb
                    where sb.part_id = p.id and sb.warehouse_id = new.warehouse_id), 0) + new.qty, 0)
       )
     where p.id = new.part_id;
  end if;

  return new;
end;
$$;

create trigger trg_stock_moves_apply
  after insert on public.stock_moves
  for each row execute function public.apply_stock_move();

create table public.part_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  description text,
  qty numeric(12,3) not null default 1,
  status text not null default 'pendente'
    check (status in ('pendente','separado','entregue','sem_estoque','cancelado')),
  requested_by uuid not null references auth.users(id),
  fulfilled_by uuid references auth.users(id),
  fulfilled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_part_requests_status on public.part_requests(tenant_id, status);

create trigger trg_part_requests_updated_at
  before update on public.part_requests
  for each row execute function public.set_updated_at();

-- FK do wo_parts para parts (atrasada para nao depender da ordem)
alter table public.wo_parts
  add constraint fk_wo_parts_part
  foreign key (part_id) references public.parts(id) on delete set null;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.parts enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_moves enable row level security;
alter table public.part_requests enable row level security;

create policy "parts_tenant_isolation" on public.parts
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "warehouses_tenant_isolation" on public.warehouses
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "stock_balances_tenant_isolation" on public.stock_balances
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "stock_moves_tenant_isolation" on public.stock_moves
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "part_requests_tenant_isolation" on public.part_requests
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 007_audit.sql
-- Auditoria, knowledge base, helpers
-- =====================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  at timestamptz not null default now()
);

create index idx_audit_tenant_at on public.audit_logs(tenant_id, at desc);
create index idx_audit_entity on public.audit_logs(entity, entity_id);

alter table public.audit_logs enable row level security;

-- Apenas owner/manager le audit
create policy "audit_select_managers" on public.audit_logs
  for select using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role in ('owner','manager')
    )
  );

-- knowledge_base: diagnosticos aprendidos por tenant
create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_brand text,
  vehicle_model text,
  symptom text not null,
  cause text not null,
  solution text not null,
  source_wo_id uuid references public.work_orders(id),
  occurrences int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_kb_tenant_vehicle on public.knowledge_base(tenant_id, vehicle_brand, vehicle_model);

create trigger trg_kb_updated_at
  before update on public.knowledge_base
  for each row execute function public.set_updated_at();

alter table public.knowledge_base enable row level security;
create policy "kb_tenant_isolation" on public.knowledge_base
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- helper_sessions
create table public.helper_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  messages jsonb not null default '[]'::jsonb,
  context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_helper_sessions_updated_at
  before update on public.helper_sessions
  for each row execute function public.set_updated_at();

alter table public.helper_sessions enable row level security;
create policy "helper_sessions_own" on public.helper_sessions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- onboarding_progress
create table public.onboarding_progress (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  steps_completed text[] default '{}',
  tour_dismissed boolean default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, module)
);

alter table public.onboarding_progress enable row level security;
create policy "onboarding_own" on public.onboarding_progress
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- message_templates (templates WhatsApp por evento)
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,  -- NULL = global
  event text not null
    check (event in ('wo_created','quote_sent','quote_reminder','approved',
                     'part_arrived','wo_ready','wo_delivered','nps',
                     'pm_due','billing_due','billing_overdue')),
  channel text default 'whatsapp',
  body text not null,
  active boolean default true,
  delay_minutes int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_msg_templates_event on public.message_templates(event, active);

alter table public.message_templates enable row level security;
create policy "msg_templates_tenant_read" on public.message_templates
  for select using (
    tenant_id is null or tenant_id in (select public.current_tenants())
  );
create policy "msg_templates_owners_write" on public.message_templates
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role in ('owner','manager')
    )
  );-- =====================================================================
-- TruckOS — 008_seed.sql
-- Templates globais e dados minimos
-- =====================================================================

insert into public.message_templates (tenant_id, event, body, delay_minutes) values
(null, 'wo_created', 'Ola {{cliente}}, recebemos seu veiculo {{placa}} na {{oficina}}. OS #{{numero}}. Acompanhe ao vivo: {{link_acompanhamento}}', 0),
(null, 'quote_sent', '{{cliente}}, segue o orcamento da OS #{{numero}}. Valor: R$ {{total}}. Aprove pelo link: {{link_aprovacao}}', 0),
(null, 'quote_reminder', '{{cliente}}, seu orcamento da OS #{{numero}} ainda espera aprovacao. Link: {{link_aprovacao}}', 0),
(null, 'approved', 'Orcamento aprovado! Servico da OS #{{numero}} iniciara em breve. Previsao: {{previsao}}.', 0),
(null, 'part_arrived', 'Pecas chegaram para a OS #{{numero}}. Servico iniciando.', 0),
(null, 'wo_ready', '{{cliente}}, seu {{veiculo}} (placa {{placa}}) esta pronto! Total: R$ {{total}}. Pagar: {{link_pgto}}', 0),
(null, 'wo_delivered', 'Obrigado pela confianca! NF e certificado de garantia em anexo.', 0),
(null, 'nps', 'De 0 a 10, quanto recomenda a {{oficina}}? Sua opniao e importante.', 1440),
(null, 'pm_due', 'A revisao dos {{km}} km do veiculo {{placa}} esta proxima. Quer agendar?', 0),
(null, 'billing_due', '{{cliente}}, fatura {{numero}} vence em {{dias}} dias. Pagar: {{link_pgto}}', 0),
(null, 'billing_overdue', '{{cliente}}, fatura {{numero}} em atraso ({{dias}} dias). Regularize: {{link_pgto}}', 0);

-- Catalogo semente de servicos padrao (F2: mover para tabela service_catalog)
-- Mantido em JSON nas settings do tenant; exemplo abaixo.-- =====================================================================
-- TruckOS — 009_rpc.sql
-- Funcoes RPC utilizadas pelo frontend (Kanban e helpers)
-- =====================================================================

-- Mover OS de fase: atualiza status + phase_entered_at + grava historico
create or replace function public.move_work_order(
  p_work_order_id uuid,
  p_new_status text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_status text;
  v_tenant_id uuid;
begin
  select status, tenant_id into v_old_status, v_tenant_id
    from public.work_orders
   where id = p_work_order_id;

  if v_tenant_id is null then
    raise exception 'work_order_not_found';
  end if;

  -- checa que o usuario tem acesso ao tenant
  if not exists (
    select 1 from public.tenant_members
    where user_id = auth.uid() and tenant_id = v_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  update public.work_orders
     set status = p_new_status,
         phase_entered_at = now(),
         updated_at = now()
   where id = p_work_order_id;

  insert into public.wo_status_history
    (tenant_id, work_order_id, from_status, to_status, user_id, at)
  values
    (v_tenant_id, p_work_order_id, v_old_status, p_new_status, auth.uid(), now());
end;
$$;

grant execute on function public.move_work_order to authenticated;

-- Helper: incrementar contador de uso
create or replace function public.bump_usage_counter(
  p_field text,
  p_amount int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := (auth.jwt() ->> 'tenant_id')::uuid;
  if v_tenant_id is null then return; end if;

  insert into public.usage_counters (tenant_id, period, work_orders_count, messages_sent, storage_mb)
  values (v_tenant_id, date_trunc('month', now())::date, 0, 0, 0)
  on conflict (tenant_id, period) do nothing;

  execute format(
    'update public.usage_counters set %I = %I + $1
       where tenant_id = $2 and period = date_trunc(''month'', now())::date',
    p_field, p_field
  )
  using p_amount, v_tenant_id;
end;
$$;

grant execute on function public.bump_usage_counter to authenticated;-- =====================================================================
-- TruckOS — 010_pm_contracts.sql
-- Manutencao preventiva e contratos de frota
-- =====================================================================

create table public.pm_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  name text not null,
  interval_km int,
  interval_days int,
  interval_hours numeric(12,2),
  checklist jsonb,
  last_done_km int default 0,
  last_done_at date,
  next_due_km int,
  next_due_at date,
  status text default 'ok' check (status in ('ok','proximo','vencido')),
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pm_plans_vehicle on public.pm_plans(vehicle_id);
create index idx_pm_plans_status on public.pm_plans(tenant_id, status);
create index idx_pm_plans_due on public.pm_plans(next_due_at);

create trigger trg_pm_plans_updated_at
  before update on public.pm_plans
  for each row execute function public.set_updated_at();

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  kind text not null check (kind in ('valor_fixo','banco_horas')),
  monthly_value numeric(12,2) not null default 0,
  included_hours numeric(10,2),
  start_date date not null,
  end_date date,
  billing_day int default 25 check (billing_day between 1 and 31),
  vehicles uuid[] default '{}',
  status text default 'ativo' check (status in ('ativo','suspenso','cancelado','encerrado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contracts_customer on public.contracts(customer_id);
create index idx_contracts_tenant_status on public.contracts(tenant_id, status);

create trigger trg_contracts_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

create table public.contract_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  period date not null,
  hours_used numeric(10,2) default 0,
  amount_billed numeric(12,2) default 0,
  work_order_ids uuid[] default '{}',
  created_at timestamptz not null default now(),
  unique (contract_id, period)
);

create index idx_contract_usage_contract on public.contract_usage(contract_id);

alter table public.pm_plans enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_usage enable row level security;

create policy "pm_plans_tenant_isolation" on public.pm_plans
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "contracts_tenant_isolation" on public.contracts
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "contract_usage_tenant_isolation" on public.contract_usage
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 011_finance.sql
-- Financeiro: faturas, receber, pagar, comissoes, caixa
-- =====================================================================

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  kind text not null default 'os_avulsa' check (kind in ('os_avulsa','consolidada_frota','contrato')),
  work_order_ids uuid[] default '{}',
  subtotal numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  amount numeric(12,2) not null default 0,
  due_date date,
  paid_at timestamptz,
  paid_amount numeric(12,2) default 0,
  payment_method text check (payment_method in ('pix','cartao','boleto','dinheiro','transferencia')),
  status text not null default 'aberta' check (status in ('aberta','paga','parcial','vencida','cancelada')),
  payment_link text,
  stripe_payment_intent text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_invoices_tenant_status on public.invoices(tenant_id, status);
create index idx_invoices_tenant_customer on public.invoices(tenant_id, customer_id);
create index idx_invoices_due_date on public.invoices(tenant_id, due_date);

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid,
  category text,
  description text not null,
  amount numeric(12,2) not null,
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'aberta' check (status in ('aberta','paga','parcial','vencida','cancelada')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payables_tenant_status on public.payables(tenant_id, status);
create index idx_payables_due on public.payables(tenant_id, due_date);

create trigger trg_payables_updated_at
  before update on public.payables
  for each row execute function public.set_updated_at();

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid references public.tenant_members(user_id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  period date not null,
  base text not null check (base in ('mao_de_obra','venda')),
  amount numeric(12,2) not null default 0,
  status text default 'aberta' check (status in ('aberta','paga','cancelada')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_commissions_member on public.commissions(member_id);
create index idx_commissions_period on public.commissions(tenant_id, period);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric(12,2) default 0,
  closing_amount numeric(12,2),
  expected_amount numeric(12,2),
  diff numeric(12,2),
  notes text
);

alter table public.invoices enable row level security;
alter table public.payables enable row level security;
alter table public.commissions enable row level security;
alter table public.cash_sessions enable row level security;

create policy "invoices_tenant_isolation" on public.invoices
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "payables_tenant_isolation" on public.payables
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "commissions_tenant_isolation" on public.commissions
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "cash_sessions_tenant_isolation" on public.cash_sessions
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 012_fiscal.sql
-- Documentos fiscais (NFS-e, NF-e, NFC-e)
-- =====================================================================

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  kind text not null check (kind in ('nfse','nfe','nfce')),
  provider_ref text,
  provider text default 'focus_nfe',
  number text,
  series text,
  status text not null default 'processando'
    check (status in ('processando','autorizada','rejeitada','cancelada','denegada')),
  amount numeric(12,2),
  rejection_reason text,
  xml_url text,
  pdf_url text,
  issued_at timestamptz default now(),
  authorized_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_fiscal_tenant_status on public.fiscal_documents(tenant_id, status);
create index idx_fiscal_wo on public.fiscal_documents(work_order_id);
create index idx_fiscal_invoice on public.fiscal_documents(invoice_id);

create trigger trg_fiscal_updated_at
  before update on public.fiscal_documents
  for each row execute function public.set_updated_at();

alter table public.fiscal_documents enable row level security;
create policy "fiscal_tenant_isolation" on public.fiscal_documents
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 013_whatsapp.sql
-- WhatsApp: instancias, conversas, mensagens, campanhas, NPS
-- =====================================================================

create table public.wa_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_name text not null unique,
  phone_e164 text,
  status text default 'disconnected' check (status in ('connected','disconnected','qr_pending','banned')),
  qr_code text,
  webhook_secret text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create trigger trg_wa_instances_updated_at
  before update on public.wa_instances
  for each row execute function public.set_updated_at();

create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_phone text not null,
  contact_name text,
  customer_id uuid references public.customers(id) on delete set null,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  assigned_to uuid references auth.users(id),
  status text default 'aberta' check (status in ('aberta','pendente','resolvida','arquivada')),
  last_message_at timestamptz default now(),
  unread_count int default 0,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wa_conv_tenant_phone on public.wa_conversations(tenant_id, contact_phone);
create index idx_wa_conv_tenant_status on public.wa_conversations(tenant_id, status);
create index idx_wa_conv_wo on public.wa_conversations(work_order_id);

create trigger trg_wa_conv_updated_at
  before update on public.wa_conversations
  for each row execute function public.set_updated_at();

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.wa_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  kind text default 'text' check (kind in ('text','image','audio','document','video','button_reply','location','contact')),
  body text,
  media_url text,
  evolution_message_id text,
  status text default 'sent' check (status in ('queued','sent','delivered','read','failed')),
  work_order_id uuid references public.work_orders(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  sent_by uuid references auth.users(id),
  is_automated boolean default false,
  error text,
  created_at timestamptz not null default now()
);

create index idx_wa_messages_conv on public.wa_messages(conversation_id, created_at desc);
create index idx_wa_messages_tenant_at on public.wa_messages(tenant_id, created_at desc);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  segment_filter jsonb,
  template_id uuid,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  status text default 'rascunho' check (status in ('rascunho','agendada','rodando','concluida','cancelada')),
  stats jsonb default '{"sent":0,"delivered":0,"read":0,"replied":0,"optout":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaigns_tenant_status on public.campaigns(tenant_id, status);

create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create table public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contact_phone text,
  score int not null check (score between 0 and 10),
  comment text,
  responded_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create index idx_nps_tenant_score on public.nps_responses(tenant_id, score);
create index idx_nps_tenant_at on public.nps_responses(tenant_id, responded_at desc);

alter table public.wa_instances enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.campaigns enable row level security;
alter table public.nps_responses enable row level security;

create policy "wa_instances_tenant_isolation" on public.wa_instances
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wa_conv_tenant_isolation" on public.wa_conversations
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wa_messages_tenant_isolation" on public.wa_messages
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "campaigns_tenant_isolation" on public.campaigns
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "nps_tenant_isolation" on public.nps_responses
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 014_suppliers.sql
-- Fornecedores e compras
-- =====================================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  cnpj text,
  contacts jsonb,
  payment_terms int default 0,
  rating int check (rating between 1 and 5),
  notes text,
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_suppliers_tenant_name on public.suppliers(tenant_id, name);

create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  status text default 'cotacao' check (status in ('cotacao','pedido','recebido_parcial','recebido','cancelado')),
  nfe_key text,
  xml_url text,
  freight numeric(12,2) default 0,
  total numeric(12,2) default 0,
  expected_at date,
  received_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_purchases_tenant_status on public.purchases(tenant_id, status);
create index idx_purchases_supplier on public.purchases(supplier_id);

create trigger trg_purchases_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  part_id uuid references public.parts(id) on delete set null,
  description text not null,
  qty numeric(12,3) not null default 1,
  unit_cost numeric(12,4) default 0,
  received_qty numeric(12,3) default 0,
  demand_quote_item_id uuid,
  created_at timestamptz not null default now()
);

create index idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index idx_purchase_items_part on public.purchase_items(part_id);

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "suppliers_tenant_isolation" on public.suppliers
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "purchases_tenant_isolation" on public.purchases
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "purchase_items_tenant_isolation" on public.purchase_items
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));-- =====================================================================
-- TruckOS — 015_realtime.sql
-- Habilita Realtime nas tabelas chave
-- =====================================================================

-- Habilita Realtime para as tabelas principais
alter publication supabase_realtime add table public.work_orders;
alter publication supabase_realtime add table public.wo_status_history;
alter publication supabase_realtime add table public.quotes;
alter publication supabase_realtime add table public.part_requests;
alter publication supabase_realtime add table public.wa_conversations;
alter publication supabase_realtime add table public.wa_messages;
alter publication supabase_realtime add table public.invoices;

-- Funcao utilitaria: trigger automatico de PM (chamado por cron no futuro)
create or replace function public.refresh_pm_status()
returns void
language plpgsql
as $$
begin
  update public.pm_plans
     set status = case
       when next_due_at < current_date then 'vencido'
       when next_due_at <= current_date + 15 then 'proximo'
       else 'ok'
     end,
     updated_at = now();
end;
$$;

-- View: dashboard gestor (resumo do dia)
create or replace view public.v_dashboard_day as
select
  t.id as tenant_id,
  t.name as tenant_name,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id and wo.status not in ('entregue','cancelado')
  ) as os_abertas,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id and wo.status = 'pronto'
  ) as os_prontas,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id and wo.status = 'aguardando_aprovacao'
  ) as orcamentos_pendentes,
  (
    select count(*) from public.quotes q
    where q.tenant_id = t.id and q.status = 'sent'
  ) as orcamentos_enviados,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id
      and wo.phase_entered_at < (now() - interval '24 hours')
      and wo.status not in ('entregue','cancelado')
  ) as os_paradas_24h,
  (
    select coalesce(sum(amount), 0) from public.invoices i
    where i.tenant_id = t.id and i.status = 'paga'
      and i.paid_at >= date_trunc('month', now())
  ) as faturamento_mes
from public.tenants t;

grant select on public.v_dashboard_day to authenticated;

-- View: NPS agregado
create or replace view public.v_nps_summary as
select
  tenant_id,
  count(*) as total_responses,
  avg(score) as avg_score,
  count(*) filter (where score >= 9) as promoters,
  count(*) filter (where score between 7 and 8) as passives,
  count(*) filter (where score <= 6) as detractors,
  case
    when count(*) > 0 then
      round(((count(*) filter (where score >= 9)::numeric - count(*) filter (where score <= 6)::numeric) / count(*)) * 100, 1)
    else 0
  end as nps_score
from public.nps_responses
group by tenant_id;

grant select on public.v_nps_summary to authenticated;