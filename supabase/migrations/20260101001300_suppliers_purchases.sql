-- =====================================================================
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
  with check (tenant_id in (select public.current_tenants()));