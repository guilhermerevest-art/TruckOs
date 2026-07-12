-- =====================================================================
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
  with check (tenant_id in (select public.current_tenants()));