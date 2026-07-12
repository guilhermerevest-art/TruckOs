-- =====================================================================
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
  with check (tenant_id in (select public.current_tenants()));