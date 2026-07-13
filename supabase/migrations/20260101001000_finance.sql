-- =====================================================================
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
  member_id uuid references auth.users(id) on delete set null,
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
  with check (tenant_id in (select public.current_tenants()));