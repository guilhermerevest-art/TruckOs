# TruckOS — Implementação Detalhada Fase 1 (MVP)

**Companion de:** TruckOS-Especificacao-Completa.md
**Escopo deste documento:** tudo que é necessário para construir o MVP (Fase 1) — migrations SQL executáveis, RLS, triggers, Edge Functions, seeds, PRD tela a tela e critérios de aceite. Pronto para uso com Claude Code.

---

## 0. Estrutura do Projeto

```
truckos/
├── apps/
│   ├── web/                      # Next.js 15 (App Router) — app da oficina + portal + landing
│   │   ├── app/
│   │   │   ├── (landing)/        # rotas públicas: /, /precos, /funcionalidades
│   │   │   ├── (auth)/           # /login, /cadastro, /convite/[token]
│   │   │   ├── (app)/            # rotas autenticadas da oficina
│   │   │   │   ├── painel/
│   │   │   │   ├── os/           # kanban + detalhe da OS
│   │   │   │   ├── checkin/
│   │   │   │   ├── orcamentos/
│   │   │   │   ├── clientes/
│   │   │   │   ├── veiculos/
│   │   │   │   ├── estoque/
│   │   │   │   ├── whatsapp/     # caixa de entrada
│   │   │   │   ├── relatorios/
│   │   │   │   └── configuracoes/
│   │   │   ├── aprovar/[token]/  # página pública de aprovação de orçamento
│   │   │   ├── acompanhar/[token]/  # página pública de rastreamento da OS em tempo real
│   │   │   └── api/              # route handlers auxiliares
│   │   ├── components/
│   │   │   ├── ui/               # shadcn
│   │   │   ├── helper/           # painel do helper (tour + chat)
│   │   │   └── modules/          # componentes por módulo
│   │   └── lib/                  # supabase client, hooks, utils
│   └── docs/                     # base de conhecimento do helper (markdown)
├── supabase/
│   ├── migrations/               # SQL numerado (este documento, seção 1)
│   ├── functions/                # Edge Functions (seção 4)
│   │   ├── wa-webhook/
│   │   ├── wa-send/
│   │   ├── wa-monitor/
│   │   ├── stripe-webhook/
│   │   ├── quote-approve/
│   │   ├── helper-chat/
│   │   └── jobs-cron/
│   └── seed.sql                  # seção 3
└── packages/
    └── shared/                   # tipos TS gerados do banco, zod schemas
```

**Convenções de código:**
- Tipos TS gerados via `supabase gen types typescript` — nunca tipar tabela na mão.
- Toda mutação passa por Server Action com validação Zod; leitura via RLS direto do client quando possível (Realtime no Kanban).
- Datas sempre `timestamptz` em UTC; exibição no fuso do tenant (`tenants.settings->>'timezone'`, default `America/Sao_Paulo`).
- Dinheiro: `numeric(14,2)`. Nunca float.

---

## 1. Migrations SQL — Fase 1 (executáveis)

> Ordem de execução = ordem dos arquivos. Todos idempotentes onde possível.

### 1.1 `0001_extensions_and_helpers.sql`

```sql
-- Extensões
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";      -- busca fuzzy por placa/cliente
create extension if not exists "pgsodium";     -- criptografia de credenciais

-- Schema para funções internas (fora do search_path público)
create schema if not exists app;

-- ============ Função: tenant do JWT ============
create or replace function app.current_tenant_id()
returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

-- ============ Função: role do JWT ============
create or replace function app.current_role()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'tenant_role', 'none');
$$;

-- ============ Função: checagem de role ============
create or replace function app.has_role(variadic roles text[])
returns boolean
language sql stable
as $$
  select app.current_role() = any(roles);
$$;

-- ============ Trigger genérico: updated_at ============
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============ Trigger genérico: forçar tenant_id do JWT ============
-- Impede client malicioso de inserir com tenant_id de outro tenant
create or replace function app.force_tenant_id()
returns trigger language plpgsql as $$
begin
  if app.current_tenant_id() is not null then
    new.tenant_id = app.current_tenant_id();
  end if;
  return new;
end $$;

-- ============ Macro de aplicação (documentação) ============
-- Para cada tabela de negócio, aplicar:
--   alter table X enable row level security;
--   create policy tenant_select on X for select using (tenant_id = app.current_tenant_id());
--   create policy tenant_insert on X for insert with check (tenant_id = app.current_tenant_id());
--   create policy tenant_update on X for update using (tenant_id = app.current_tenant_id());
--   create policy tenant_delete on X for delete using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'));
--   create trigger trg_X_tenant before insert on X for each row execute function app.force_tenant_id();
--   create trigger trg_X_updated before update on X for each row execute function app.set_updated_at();
-- A função abaixo automatiza isso:

create or replace function app.apply_tenant_policies(tbl regclass)
returns void language plpgsql as $$
declare t text := tbl::text;
begin
  execute format('alter table %s enable row level security', t);
  execute format($f$create policy tenant_select on %s for select using (tenant_id = app.current_tenant_id())$f$, t);
  execute format($f$create policy tenant_insert on %s for insert with check (tenant_id = app.current_tenant_id())$f$, t);
  execute format($f$create policy tenant_update on %s for update using (tenant_id = app.current_tenant_id())$f$, t);
  execute format($f$create policy tenant_delete on %s for delete using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'))$f$, t);
  execute format('create trigger trg_tenant before insert on %s for each row execute function app.force_tenant_id()', t);
  execute format('create trigger trg_updated before update on %s for each row execute function app.set_updated_at()', t);
end $$;
```

### 1.2 `0002_tenants_and_members.sql`

```sql
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  cnpj text,
  logo_url text,
  brand_color text default '#0F62FE',
  address jsonb default '{}',
  tax_regime text default 'simples' check (tax_regime in ('simples','presumido','real')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','readonly')),
  trial_ends_at timestamptz not null default now() + interval '30 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','fleet')),
  settings jsonb not null default '{
    "timezone": "America/Sao_Paulo",
    "kanban_phases": ["recepcao","diagnostico","orcamento","aguardando_aprovacao","aguardando_peca","em_execucao","qualidade","pronto","entregue"],
    "min_margin_pct": 25,
    "send_window": {"start": "08:00", "end": "19:00"},
    "quote_validity_days": 7,
    "quote_reminder_hours": [24, 48]
  }',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tenants: usuário só lê o próprio tenant; escrita restrita a owner
alter table tenants enable row level security;
create policy tenant_self_select on tenants for select
  using (id = app.current_tenant_id());
create policy tenant_self_update on tenants for update
  using (id = app.current_tenant_id() and app.has_role('owner'));
create trigger trg_tenants_updated before update on tenants
  for each row execute function app.set_updated_at();

create table tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','advisor','mechanic','stock','finance','customer')),
  display_name text,
  phone_e164 text,
  hourly_cost numeric(10,2),           -- custo/hora do produtivo (para margem real)
  commission_rules jsonb default '{}',
  customer_id uuid,                    -- preenchido quando role = 'customer' (portal)
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, user_id)
);
select app.apply_tenant_policies('tenant_members');
-- Ajuste: membro pode ler colegas, mas só owner/manager gerencia
drop policy tenant_insert on tenant_members;
drop policy tenant_update on tenant_members;
create policy member_manage_insert on tenant_members for insert
  with check (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'));
create policy member_manage_update on tenant_members for update
  using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'));

-- ============ Custom Access Token Hook (Supabase Auth Hook) ============
-- Configurar no Dashboard: Authentication > Hooks > Custom Access Token
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := event->'claims';
  m record;
begin
  select tm.tenant_id, tm.role, tm.customer_id
    into m
    from tenant_members tm
   where tm.user_id = (event->>'user_id')::uuid
     and tm.active
   order by tm.created_at
   limit 1;                            -- F1: 1 tenant por usuário; multi-tenant na F2 via app_metadata.active_tenant

  if found then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(m.tenant_id::text));
    claims := jsonb_set(claims, '{tenant_role}', to_jsonb(m.role));
    if m.customer_id is not null then
      claims := jsonb_set(claims, '{customer_id}', to_jsonb(m.customer_id::text));
    end if;
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;

create table tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('evolution','stripe','focus_nfe')),
  credentials_encrypted bytea,          -- pgsodium: apenas service_role lê/escreve
  status text default 'pending' check (status in ('pending','connected','error','disabled')),
  meta jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, provider)
);
-- Integrações: NUNCA expostas ao client. RLS nega tudo; acesso só via service_role nas Edge Functions.
alter table tenant_integrations enable row level security;
create policy integrations_status_only on tenant_integrations for select
  using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'));
-- (o client só deve selecionar colunas status/meta; enforce via view)
create view integration_status as
  select tenant_id, provider, status, meta, updated_at
    from tenant_integrations;

create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  stripe_event_id text unique not null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz default now()
);
alter table subscription_events enable row level security;  -- sem policies = só service_role

create table usage_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  period date not null,                 -- primeiro dia do mês
  work_orders_count int not null default 0,
  messages_sent int not null default 0,
  storage_mb numeric(12,2) not null default 0,
  primary key (tenant_id, period)
);
alter table usage_counters enable row level security;
create policy usage_read on usage_counters for select
  using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'));

-- ============ Limites por plano ============
create table plan_limits (
  plan text primary key,
  max_users int,
  max_wo_month int,
  features jsonb                        -- {"portal": true, "fiscal": false, ...}
);
insert into plan_limits values
  ('trial',   10,  300, '{"portal":true,"fiscal":false,"helper_ai":true}'),
  ('starter',  3,   80, '{"portal":false,"fiscal":false,"helper_ai":false}'),
  ('pro',     10,  300, '{"portal":true,"fiscal":true,"helper_ai":true}'),
  ('fleet', 9999, 99999,'{"portal":true,"fiscal":true,"helper_ai":true}');
alter table plan_limits enable row level security;
create policy plan_limits_read on plan_limits for select using (true);
```

### 1.3 `0003_customers_vehicles.sql`

```sql
create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null default 'pj' check (type in ('pf','pj')),
  name text not null,
  trade_name text,
  document text,                        -- CPF/CNPJ só dígitos
  email text,
  tags text[] default '{}',
  default_discount numeric(5,2) default 0,
  payment_terms int default 0,          -- 0 = à vista; 15/30/45 = faturado
  credit_limit numeric(14,2),
  blocked boolean not null default false,
  block_reason text,
  portal_enabled boolean not null default false,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, document)
);
select app.apply_tenant_policies('customers');
create index idx_customers_name_trgm on customers using gin (name gin_trgm_ops);
create index idx_customers_tenant on customers (tenant_id);

create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  role text default 'dono' check (role in ('dono','gestor_frota','motorista','financeiro','outro')),
  phone_e164 text,                      -- +5534999999999
  whatsapp boolean default true,
  whatsapp_optout boolean default false,
  email text,
  can_approve boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('customer_contacts');
create index idx_contacts_phone on customer_contacts (tenant_id, phone_e164);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  plate text not null,                  -- normalizada: sem hífen, maiúscula
  vin text,
  brand text, model text, year int,
  vehicle_type text default 'cavalo'
    check (vehicle_type in ('cavalo','truck','toco','carreta','bitrem','rodotrem','onibus','van','maquina','outro')),
  axles int,
  odometer_km int,
  hourmeter numeric(10,1),
  odometer_updated_at timestamptz,
  photos jsonb default '[]',
  notes text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, plate)
);
select app.apply_tenant_policies('vehicles');
create index idx_vehicles_plate_trgm on vehicles using gin (plate gin_trgm_ops);

-- Normalização de placa
create or replace function app.normalize_plate()
returns trigger language plpgsql as $$
begin
  new.plate = upper(regexp_replace(new.plate, '[^A-Za-z0-9]', '', 'g'));
  return new;
end $$;
create trigger trg_vehicles_plate before insert or update of plate on vehicles
  for each row execute function app.normalize_plate();
```

### 1.4 `0004_work_orders.sql`

```sql
-- ============ Numeração sequencial por tenant ============
create table wo_sequences (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  last_number bigint not null default 0
);
alter table wo_sequences enable row level security;  -- só via função

create or replace function app.next_wo_number(p_tenant uuid)
returns bigint language plpgsql security definer as $$
declare n bigint;
begin
  insert into wo_sequences (tenant_id, last_number) values (p_tenant, 1)
  on conflict (tenant_id) do update set last_number = wo_sequences.last_number + 1
  returning last_number into n;
  return n;
end $$;

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number bigint not null,
  customer_id uuid not null references customers(id),
  vehicle_id uuid not null references vehicles(id),
  status text not null default 'recepcao',
  phase_entered_at timestamptz not null default now(),
  odometer_km int,
  fuel_level text check (fuel_level in ('vazio','1/4','1/2','3/4','cheio')),
  reported_issue text,
  reported_issue_audio_url text,
  checkin_checklist jsonb default '{}',   -- {item: {ok: bool, foto: url, obs: text}}
  checkin_signature_url text,
  advisor_id uuid references tenant_members(id),
  promised_at timestamptz,
  priority text default 'normal' check (priority in ('baixa','normal','alta','urgente')),
  bay text,
  totals jsonb not null default '{"parts":0,"labor":0,"third_party":0,"discount":0,"total":0}',
  invoice_id uuid,
  delivered_at timestamptz,
  warranty_terms text,
  origin_wo_id uuid references work_orders(id),  -- OS de retorno
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, number)
);
select app.apply_tenant_policies('work_orders');
create index idx_wo_tenant_status on work_orders (tenant_id, status);
create index idx_wo_vehicle on work_orders (tenant_id, vehicle_id);
create index idx_wo_customer on work_orders (tenant_id, customer_id);

-- Numeração + contador de uso + histórico de fase
create or replace function app.wo_before_insert()
returns trigger language plpgsql security definer as $$
begin
  new.number = app.next_wo_number(new.tenant_id);
  insert into usage_counters (tenant_id, period, work_orders_count)
  values (new.tenant_id, date_trunc('month', now())::date, 1)
  on conflict (tenant_id, period)
    do update set work_orders_count = usage_counters.work_orders_count + 1;
  return new;
end $$;
create trigger trg_wo_number before insert on work_orders
  for each row execute function app.wo_before_insert();

-- Enforcement de limite do plano
create or replace function app.check_wo_limit()
returns trigger language plpgsql security definer as $$
declare v_count int; v_limit int;
begin
  select coalesce(uc.work_orders_count,0), pl.max_wo_month
    into v_count, v_limit
    from tenants t
    join plan_limits pl on pl.plan = t.plan
    left join usage_counters uc
      on uc.tenant_id = t.id and uc.period = date_trunc('month', now())::date
   where t.id = new.tenant_id;
  if v_count >= v_limit then
    raise exception 'LIMIT_WO_MONTH: limite de OS do plano atingido (%). Faça upgrade.', v_limit
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_wo_limit before insert on work_orders
  for each row execute function app.check_wo_limit();

create table wo_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  from_status text, to_status text not null,
  user_id uuid references auth.users(id),
  note text,
  at timestamptz not null default now()
);
alter table wo_status_history enable row level security;
create policy hist_select on wo_status_history for select using (tenant_id = app.current_tenant_id());
create policy hist_insert on wo_status_history for insert with check (tenant_id = app.current_tenant_id());

-- Trigger: mudança de status → histórico + phase_entered_at + evento de mensagem
create or replace function app.wo_status_change()
returns trigger language plpgsql security definer as $$
begin
  if new.status is distinct from old.status then
    new.phase_entered_at = now();
    insert into wo_status_history (tenant_id, work_order_id, from_status, to_status, user_id)
    values (new.tenant_id, new.id, old.status, new.status, auth.uid());

    -- dispara mensagens automáticas via outbox (seção 1.7)
    if new.status = 'pronto' then
      perform app.enqueue_wo_event(new.tenant_id, new.id, 'wo_ready');
    elsif new.status = 'em_execucao' and old.status = 'aguardando_peca' then
      perform app.enqueue_wo_event(new.tenant_id, new.id, 'part_arrived');
    elsif new.status = 'entregue' then
      new.delivered_at = now();
      perform app.enqueue_wo_event(new.tenant_id, new.id, 'wo_delivered');
    end if;
  end if;
  return new;
end $$;
create trigger trg_wo_status before update of status on work_orders
  for each row execute function app.wo_status_change();

create table wo_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  category text not null,               -- suspensao|freios|motor|eletrica|embreagem|cambio|diferencial|pneus|hidraulica|carroceria|preventiva|outros
  description text,
  diagnosis jsonb default '{}',         -- {sintoma, causa, solucao}
  mechanic_id uuid references tenant_members(id),
  status text not null default 'pendente'
    check (status in ('pendente','aprovada','recusada','em_execucao','concluida')),
  std_hours numeric(6,2),
  labor_rate numeric(10,2),
  labor_price numeric(14,2) generated always as (coalesce(std_hours,0) * coalesce(labor_rate,0)) stored,
  quality_check jsonb,
  warranty_months int default 3,
  sort int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('wo_sections');
create index idx_sections_wo on wo_sections (work_order_id);
create index idx_sections_mechanic on wo_sections (tenant_id, mechanic_id, status);

create table wo_parts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  section_id uuid references wo_sections(id) on delete cascade,
  part_id uuid,                          -- FK adicionada na migration de estoque
  source text not null default 'estoque' check (source in ('estoque','terceiro','cliente')),
  description text not null,
  qty numeric(10,2) not null check (qty > 0),
  unit_cost numeric(14,2) default 0,
  unit_price numeric(14,2) not null default 0,
  reserved boolean default false,
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('wo_parts');
create index idx_wo_parts_wo on wo_parts (work_order_id);

create table wo_labor_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  section_id uuid references wo_sections(id) on delete cascade,
  mechanic_id uuid not null references tenant_members(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  pause_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (ended_at is null or ended_at > started_at)
);
select app.apply_tenant_policies('wo_labor_logs');
-- Só 1 apontamento aberto por mecânico
create unique index uq_open_labor_per_mechanic
  on wo_labor_logs (tenant_id, mechanic_id) where ended_at is null;

create table wo_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  section_id uuid references wo_sections(id) on delete set null,
  kind text not null check (kind in ('foto_entrada','foto_diagnostico','foto_servico','foto_saida','video','laudo','assinatura','outro')),
  storage_path text not null,
  caption text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('wo_media');

-- ============ Recalcular totais da OS ============
create or replace function app.recalc_wo_totals(p_wo uuid)
returns void language plpgsql security definer as $$
declare v_parts numeric; v_labor numeric; v_discount numeric;
begin
  select coalesce(sum(qty * unit_price) filter (where source in ('estoque','terceiro')), 0)
    into v_parts from wo_parts where work_order_id = p_wo;
  select coalesce(sum(labor_price) filter (where status <> 'recusada'), 0)
    into v_labor from wo_sections where work_order_id = p_wo;
  select coalesce((totals->>'discount')::numeric, 0) into v_discount
    from work_orders where id = p_wo;
  update work_orders
     set totals = jsonb_build_object(
       'parts', v_parts, 'labor', v_labor, 'third_party', 0,
       'discount', v_discount, 'total', v_parts + v_labor - v_discount)
   where id = p_wo;
end $$;

create or replace function app.trg_recalc_totals()
returns trigger language plpgsql security definer as $$
begin
  perform app.recalc_wo_totals(coalesce(new.work_order_id, old.work_order_id));
  return coalesce(new, old);
end $$;
create trigger trg_parts_totals after insert or update or delete on wo_parts
  for each row execute function app.trg_recalc_totals();
create trigger trg_sections_totals after insert or update or delete on wo_sections
  for each row execute function app.trg_recalc_totals();
```

### 1.5 `0005_quotes.sql`

```sql
create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','approved','partial','rejected','expired')),
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  approval_token text unique default encode(gen_random_bytes(24), 'hex'),
  approved_by_contact_id uuid references customer_contacts(id),
  approved_at timestamptz,
  approval_meta jsonb default '{}',
  rejection_reason text,
  total numeric(14,2) default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (work_order_id, version)
);
select app.apply_tenant_policies('quotes');

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  kind text not null check (kind in ('part','labor','third_party')),
  ref_id uuid,                          -- wo_parts.id ou wo_sections.id
  description text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null,
  option_group text default 'padrao',   -- "essencial" | "completo" | "padrao"
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('quote_items');

create table quote_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  channel text default 'whatsapp',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('quote_followups');
create index idx_followups_due on quote_followups (scheduled_at) where sent_at is null;

-- Ao enviar orçamento: agenda follow-ups conforme settings do tenant
create or replace function app.quote_on_sent()
returns trigger language plpgsql security definer as $$
declare h int;
begin
  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at = now();
    new.valid_until = coalesce(new.valid_until,
      (now() + make_interval(days =>
        coalesce((select (settings->>'quote_validity_days')::int from tenants where id = new.tenant_id), 7)))::date);
    for h in
      select jsonb_array_elements_text(coalesce(
        (select settings->'quote_reminder_hours' from tenants where id = new.tenant_id),
        '[24,48]'::jsonb))::int
    loop
      insert into quote_followups (tenant_id, quote_id, scheduled_at)
      values (new.tenant_id, new.id, now() + make_interval(hours => h));
    end loop;
    perform app.enqueue_wo_event(new.tenant_id, new.work_order_id, 'quote_sent');
  end if;
  return new;
end $$;
create trigger trg_quote_sent before update of status on quotes
  for each row execute function app.quote_on_sent();

-- ============ RPC pública de aprovação (chamada pela Edge Function quote-approve) ============
-- security definer, valida token; não depende de auth
create or replace function app.approve_quote(
  p_token text,
  p_item_decisions jsonb,     -- [{"item_id": "...", "status": "approved"|"rejected"}]
  p_meta jsonb                -- {ip, user_agent, channel, contact_phone}
) returns jsonb language plpgsql security definer as $$
declare q record; v_approved int := 0; v_rejected int := 0; d jsonb;
begin
  select * into q from quotes
   where approval_token = p_token
     and status in ('sent','viewed')
     and (valid_until is null or valid_until >= current_date)
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'TOKEN_INVALID_OR_EXPIRED');
  end if;

  for d in select * from jsonb_array_elements(p_item_decisions) loop
    update quote_items
       set status = d->>'status'
     where id = (d->>'item_id')::uuid and quote_id = q.id;
  end loop;

  select count(*) filter (where status = 'approved'),
         count(*) filter (where status = 'rejected')
    into v_approved, v_rejected
    from quote_items where quote_id = q.id;

  update quotes set
    status = case
      when v_rejected = 0 then 'approved'
      when v_approved = 0 then 'rejected'
      else 'partial' end,
    approved_at = now(),
    approval_meta = p_meta
  where id = q.id;

  -- Propaga para OS: seções/peças aprovadas mudam status, peças reservam estoque
  update wo_sections s set status = 'aprovada'
    from quote_items qi
   where qi.quote_id = q.id and qi.kind = 'labor'
     and qi.ref_id = s.id and qi.status = 'approved';
  update wo_sections s set status = 'recusada'
    from quote_items qi
   where qi.quote_id = q.id and qi.kind = 'labor'
     and qi.ref_id = s.id and qi.status = 'rejected';

  perform app.reserve_wo_parts(q.work_order_id);   -- definida na migration de estoque

  update work_orders
     set status = case when v_approved > 0 then 'aguardando_peca' else status end
   where id = q.work_order_id and status = 'aguardando_aprovacao' and v_approved > 0;

  if v_approved > 0 then
    perform app.enqueue_wo_event(q.tenant_id, q.work_order_id, 'quote_approved');
  end if;

  -- cancela follow-ups pendentes
  delete from quote_followups where quote_id = q.id and sent_at is null;

  return jsonb_build_object('ok', true, 'approved', v_approved, 'rejected', v_rejected);
end $$;
```

### 1.5-B `0005b_tracking.sql`

Módulo de acompanhamento público da OS (linha do tempo em tempo real, sem login).

```sql
-- ============ Token de acompanhamento público ============
-- Token separado do approval_token do orçamento: escopos diferentes
-- (este é só-leitura de status; nunca aprova nada).
alter table work_orders
  add column tracking_token text unique default encode(gen_random_bytes(20), 'hex');

-- Garante token em OS já existentes (idempotente em reruns)
update work_orders set tracking_token = encode(gen_random_bytes(20), 'hex')
 where tracking_token is null;

-- ============ Fotos marcadas para exibição pública ============
alter table wo_media
  add column public_visible boolean not null default false;

-- ============ Rótulos amigáveis das fases (para a timeline do cliente) ============
-- Fica em tenants.settings->phase_labels, mas os defaults globais ficam aqui
-- como referência de seed (usados quando o tenant não customizou):
--   recepcao              -> "Veículo recebido"
--   diagnostico           -> "Em diagnóstico"
--   orcamento              -> "Montando orçamento"
--   aguardando_aprovacao  -> "Aguardando sua aprovação"
--   aguardando_peca       -> "Aguardando peça"
--   em_execucao           -> "Em execução"
--   qualidade             -> "Controle de qualidade"
--   pronto                -> "Pronto para retirada"
--   entregue              -> "Entregue"

-- ============ View pública somente-leitura (usada pela Server Action com service_role) ============
-- Não tem RLS de tenant porque é acessada SEM JWT de usuário — a segurança
-- vem inteiramente do token (longo, aleatório, não sequencial) validado no código.
create or replace view v_public_tracking as
select
  wo.id as work_order_id,
  wo.tracking_token,
  wo.number,
  wo.status,
  wo.phase_entered_at,
  wo.promised_at,
  wo.created_at,
  t.name as workshop_name,
  t.logo_url,
  t.brand_color,
  t.settings->'kanban_phases' as phases,
  t.settings->'phase_labels' as phase_labels,
  v.plate,
  v.brand, v.model,
  c.name as customer_name,
  (select phone_e164 from customer_contacts
     where customer_id = c.id and whatsapp and not whatsapp_optout
     order by can_approve desc limit 1) as workshop_contact_phone,
  exists (
    select 1 from quotes q
     where q.work_order_id = wo.id
       and q.status in ('sent','viewed')
  ) as has_pending_quote,
  (select q.approval_token from quotes q
     where q.work_order_id = wo.id
     order by q.version desc limit 1) as pending_quote_token,
  (select array_agg(distinct s.category) from wo_sections s
     where s.work_order_id = wo.id and s.status <> 'recusada') as service_categories
from work_orders wo
join tenants t on t.id = wo.tenant_id
join vehicles v on v.id = wo.vehicle_id
join customers c on c.id = wo.customer_id;

alter view v_public_tracking set (security_invoker = false);  -- roda como dono; token é o gate

-- ============ Timeline de fases concluídas (para a linha do tempo) ============
create or replace view v_public_tracking_timeline as
select h.work_order_id, wo.tracking_token,
       h.to_status as phase, h.at
  from wo_status_history h
  join work_orders wo on wo.id = h.work_order_id
 order by h.at;
alter view v_public_tracking_timeline set (security_invoker = false);

-- ============ Fotos públicas ============
create or replace view v_public_tracking_media as
select m.work_order_id, wo.tracking_token,
       m.storage_path, m.caption, m.kind, m.created_at
  from wo_media m
  join work_orders wo on wo.id = m.work_order_id
 where m.public_visible;
alter view v_public_tracking_media set (security_invoker = false);

-- ============ Realtime para a página pública ============
-- work_orders já está na publication (0010); garantimos aqui explicitamente
-- as colunas relevantes trafegam no payload (status, phase_entered_at, promised_at).

-- ============ RPC: registrar NPS a partir da página pública ============
create or replace function app.submit_public_nps(
  p_token text, p_score int, p_comment text default null
) returns jsonb language plpgsql security definer as $$
declare wo record;
begin
  if p_score < 0 or p_score > 10 then
    return jsonb_build_object('ok', false, 'error', 'SCORE_INVALID');
  end if;
  select id, tenant_id, customer_id into wo
    from work_orders where tracking_token = p_token and status = 'entregue';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND_OR_NOT_DELIVERED');
  end if;
  insert into nps_responses (tenant_id, work_order_id, customer_id, score, comment)
  values (wo.tenant_id, wo.id, wo.customer_id, p_score, p_comment)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- ============ Rate limit simples de acesso ao token (anti-scraping) ============
create table tracking_access_log (
  id uuid primary key default gen_random_uuid(),
  tracking_token text not null,
  ip text,
  at timestamptz not null default now()
);
alter table tracking_access_log enable row level security;  -- só service_role escreve

create or replace function app.check_tracking_rate_limit(p_token text, p_ip text)
returns boolean language plpgsql security definer as $$
declare v_count int;
begin
  select count(*) into v_count from tracking_access_log
   where tracking_token = p_token and ip = p_ip and at > now() - interval '1 minute';
  insert into tracking_access_log (tracking_token, ip) values (p_token, p_ip);
  return v_count < 30;   -- 30 refresh/min por IP é folgado para uso normal, barra scraping
end $$;
```

**Nota sobre a tabela `nps_responses`:** já prevista na especificação original (seção 4.8); criar sua migration junto com esta se ainda não existir:

```sql
create table if not exists nps_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  customer_id uuid references customers(id),
  score int not null check (score between 0 and 10),
  comment text,
  created_at timestamptz default now(),
  unique (work_order_id)
);
select app.apply_tenant_policies('nps_responses');
```

---

### 1.6 `0006_inventory.sql`

```sql
create table parts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sku text not null,
  barcode text,
  description text not null,
  oem_codes text[] default '{}',
  brand text, category text,
  unit text default 'un',
  ncm text, cest text, cst text, origin int default 0,
  min_qty numeric(10,2) default 0,
  max_qty numeric(10,2),
  avg_cost numeric(14,4) default 0,
  sale_price numeric(14,2) default 0,
  margin_pct numeric(6,2),
  location text,
  photo_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, sku)
);
select app.apply_tenant_policies('parts');
create index idx_parts_desc_trgm on parts using gin (description gin_trgm_ops);
create index idx_parts_oem on parts using gin (oem_codes);
create index idx_parts_barcode on parts (tenant_id, barcode);

alter table wo_parts
  add constraint fk_wo_parts_part foreign key (part_id) references parts(id);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  kind text default 'fixo' check (kind in ('fixo','movel')),
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('warehouses');

create table stock_balances (
  tenant_id uuid not null references tenants(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade,
  qty numeric(12,2) not null default 0,
  reserved_qty numeric(12,2) not null default 0,
  primary key (warehouse_id, part_id)
);
alter table stock_balances enable row level security;
create policy sb_select on stock_balances for select using (tenant_id = app.current_tenant_id());
-- Escrita só via função (integridade)

create table stock_moves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id),
  part_id uuid not null references parts(id),
  kind text not null check (kind in ('entrada','saida_os','ajuste','devolucao','transferencia_out','transferencia_in','garantia')),
  qty numeric(12,2) not null,           -- sempre positiva; sinal vem do kind
  unit_cost numeric(14,4),
  work_order_id uuid references work_orders(id),
  user_id uuid references auth.users(id),
  note text,
  created_at timestamptz default now()
);
alter table stock_moves enable row level security;
create policy sm_select on stock_moves for select using (tenant_id = app.current_tenant_id());

-- ============ Única porta de escrita no estoque ============
create or replace function app.move_stock(
  p_warehouse uuid, p_part uuid, p_kind text, p_qty numeric,
  p_unit_cost numeric default null, p_wo uuid default null, p_note text default null
) returns void language plpgsql security definer as $$
declare v_tenant uuid := app.current_tenant_id(); v_delta numeric; v_bal record;
begin
  if v_tenant is null then
    select tenant_id into v_tenant from warehouses where id = p_warehouse; -- chamadas service_role
  end if;
  v_delta := case when p_kind in ('entrada','devolucao','transferencia_in','ajuste') and p_qty > 0 then p_qty
                  when p_kind = 'ajuste' then p_qty  -- ajuste pode ser negativo
                  else -abs(p_qty) end;

  insert into stock_balances (tenant_id, warehouse_id, part_id, qty)
  values (v_tenant, p_warehouse, p_part, 0)
  on conflict (warehouse_id, part_id) do nothing;

  select * into v_bal from stock_balances
   where warehouse_id = p_warehouse and part_id = p_part for update;

  if v_bal.qty + v_delta < 0 then
    raise exception 'STOCK_NEGATIVE: saldo insuficiente (disp: %, mov: %)', v_bal.qty, v_delta;
  end if;

  update stock_balances set qty = qty + v_delta
   where warehouse_id = p_warehouse and part_id = p_part;

  -- custo médio ponderado nas entradas
  if p_kind = 'entrada' and p_unit_cost is not null then
    update parts p set avg_cost =
      case when (v_bal.qty + p_qty) > 0
        then ((v_bal.qty * p.avg_cost) + (p_qty * p_unit_cost)) / (v_bal.qty + p_qty)
        else p_unit_cost end
    where p.id = p_part;
  end if;

  insert into stock_moves (tenant_id, warehouse_id, part_id, kind, qty, unit_cost, work_order_id, user_id, note)
  values (v_tenant, p_warehouse, p_part, p_kind, abs(p_qty), p_unit_cost, p_wo, auth.uid(), p_note);
end $$;

-- ============ Reserva de peças na aprovação ============
create or replace function app.reserve_wo_parts(p_wo uuid)
returns void language plpgsql security definer as $$
declare r record; v_wh uuid;
begin
  select w.id into v_wh from warehouses w
   join work_orders wo on wo.tenant_id = w.tenant_id
  where wo.id = p_wo and w.is_default limit 1;

  for r in
    select wp.* from wo_parts wp
     join wo_sections s on s.id = wp.section_id
    where wp.work_order_id = p_wo
      and wp.source = 'estoque' and wp.part_id is not null
      and not wp.reserved and s.status = 'aprovada'
  loop
    update stock_balances
       set reserved_qty = reserved_qty + r.qty
     where warehouse_id = v_wh and part_id = r.part_id
       and qty - reserved_qty >= r.qty;
    if found then
      update wo_parts set reserved = true where id = r.id;
    end if;
    -- sem saldo → fica reserved=false; tela de compras lista como demanda
  end loop;
end $$;

create table part_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  section_id uuid references wo_sections(id),
  part_id uuid references parts(id),
  description text not null,
  qty numeric(10,2) not null default 1,
  status text not null default 'pendente'
    check (status in ('pendente','separado','entregue','sem_estoque','cancelado')),
  requested_by uuid references tenant_members(id),
  fulfilled_by uuid references tenant_members(id),
  fulfilled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('part_requests');

-- Entrega da requisição = baixa no estoque + marca peça aplicada
create or replace function app.fulfill_part_request(p_request uuid, p_warehouse uuid)
returns void language plpgsql security definer as $$
declare r record;
begin
  select * into r from part_requests where id = p_request for update;
  if r.status <> 'separado' and r.status <> 'pendente' then
    raise exception 'REQUEST_INVALID_STATUS';
  end if;
  perform app.move_stock(p_warehouse, r.part_id, 'saida_os', r.qty, null, r.work_order_id, 'Requisição mecânico');
  update stock_balances set reserved_qty = greatest(reserved_qty - r.qty, 0)
   where warehouse_id = p_warehouse and part_id = r.part_id;
  update part_requests set status = 'entregue', fulfilled_at = now(),
         fulfilled_by = (select id from tenant_members where user_id = auth.uid() and tenant_id = r.tenant_id)
   where id = p_request;
  update wo_parts set applied_at = now()
   where work_order_id = r.work_order_id and part_id = r.part_id and applied_at is null;
end $$;
```

### 1.7 `0007_messaging.sql`

```sql
create table wa_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade unique,
  instance_name text not null unique,
  phone_e164 text,
  status text not null default 'qr_pending'
    check (status in ('qr_pending','connected','disconnected','error')),
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table wa_instances enable row level security;
create policy wai_select on wa_instances for select
  using (tenant_id = app.current_tenant_id());
-- escrita só service_role

create table wa_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_phone text not null,
  customer_id uuid references customers(id),
  contact_id uuid references customer_contacts(id),
  assigned_to uuid references tenant_members(id),
  status text not null default 'aberta' check (status in ('aberta','pendente','resolvida')),
  last_message_at timestamptz,
  unread int not null default 0,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, contact_phone)
);
select app.apply_tenant_policies('wa_conversations');
create index idx_conv_last on wa_conversations (tenant_id, last_message_at desc);

create table wa_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references wa_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  kind text not null default 'text'
    check (kind in ('text','image','audio','video','document','button_reply','list_reply')),
  body text,
  media_url text,
  evolution_message_id text,
  status text default 'queued' check (status in ('queued','sent','delivered','read','failed')),
  work_order_id uuid references work_orders(id),
  quote_id uuid references quotes(id),
  sent_by uuid references tenant_members(id),
  is_automated boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('wa_messages');
create index idx_msg_conv on wa_messages (conversation_id, created_at);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,   -- NULL = global
  event text not null,
  channel text default 'whatsapp',
  body text not null,
  active boolean default true,
  delay_minutes int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table message_templates enable row level security;
create policy tpl_select on message_templates for select
  using (tenant_id is null or tenant_id = app.current_tenant_id());
create policy tpl_write on message_templates for all
  using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'))
  with check (tenant_id = app.current_tenant_id());

-- ============ Outbox de mensagens (fila) ============
create table wa_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  to_phone text not null,
  kind text not null default 'text',
  payload jsonb not null,               -- {text} | {media_url, caption, filename} | {buttons...}
  work_order_id uuid, quote_id uuid,
  event text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempts int default 0,
  next_attempt_at timestamptz default now(),
  last_error text,
  created_at timestamptz default now()
);
alter table wa_outbox enable row level security;   -- só service_role
create index idx_outbox_due on wa_outbox (next_attempt_at) where status in ('queued','failed');

-- ============ Enfileira evento de OS → renderiza template → outbox ============
create or replace function app.enqueue_wo_event(p_tenant uuid, p_wo uuid, p_event text)
returns void language plpgsql security definer as $$
declare v_tpl record; v_wo record; v_phone text; v_body text; v_link text;
begin
  select coalesce(t_tenant.body, t_global.body) as body,
         coalesce(t_tenant.active, t_global.active, false) as active,
         coalesce(t_tenant.delay_minutes, t_global.delay_minutes, 0) as delay_minutes
    into v_tpl
    from (select 1) x
    left join message_templates t_tenant on t_tenant.tenant_id = p_tenant and t_tenant.event = p_event
    left join message_templates t_global on t_global.tenant_id is null and t_global.event = p_event;
  if v_tpl.body is null or not v_tpl.active then return; end if;

  select wo.number, wo.totals->>'total' as total, v.plate, c.name as customer_name,
         cc.phone_e164, q.approval_token, wo.tracking_token
    into v_wo
    from work_orders wo
    join vehicles v on v.id = wo.vehicle_id
    join customers c on c.id = wo.customer_id
    left join lateral (
      select phone_e164 from customer_contacts
       where customer_id = c.id and whatsapp and not whatsapp_optout
       order by can_approve desc, created_at limit 1) cc on true
    left join lateral (
      select approval_token from quotes
       where work_order_id = wo.id order by version desc limit 1) q on true
   where wo.id = p_wo;

  if v_wo.phone_e164 is null then return; end if;

  v_link := 'https://app.truckos.com.br/aprovar/' || coalesce(v_wo.approval_token, '');
  v_body := replace(replace(replace(replace(replace(replace(v_tpl.body,
    '{{cliente}}', v_wo.customer_name),
    '{{placa}}', v_wo.plate),
    '{{numero_os}}', v_wo.number::text),
    '{{valor}}', coalesce(to_char(v_wo.total::numeric, 'FM999G999G990D00'), '')),
    '{{link}}', v_link),
    '{{link_acompanhamento}}', 'https://app.truckos.com.br/acompanhar/' || v_wo.tracking_token);

  insert into wa_outbox (tenant_id, to_phone, kind, payload, work_order_id, event, next_attempt_at)
  values (p_tenant, v_wo.phone_e164, 'text', jsonb_build_object('text', v_body),
          p_wo, p_event, now() + make_interval(mins => v_tpl.delay_minutes));
end $$;
```

### 1.8 `0008_helpers_audit_storage.sql`

```sql
create table helper_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  module text not null,
  messages jsonb not null default '[]',
  context jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('helper_sessions');
-- restrição extra: usuário só vê as próprias sessões
drop policy tenant_select on helper_sessions;
create policy hs_own on helper_sessions for select
  using (tenant_id = app.current_tenant_id() and user_id = auth.uid());

create table helper_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  session_id uuid references helper_sessions(id) on delete cascade,
  helpful boolean not null,
  comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
select app.apply_tenant_policies('helper_feedback');

create table onboarding_progress (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  steps_completed text[] default '{}',
  tour_dismissed boolean default false,
  updated_at timestamptz default now(),
  primary key (tenant_id, user_id, module)
);
alter table onboarding_progress enable row level security;
create policy op_own on onboarding_progress for all
  using (tenant_id = app.current_tenant_id() and user_id = auth.uid())
  with check (tenant_id = app.current_tenant_id() and user_id = auth.uid());

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  action text not null,          -- create|update|delete|approve|impersonate|export
  entity text not null,
  entity_id uuid,
  before jsonb, after jsonb,
  ip text,
  at timestamptz not null default now()
);
alter table audit_logs enable row level security;
create policy audit_read on audit_logs for select
  using (tenant_id = app.current_tenant_id() and app.has_role('owner','manager'));
-- inserts via trigger/service_role apenas

-- Auditoria automática nas tabelas críticas
create or replace function app.audit_trigger()
returns trigger language plpgsql security definer as $$
begin
  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, before, after)
  values (
    coalesce(new.tenant_id, old.tenant_id), auth.uid(), lower(tg_op),
    tg_table_name, coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger trg_audit_wo after insert or update or delete on work_orders
  for each row execute function app.audit_trigger();
create trigger trg_audit_quotes after update on quotes
  for each row execute function app.audit_trigger();
create trigger trg_audit_customers after update or delete on customers
  for each row execute function app.audit_trigger();

-- ============ Storage buckets e políticas ============
insert into storage.buckets (id, name, public) values
  ('wo-media', 'wo-media', false),
  ('tenant-assets', 'tenant-assets', true)     -- logos (públicos p/ PDF e portal)
on conflict do nothing;

-- Path obrigatório: {tenant_id}/{work_order_id}/{filename}
create policy "wo_media_tenant_rw" on storage.objects for all
  using (
    bucket_id = 'wo-media'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
  )
  with check (
    bucket_id = 'wo-media'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
  );

create policy "tenant_assets_read" on storage.objects for select
  using (bucket_id = 'tenant-assets');
create policy "tenant_assets_write" on storage.objects for insert
  with check (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and app.has_role('owner','manager')
  );
```

### 1.9 `0009_portal_customer_policies.sql`

```sql
-- Políticas adicionais para role 'customer' (portal de frota)
-- O JWT do cliente carrega customer_id; ele enxerga APENAS o que é dele.

create or replace function app.current_customer_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'customer_id', '')::uuid;
$$;

-- Veículos da frota
create policy portal_vehicles on vehicles for select
  using (tenant_id = app.current_tenant_id()
     and customer_id = app.current_customer_id());

-- OS dos veículos dele
create policy portal_wo on work_orders for select
  using (tenant_id = app.current_tenant_id()
     and customer_id = app.current_customer_id());

create policy portal_wo_sections on wo_sections for select
  using (tenant_id = app.current_tenant_id()
     and work_order_id in (select id from work_orders
                            where customer_id = app.current_customer_id()));

create policy portal_wo_media on wo_media for select
  using (tenant_id = app.current_tenant_id()
     and work_order_id in (select id from work_orders
                            where customer_id = app.current_customer_id()));

create policy portal_quotes on quotes for select
  using (tenant_id = app.current_tenant_id()
     and work_order_id in (select id from work_orders
                            where customer_id = app.current_customer_id()));

-- IMPORTANTE: as policies acima são PERMISSIVE e se somam às de tenant.
-- Para roles internas nada muda; para 'customer', as policies de tenant
-- não aplicam (ele não passa em app.has_role de escrita) e ele só lê o escopo dele.
```

### 1.10 `0010_realtime_and_views.sql`

```sql
-- Realtime no Kanban e na caixa de entrada
alter publication supabase_realtime add table work_orders;
alter publication supabase_realtime add table wa_conversations;
alter publication supabase_realtime add table wa_messages;
alter publication supabase_realtime add table part_requests;

-- ============ Views de leitura (relatórios F1) ============

-- Painel do dia
create or replace view v_daily_board as
select wo.tenant_id,
       wo.status,
       count(*) as qty,
       sum((wo.totals->>'total')::numeric) as value,
       count(*) filter (where wo.phase_entered_at < now() - interval '8 hours') as stuck
  from work_orders wo
 where wo.status <> 'entregue'
 group by wo.tenant_id, wo.status;

-- Produtividade por mecânico (tempo padrão x real)
create or replace view v_mechanic_productivity as
select s.tenant_id,
       s.mechanic_id,
       tm.display_name,
       date_trunc('month', l.started_at)::date as period,
       sum(extract(epoch from (l.ended_at - l.started_at)) / 3600.0) as real_hours,
       sum(s.std_hours) as std_hours,
       case when sum(extract(epoch from (l.ended_at - l.started_at)) / 3600.0) > 0
         then round(100.0 * sum(s.std_hours) /
              (sum(extract(epoch from (l.ended_at - l.started_at)) / 3600.0)), 1)
         else null end as efficiency_pct
  from wo_labor_logs l
  join wo_sections s on s.id = l.section_id
  join tenant_members tm on tm.id = s.mechanic_id
 where l.ended_at is not null
 group by 1,2,3,4;

-- Conversão de orçamentos
create or replace view v_quote_conversion as
select q.tenant_id,
       date_trunc('month', q.sent_at)::date as period,
       count(*) filter (where q.status in ('sent','viewed','approved','partial','rejected','expired')) as sent,
       count(*) filter (where q.status in ('approved','partial')) as approved,
       round(100.0 * count(*) filter (where q.status in ('approved','partial'))
             / nullif(count(*),0), 1) as conversion_pct,
       avg(extract(epoch from (q.approved_at - q.sent_at))/3600.0)
         filter (where q.approved_at is not null) as avg_hours_to_approve
  from quotes q
 where q.sent_at is not null
 group by 1,2;

-- Histórico por placa (usado no check-in e pelo helper)
create or replace view v_vehicle_history as
select wo.tenant_id, wo.vehicle_id, v.plate,
       wo.id as work_order_id, wo.number, wo.delivered_at,
       wo.odometer_km, (wo.totals->>'total')::numeric as total,
       array_agg(distinct s.category) as categories
  from work_orders wo
  join vehicles v on v.id = wo.vehicle_id
  left join wo_sections s on s.work_order_id = wo.id
 where wo.status = 'entregue'
 group by 1,2,3,4,5,6,7,8;

-- Views herdam RLS das tabelas base (security_invoker default no PG15+);
-- garantir: alter view ... set (security_invoker = true);
alter view v_daily_board set (security_invoker = true);
alter view v_mechanic_productivity set (security_invoker = true);
alter view v_quote_conversion set (security_invoker = true);
alter view v_vehicle_history set (security_invoker = true);
```

---

## 2. Storage — organização

| Bucket | Público | Path | Conteúdo |
|---|---|---|---|
| `wo-media` | Não | `{tenant_id}/{wo_id}/{uuid}.jpg` | Fotos/vídeos/assinaturas de OS |
| `tenant-assets` | Sim (read) | `{tenant_id}/logo.png` | Logo, materiais de marca |
| `quotes-pdf` | Não (signed URL 7d) | `{tenant_id}/{quote_id}.pdf` | PDFs de orçamento gerados |

Upload de foto no mobile: comprimir client-side (max 1600px, ~200KB) antes do upload — mecânico está no 4G do pátio.

---

## 3. Seed — `seed.sql` (dados globais)

```sql
-- ============ Templates globais de mensagem ============
insert into message_templates (tenant_id, event, body, active, delay_minutes) values
(null, 'wo_created',
 E'Olá {{cliente}}! 👋\nRecebemos seu veículo *{{placa}}* aqui na oficina.\nSua ordem de serviço é a *#{{numero_os}}*.\nVamos avaliar e te enviamos o orçamento por aqui mesmo.',
 true, 0),
(null, 'quote_sent',
 E'{{cliente}}, seu orçamento da OS *#{{numero_os}}* ({{placa}}) está pronto! 📋\nValor total: *R$ {{valor}}*\n\nVeja os detalhes e aprove por aqui:\n{{link}}',
 true, 0),
(null, 'quote_reminder',
 E'Oi {{cliente}}! Passando pra lembrar do orçamento do veículo *{{placa}}* (OS #{{numero_os}}).\nQualquer dúvida sobre os itens, é só responder aqui. 😊\n{{link}}',
 true, 0),
(null, 'quote_approved',
 E'Aprovação recebida, {{cliente}}! ✅\nJá estamos providenciando o serviço do *{{placa}}*.\nTe aviso aqui a cada etapa.',
 true, 0),
(null, 'part_arrived',
 E'Boa notícia, {{cliente}}! A peça do *{{placa}}* chegou e o serviço já está em execução. 🔧',
 true, 0),
(null, 'wo_ready',
 E'{{cliente}}, seu veículo *{{placa}}* está PRONTO! 🚛✨\nOS #{{numero_os}} — Total: *R$ {{valor}}*\nPode retirar no horário comercial.',
 true, 0),
(null, 'wo_delivered',
 E'Obrigado pela confiança, {{cliente}}! 🙏\nSegue em anexo a nota e o certificado de garantia da OS #{{numero_os}}.\nQualquer coisa com o *{{placa}}*, estamos aqui.',
 true, 0),
(null, 'nps',
 E'{{cliente}}, de 0 a 10, qual a chance de você indicar nossa oficina para outro transportador?\nÉ só responder com o número. Sua opinião melhora nosso serviço! 🙌',
 true, 1440);

-- ============ Catálogo semente de serviços (amostra — completo tem ~200) ============
create table if not exists service_catalog_seed (
  category text, description text, std_hours numeric
);
insert into service_catalog_seed values
('freios','Substituição de lonas de freio (por eixo)',2.5),
('freios','Substituição de tambor de freio (por roda)',1.5),
('freios','Regulagem geral de freios',1.0),
('freios','Substituição de catraca de freio',0.8),
('freios','Revisão de cuíca / câmara de freio',1.0),
('suspensao','Substituição de feixe de molas dianteiro (por lado)',3.0),
('suspensao','Substituição de feixe de molas traseiro (por lado)',4.0),
('suspensao','Substituição de bolsa de ar (suspensor)',1.5),
('suspensao','Substituição de amortecedor (par)',1.2),
('suspensao','Substituição de jumelo/pino de mola',2.0),
('motor','Troca de óleo e filtros (lubrificação completa)',1.5),
('motor','Substituição de bomba d''água',3.5),
('motor','Regulagem de válvulas',4.0),
('motor','Substituição de turbina',5.0),
('motor','Diagnóstico eletrônico (scanner)',1.0),
('embreagem','Substituição de conjunto de embreagem',8.0),
('embreagem','Substituição de atuador/servo de embreagem',2.0),
('eletrica','Diagnóstico elétrico geral',1.5),
('eletrica','Substituição de alternador',2.0),
('eletrica','Substituição de motor de partida',2.0),
('cambio','Troca de óleo de câmbio e diferencial',1.5),
('diferencial','Revisão de diferencial',8.0),
('quinta_roda','Revisão e lubrificação de 5ª roda',1.0),
('carreta','Revisão de sistema de freios da carreta',3.0),
('carreta','Substituição de rolamento de cubo (por roda)',2.0),
('preventiva','Revisão preventiva 30.000 km',6.0),
('preventiva','Inspeção de viagem (checklist 40 itens)',1.5);

-- ============ Checklist de entrada padrão ============
-- (armazenado em tenants.settings->checkin_checklist no onboarding; modelo:)
-- ["Fotos 4 cantos","Documento do veículo","Nível combustível","Avarias lataria",
--  "Estado dos pneus","Tacógrafo","Extintor","Pertences na cabine","Assinatura motorista"]
```

---

## 4. Edge Functions — especificação

### 4.1 `wa-webhook` (recebe da Evolution API)

```
POST /functions/v1/wa-webhook?tenant={tenant_id}
Headers: x-webhook-secret

Fluxo:
1. Busca wa_instances por tenant → valida secret (comparação constante). 401 se inválido.
2. Switch por payload.event:
   - "qrcode.updated"        → repassa QR via Realtime channel `wa:{tenant}` (front exibe)
   - "connection.update"     → atualiza wa_instances.status; se 'close', cria alerta
   - "messages.upsert" (in)  → processa mensagem recebida:
       a. Normaliza telefone (E.164)
       b. upsert wa_conversations (unread++, last_message_at)
       c. Match customer_contacts por telefone → vincula customer/contact
       d. Se kind = button_reply/list_reply relacionado a quote → chama app.approve_quote
       e. Se texto e conversa vinculada a OS ativa → notifica atendente (Realtime + push)
       f. Se texto = "PARAR"/"SAIR" → whatsapp_optout = true no contato
       g. Insere wa_messages (direction='in')
   - "messages.update"       → atualiza status (delivered/read) por evolution_message_id
3. Sempre 200 (Evolution reenvia em erro; idempotência por evolution_message_id unique-ish).
```

### 4.2 `wa-send` (processador da outbox — invocada por cron a cada minuto)

```
Fluxo:
1. SELECT ... FROM wa_outbox WHERE status IN ('queued','failed')
   AND next_attempt_at <= now() ORDER BY created_at LIMIT 20
   FOR UPDATE SKIP LOCKED;
2. Para cada item:
   a. Carrega wa_instances do tenant; se status != 'connected' → adia 10 min (max 24h, depois 'skipped')
   b. Respeita janela de envio do tenant (settings.send_window); fora dela → next_attempt = próxima janela
   c. Jitter 2–8s entre envios da MESMA instância (anti-ban)
   d. Chama Evolution:
      - text  → POST /message/sendText/{instance}
      - media → POST /message/sendMedia/{instance}  (PDF orçamento: gera signed URL do bucket)
   e. Sucesso → status='sent', grava wa_messages(out, is_automated=true), messages_sent++ em usage_counters
   f. Falha → attempts++, next_attempt = now() + 2^attempts min; attempts>5 → 'failed' definitivo + alerta
```

### 4.3 `wa-monitor` (cron 5 min)

```
Para cada wa_instances: GET /instance/connectionState/{instance}
→ diverge do banco? atualiza. Caiu? notifica owner (e-mail + banner no app):
  "Seu WhatsApp desconectou. Reconecte para não perder as mensagens automáticas."
```

### 4.4 `stripe-webhook`

```
POST /functions/v1/stripe-webhook
1. Verifica assinatura (STRIPE_WEBHOOK_SECRET).
2. INSERT subscription_events (stripe_event_id UNIQUE) → conflito = já processado, 200.
3. Switch event.type:
   - checkout.session.completed → tenants: stripe_customer_id, stripe_subscription_id, plan (do price)
   - customer.subscription.updated → sincroniza plan + status
   - invoice.paid                → status='active'
   - invoice.payment_failed      → status='past_due' + enfileira e-mail/WhatsApp de cobrança
   - customer.subscription.deleted → status='canceled' → job marca 'readonly' e agenda expurgo D+90
4. UPDATE processed_at.
```

### 4.5 `quote-approve` (página pública de aprovação)

```
GET  /aprovar/{token}  (página Next.js, não Edge Function)
  → Server Component busca via service_role: quote + items + fotos do diagnóstico
  → marca viewed_at/status='viewed' (primeira visualização)
  → UI: logo da oficina, itens agrupados por seção com fotos, toggle por item,
    total dinâmico, botões [Aprovar selecionados] [Recusar tudo]
  → Recusa pede motivo (select: preço | prazo | vou fazer depois | outro)

POST /functions/v1/quote-approve
  Body: {token, decisions[], rejection_reason?}
  → chama app.approve_quote(token, decisions, meta{ip, ua, channel:'link'})
  → retorna resultado; front mostra confirmação
```

### 4.5-B Página pública `/acompanhar/[token]` (rastreamento em tempo real)

Não é uma Edge Function separada — é uma rota Next.js (Server Component + Client Component para o Realtime), mas documentada aqui porque compartilha o mesmo padrão de segurança "sem JWT, protegido por token" das rotas 4.5.

```
GET /acompanhar/{token}

1. Server Component busca via service_role (bypassa RLS deliberadamente,
   igual à página de aprovação):
   SELECT * FROM v_public_tracking WHERE tracking_token = {token}
   → 404 amigável se não encontrar ("Link inválido ou expirado")
   → chama app.check_tracking_rate_limit(token, ip) antes de consultar;
     estourou o limite → 429 com mensagem simples

2. Monta a timeline:
   - Fases já percorridas: v_public_tracking_timeline (histórico real)
   - Fase atual: destacada, com tempo decorrido desde phase_entered_at
   - Fases futuras: em cinza, na ordem de tenants.settings.kanban_phases
   - Rótulos amigáveis: settings.phase_labels (fallback nos defaults da seed)

3. Client Component assina Realtime via canal broadcast dedicado
   (não Postgres Changes direto na tabela, para não precisar abrir
   RLS pública em work_orders):
   supabase.channel(`tracking:${token}`)
     .on('broadcast', { event: 'status_update' }, (payload) => {
        // atualiza a timeline em tela sem reload
     })
     .subscribe()

4. Seções da página:
   a. Header: logo/cor do tenant, placa, "OS #{number}"
   b. Linha do tempo vertical (mobile) / horizontal (desktop)
   c. Card de previsão (promised_at) com badge verde/amarelo/vermelho
   d. Se has_pending_quote: banner "Orçamento aguardando aprovação" → /aprovar/{pending_quote_token}
   e. Galeria de fotos públicas (v_public_tracking_media), lightbox simples
   f. Se status = entregue: resumo de serviços (service_categories) + widget de NPS (0-10)
      → POST para app.submit_public_nps(token, score, comment)
   g. Botão flutuante "Falar com a oficina" → wa.me/{workshop_contact_phone}
      com texto pré-preenchido "Olá, sobre a OS #{number} do veículo {placa}"

5. Cache: revalidate curto (ISR de 15s) como fallback caso o Realtime
   falhe (rede ruim no pátio do cliente); a página sempre funciona mesmo
   sem websocket, só fica um pouco menos instantânea.
```

**Edge Function `wo-status-broadcast`** (chamada pelo trigger `app.wo_status_change` via `pg_net`, ou por um listener leve na fila de eventos):
```
Ao mudar status de uma OS:
→ supabase.channel(`tracking:${tracking_token}`).send({
     type: 'broadcast', event: 'status_update',
     payload: { status, phase_entered_at, promised_at }
   })
O client da página pública só escuta o canal do PRÓPRIO token — nunca
tem acesso de leitura direto à tabela work_orders.
```

**Segurança do módulo:**
- Token de 20 bytes (160 bits) — não é sequencial, não é adivinhável por força bruta em prazo relevante.
- Página nunca expõe: valores financeiros detalhados antes da aprovação, dados de outros veículos/clientes, telefone de terceiros, custo de peças.
- Rate limit por IP (`check_tracking_rate_limit`) previne scraping em massa de OS.
- Token de acompanhamento é diferente do token de aprovação (`quotes.approval_token`): vazamento de um link de status não permite aprovar orçamento.
- `robots.txt` bloqueia indexação de `/acompanhar/*` e `/aprovar/*`.

### 4.6 `helper-chat`

```
POST /functions/v1/helper-chat
Body: {module, message, session_id?, context{route, record_id}}
1. Autentica usuário (JWT) → tenant + role.
2. Monta system prompt: persona do helper + doc do módulo (RAG nos markdowns de apps/docs)
   + contexto da tela + REGRAS (não inventa dados; não promete recursos de outro plano).
3. Tools read-only expostas ao Claude (executadas com o JWT DO USUÁRIO → RLS herda):
   - get_wo(id) | get_vehicle_history(plate) | search_customers(q)
   - stock_lookup(q) | quote_stats(period) | idle_parts(days)
4. Streaming da resposta (SSE) → salva em helper_sessions.messages.
5. Rate limit: 30 msgs/usuário/hora; plano sem helper_ai → responde só com o tour/doc.
```

### 4.7 `jobs-cron` (cron diário 07:00 + horário)

```
A cada hora:
- Follow-ups de orçamento vencidos (quote_followups sem sent_at e scheduled_at <= now())
  → enfileira template 'quote_reminder' → marca sent_at
- Orçamentos com valid_until < hoje e status sent/viewed → status='expired'

Diário 07:00 (fuso do tenant):
- OS paradas na mesma fase > 8h úteis → notificação ao gestor (digest)
- Trial: D+1/D+7/D+23/D+29 → e-mails da régua (Resend) conforme trial_ends_at
- trial_ends_at < now() e sem assinatura → tenants.status = 'readonly'
```

---

## 5. PRD — Módulo Ordens de Serviço (tela a tela)

### 5.1 Tela: Kanban (`/os`)

**Objetivo:** visão de guerra da oficina; o gestor entende o dia em 5 segundos.

**Layout:**
- Desktop: colunas horizontais (fases do tenant); Mobile: tabs por fase + swipe.
- Header: busca por placa/cliente/nº OS (fuzzy, pg_trgm), filtros (mecânico, prioridade, atrasadas), botão `+ Check-in`.
- Card da OS: `#1042 · ABC1D23`, nome do cliente, badges (prioridade, ⚠ atrasada se `phase_entered_at > 8h`), avatar do mecânico, valor total, ícone 💬 se há mensagem não lida vinculada.

**Comportamento:**
- Realtime: subscribe em `work_orders` do tenant; card muda de coluna sem refresh.
- Drag & drop muda `status` (mobile: botão "mover para..." no card).
- Regras de transição (validadas em Server Action, erro → toast):
  - → `aguardando_aprovacao` exige quote com status `sent`
  - → `em_execucao` exige ≥1 seção `aprovada` com mecânico designado
  - → `pronto` exige `quality_check` preenchido em todas as seções concluídas
  - → `entregue` exige confirmação (modal com forma de pagamento F1: registro simples)
- Contador no topo de cada coluna: qtde + soma R$.

**Critérios de aceite:**
- [ ] Mudança de fase reflete em outro dispositivo em < 2s (Realtime)
- [ ] Transições inválidas bloqueadas com mensagem clara do que falta
- [ ] Busca por fragmento de placa ("1D23") encontra a OS
- [ ] 200 OS ativas renderizam sem jank (virtualização de lista)

### 5.2 Tela: Check-in (`/checkin`) — mobile-first

**Fluxo em 5 passos (stepper):**
1. **Placa** — input grande com máscara Mercosul/antiga; ao digitar 4+ chars busca veículo. Existe → mostra card do veículo + histórico resumido (últimas 3 OS via `v_vehicle_history`) + hodômetro anterior. Não existe → mini-form (cliente novo ou existente, marca/modelo/ano/tipo).
2. **Condições** — hodômetro (valida ≥ anterior; alerta se menor), nível de combustível (5 botões), box/pátio.
3. **Defeito** — textarea + botão de gravação de áudio (upload → transcrição async preenche `reported_issue`); chips de sintomas comuns (freio, suspensão, motor, elétrica...).
4. **Checklist + fotos** — itens do checklist do tenant, cada um com toggle OK/Avaria; avaria abre câmera obrigatória. Mínimo 4 fotos (4 cantos) para avançar.
5. **Assinatura** — canvas de assinatura do motorista + nome; botão **Criar OS**.

**Ao criar:** OS em `recepcao`, evento `wo_created` enfileirado (WhatsApp automático), redireciona para a OS.

**Critérios de aceite:**
- [ ] Check-in completo de veículo já cadastrado em < 3 min
- [ ] Fotos comprimidas client-side; funciona offline-tolerante (retry de upload)
- [ ] Cliente recebe WhatsApp em < 1 min após criação
- [ ] Hodômetro menor que o anterior exige confirmação explícita

### 5.3 Tela: Detalhe da OS (`/os/[id]`)

**Estrutura em abas:** Resumo · Seções & Peças · Orçamento · Fotos · Mensagens · Histórico

- **Resumo:** cabeçalho (placa, cliente, fase com stepper visual, previsão, prioridade), totais, alertas do helper ("sem mecânico designado", "margem 12% — abaixo do mínimo 25%").
- **Seções & Peças:** lista de `wo_sections` (accordion). Cada seção: categoria, diagnóstico (sintoma/causa/solução), mecânico (select), tempo padrão (sugestão do catálogo), peças (busca no estoque com saldo visível, ou item avulso), botão `+ Seção`.
- **Orçamento:** monta `quote` a partir das seções; preview do PDF; botão **Enviar por WhatsApp** (mostra para qual contato vai; permite escolher outro `can_approve`); status do envio/leitura/aprovação em tempo real; botão reenviar/nova versão.
- **Fotos:** grid por etapa (entrada/diagnóstico/serviço/saída) com upload múltiplo.
- **Mensagens:** thread das `wa_messages` vinculadas à OS; responder daqui mesmo.
- **Histórico:** `wo_status_history` + `audit_logs` da OS (quem fez o quê, quando).

**Visão do mecânico (role `mechanic`)** — mesma rota, UI reduzida:
- Vê apenas suas seções; botões grandes: **▶ Iniciar** / **⏸ Pausar** (motivo) / **✔ Concluir** (abre quality_check).
- Botão **Pedir peça** → cria `part_requests` (busca peça, qtde) → notifica estoque.
- Câmera direto na seção.

**Critérios de aceite:**
- [ ] Mecânico só tem 1 apontamento aberto por vez (constraint testada na UI e no banco)
- [ ] Concluir seção sem quality_check preenchido → bloqueado
- [ ] Aprovação do cliente reflete na aba Orçamento em tempo real
- [ ] Requisição de peça chega ao estoque com beep/notificação em < 2s

### 5.4 Tela pública: Aprovação (`/aprovar/[token]`)

- Header com logo/cor do tenant. Itens agrupados por seção, com foto do problema ao lado (isso converte: cliente VÊ a lona gasta).
- Toggle por item (aprovar/recusar), total recalcula ao vivo.
- Botões: **Aprovar selecionados** (verde, grande) · Recusar tudo (link discreto, pede motivo).
- Confirmação: "Aprovado! A oficina já foi avisada." + resumo do aprovado.
- Token expirado → tela pedindo contato com a oficina (link wa.me).
- Sem login. Mobile-first (o cliente abre no WhatsApp).

**Critérios de aceite:**
- [ ] Página abre em < 2s no 4G; funciona em WebView do WhatsApp
- [ ] Dupla submissão impossível (token vira consumido; idempotência na RPC)
- [ ] `approval_meta` grava IP, user-agent e canal

### 5.4-B Tela pública: Acompanhamento (`/acompanhar/[token]`)

**Objetivo:** o cliente abre o link recebido no WhatsApp e entende, em 3 segundos, onde o veículo dele está — sem login, sem esperar resposta de ninguém.

**Layout (mobile-first, mesma linguagem visual da tela de aprovação):**
- Header com logo/cor da oficina + placa + nº da OS.
- **Linha do tempo vertical** com um ponto por fase:
  - ✅ fase concluída (cinza-escuro, com horário: "Recebido às 08:14")
  - 🔵 fase atual (destacada, cor da marca, com "há 2h35min nesta etapa")
  - ⚪ fases futuras (cinza-claro)
- Card de previsão: "Previsão de entrega: hoje às 17h" — verde se dentro do prazo, amarelo se está próximo, vermelho se passou (tom não acusatório: "Estamos um pouco além do previsto, já avisamos o consultor").
- Banner condicional de orçamento pendente (alto contraste, no topo, acima da timeline — é a ação mais importante quando existe).
- Galeria de fotos (se houver fotos marcadas como públicas) — carrossel simples.
- Quando `status = entregue`: bloco de encerramento com resumo dos serviços feitos (por categoria, sem detalhar peça por peça) + nota 0-10 de avaliação.
- Botão flutuante fixo no rodapé: "💬 Falar com a oficina".
- Rodapé discreto: "Powered by TruckOS" (link para a landing — canal de aquisição orgânico: cada cliente final que recebe o link vê o produto).

**Comportamento:**
- Atualiza sozinha quando a fase muda no Kanban da oficina (broadcast Realtime); sem broadcast disponível, atualiza a cada 15s via revalidação.
- Nenhum dado sensível (valores antes da aprovação, telefone de terceiros, custo) é exibido.
- Se o token não existir/expirar: tela amigável "Não encontramos esse acompanhamento. Fale com a oficina" + botão WhatsApp genérico do tenant.
- Funciona perfeitamente dentro do WebView do WhatsApp (sem popups, sem redirecionamentos externos além do wa.me).

**Critérios de aceite:**
- [ ] Link chega automaticamente no WhatsApp junto com a confirmação de recepção do veículo
- [ ] Mudança de fase no Kanban reflete na página pública em < 3s
- [ ] Página não expõe nenhum dado de outro cliente/veículo mesmo testando manualmente com token de outra OS
- [ ] Funciona sem JS de terceiros bloqueado (WebView do WhatsApp é restritivo)
- [ ] Rate limit bloqueia > 30 acessos/min do mesmo IP sem quebrar o uso normal
- [ ] NPS só pode ser enviado uma vez por OS (constraint `unique(work_order_id)`)

### 5.5 Estados e mensagens de erro (padrão do módulo)

| Situação | Mensagem UI |
|---|---|
| Limite de OS do plano | "Você atingiu as {N} OS do plano {plano} este mês. Fazer upgrade →" |
| WhatsApp desconectado | Banner persistente: "WhatsApp desconectado — mensagens em fila. Reconectar →" |
| Estoque insuficiente na reserva | Badge na peça: "Sem saldo — vai para compras" |
| Transição inválida | "Para mover para Em Execução, designe um mecânico na seção Freios." |
| Token de acompanhamento inválido/expirado | "Não encontramos esse acompanhamento. Fale com a oficina →" |

---

## 6. PRD resumido — demais telas da Fase 1

### 6.1 Clientes (`/clientes`, `/clientes/[id]`)
- Lista com busca fuzzy, tags, saldo em aberto (F2), botão novo (PF/PJ, CNPJ consulta BrasilAPI e preenche).
- Detalhe: dados, contatos (com flag `can_approve` e WhatsApp), veículos da frota (cards com última OS e hodômetro), histórico de OS, condições comerciais.
- Ação rápida: "Nova OS para este cliente" (pula passo 1 do check-in).

### 6.2 Estoque (`/estoque`)
- Lista de peças: busca por descrição/SKU/OEM/código de barras (input aceita leitor), saldo, reservado, mínimo (linha vermelha se abaixo), preço.
- Detalhe da peça: dados, aplicações, movimentações (kardex), ajuste manual (motivo obrigatório).
- Fila de requisições (`part_requests`): pendentes ordenadas por prioridade da OS, botão "Separar" → "Entregar" (chama `app.fulfill_part_request`).
- Demandas de compra: peças aprovadas sem saldo (reserved=false após aprovação) agrupadas — em F1 é uma lista exportável; compras completas na F2.

### 6.3 Caixa de entrada WhatsApp (`/whatsapp`)
- Layout 2 colunas (mobile: navegação em pilha): conversas (avatar, nome/telefone, preview, unread, tag da OS ativa) + thread.
- Thread: mensagens in/out, indicador entregue/lido, contexto lateral (cliente, OS abertas — clique navega).
- Responder: texto, anexo, templates rápidos (/), atribuir conversa a colega, marcar resolvida.
- Filtros: minhas | não atribuídas | todas.

### 6.4 Configurações (`/configuracoes`)
- Oficina: dados, logo, cor, fases do kanban (reordenar/renomear), checklist de entrada, margem mínima, janela de envio.
- Equipe: convites por e-mail (role), custo/hora do mecânico, ativar/desativar.
- WhatsApp: card de conexão (QR ao vivo via Realtime), status, templates de mensagem (editor com preview das variáveis).
- Assinatura: plano atual, uso do mês (OS, mensagens), botão Stripe Customer Portal, upgrade.

### 6.5 Relatórios F1 (`/relatorios`)
- Painel do dia (v_daily_board): funil por fase + valor + travadas.
- Produtividade (v_mechanic_productivity): tabela + gráfico eficiência % por mecânico.
- Conversão de orçamentos (v_quote_conversion): taxa, tempo médio de aprovação, motivos de recusa.
- Exportar XLSX em todos.

---

## 7. Testes de isolamento multi-tenant (obrigatórios no CI)

```sql
-- pgTAP ou script: cria tenant A e B, usuário em cada, e verifica:
-- 1. SELECT em work_orders com JWT do tenant A não retorna linhas do B
-- 2. INSERT forjando tenant_id do B com JWT do A → linha cai no A (force_tenant_id)
-- 3. UPDATE em customers do B com JWT do A → 0 rows
-- 4. Storage: upload em path do B com JWT do A → negado
-- 5. app.approve_quote com token do A não afeta quotes do B
-- 6. Usuário role 'customer' só lê OS do próprio customer_id
-- 7. View v_vehicle_history respeita RLS (security_invoker)
-- 8. tracking_token de OS do tenant A não retorna dado algum ao consultar
--    v_public_tracking com token de OS do tenant B; broadcast do canal
--    tracking:{token} só chega a quem assinou aquele token específico
-- 9. app.submit_public_nps não permite 2 registros para a mesma work_order_id
--    (constraint unique) e rejeita score fora de 0-10
```

Suíte roda em cada PR. **Nenhum deploy passa com teste de isolamento falhando.**

---

## 8. Variáveis de ambiente

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY            # só em Edge Functions/servidor

# Evolution API
EVOLUTION_BASE_URL                   # https://evo.suainfra.com.br
EVOLUTION_API_KEY                    # global key (criação de instâncias)

# Stripe
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO / STRIPE_PRICE_FLEET  # price IDs

# IA / e-mail
ANTHROPIC_API_KEY
RESEND_API_KEY

# App
NEXT_PUBLIC_APP_URL                  # https://app.truckos.com.br
```

---

## 9. Ordem de construção sugerida (sprints de 1 semana)

| Sprint | Entrega | Validação |
|---|---|---|
| 1 | Migrations 0001–0003 + auth hook + login/cadastro + criação de tenant | Testes de isolamento passando |
| 2 | Clientes + veículos + check-in mobile completo | Check-in real em < 3 min |
| 3 | Migrations 0004 + Kanban Realtime + detalhe da OS | Fluxo recepção→diagnóstico |
| 4 | Migrations 0005 + orçamento + página pública de aprovação | Aprovar pelo celular funciona |
| 4-B | Migration 0005b + página pública `/acompanhar/[token]` + broadcast Realtime | Cliente vê a fase mudar ao vivo em 2 dispositivos de teste |
| 5 | Evolution API (0007 + wa-webhook + wa-send + QR no onboarding) | Mensagens automáticas chegando, incluindo link de acompanhamento no `wo_created` |
| 6 | Estoque (0006) + requisição do mecânico + apontamento de tempo | Baixa vinculada à OS |
| 7 | Stripe (checkout + webhook + enforcement) + réguas de trial | Trial→pago funcionando em test mode |
| 8 | Relatórios F1 + caixa de entrada WhatsApp + configurações | — |
| 9 | Helper (tour + chat com tools) + docs dos módulos | Helper responde com dados reais do tenant |
| 10 | Landing page + hardening (testes E2E, LGPD, backups) | Beta com 2–3 oficinas piloto |

**Recomendação de go-to-market:** valide com 2–3 oficinas de Uberlândia/região como pilotos gratuitos vitalícios em troca de feedback semanal — você tem rede no setor de construção/transporte para chegar nelas. Depoimento delas vira a prova social da landing.
