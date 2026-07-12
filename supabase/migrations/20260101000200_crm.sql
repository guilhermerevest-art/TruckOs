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
  with check (tenant_id in (select public.current_tenants()));