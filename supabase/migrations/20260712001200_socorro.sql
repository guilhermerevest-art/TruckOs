-- =====================================================================
-- TruckOS — 20260712001200_socorro.sql
-- Socorro & Oficina Movel. Ver Bloco D3 do MD.
-- Nota de escopo: apontamento offline-first do socorrista (fila local +
-- sync) nao esta implementado aqui — exigiria um service worker com
-- fila de mutacoes, que este projeto ainda nao tem (o sw.js atual so
-- cacheia assets estaticos). O restante do fluxo (chamado publico,
-- triagem por IA, despacho, OS de campo, taxa de deslocamento) sim.
-- =====================================================================

create table public.roadside_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  contact_phone text not null,
  contact_name text,
  reported_issue text not null,
  location_lat numeric(9,6),
  location_lng numeric(9,6),
  location_link text,
  status text not null default 'aberto'
    check (status in ('aberto','despachado','em_atendimento','concluido','cancelado')),
  dispatched_vehicle text,
  suggested_checklist jsonb,
  dispatched_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  distance_km numeric(8,2),
  travel_fee numeric(12,2),
  work_order_id uuid references public.work_orders(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_roadside_calls_tenant_status on public.roadside_calls(tenant_id, status);

create trigger trg_roadside_calls_updated_at
  before update on public.roadside_calls
  for each row execute function public.set_updated_at();

alter table public.roadside_calls enable row level security;

create policy "roadside_calls_tenant_isolation" on public.roadside_calls
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- RPC publica: motorista/frota abre chamado de emergencia (sem login),
-- mesmo padrao de public_quote_approve — so escreve, nunca le dados
-- sensiveis de volta.
-- ---------------------------------------------------------------------
create or replace function public.public_create_roadside_call(
  p_tenant_slug text,
  p_contact_phone text,
  p_contact_name text,
  p_reported_issue text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_location_link text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_customer_id uuid;
  v_call_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = p_tenant_slug;
  if v_tenant_id is null then
    raise exception 'tenant_not_found';
  end if;

  select c.id into v_customer_id
  from public.customers c
  join public.customer_contacts cc on cc.customer_id = c.id
  where c.tenant_id = v_tenant_id and cc.phone_e164 = p_contact_phone
  limit 1;

  insert into public.roadside_calls
    (tenant_id, customer_id, contact_phone, contact_name, reported_issue, location_lat, location_lng, location_link)
  values
    (v_tenant_id, v_customer_id, p_contact_phone, p_contact_name, p_reported_issue, p_location_lat, p_location_lng, p_location_link)
  returning id into v_call_id;

  return v_call_id;
end;
$$;

grant execute on function public.public_create_roadside_call to anon, authenticated;
