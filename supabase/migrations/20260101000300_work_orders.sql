-- =====================================================================
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

grant execute on function public.public_work_order_media to anon, authenticated;