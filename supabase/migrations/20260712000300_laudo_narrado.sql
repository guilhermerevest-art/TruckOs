-- =====================================================================
-- TruckOS — 20260712000300_laudo_narrado.sql
-- Laudo Tecnico Narrado: mecanico grava/dita, IA estrutura em versao
-- tecnica (arquivo) e versao para leigo (cliente). Ver Bloco A3 do MD.
-- =====================================================================

create table public.wo_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  transcript text not null,
  laudo_tecnico text not null,
  laudo_cliente text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wo_reports_wo on public.wo_reports(work_order_id, created_at desc);

create trigger trg_wo_reports_updated_at
  before update on public.wo_reports
  for each row execute function public.set_updated_at();

alter table public.wo_reports enable row level security;

create policy "wo_reports_tenant_isolation" on public.wo_reports
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- Expor a versao "cliente" na pagina publica de acompanhamento
create or replace function public.public_work_order_reports(p_token text)
returns table (laudo_cliente text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.laudo_cliente, r.created_at
  from public.wo_reports r
  join public.work_orders wo on wo.id = r.work_order_id
  where wo.public_token = p_token
  order by r.created_at desc;
$$;

grant execute on function public.public_work_order_reports to anon, authenticated;
