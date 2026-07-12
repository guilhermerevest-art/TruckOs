-- =====================================================================
-- TruckOS — 20260712000800_garantias.sql
-- Central de Garantias de Fabricante. Ver Bloco D2 do MD.
-- =====================================================================

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  wo_part_id uuid references public.wo_parts(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  part_description text not null,
  failure_description text,
  photo_urls text[] default '{}',
  status text not null default 'aberto'
    check (status in ('aberto','enviado','em_analise','aprovado','rejeitado','creditado')),
  claim_value numeric(12,2) default 0,
  credited_value numeric(12,2),
  response_deadline date,
  credited_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_warranty_claims_tenant_status on public.warranty_claims(tenant_id, status);
create index idx_warranty_claims_supplier on public.warranty_claims(supplier_id);

create trigger trg_warranty_claims_updated_at
  before update on public.warranty_claims
  for each row execute function public.set_updated_at();

alter table public.warranty_claims enable row level security;

create policy "warranty_claims_tenant_isolation" on public.warranty_claims
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));
