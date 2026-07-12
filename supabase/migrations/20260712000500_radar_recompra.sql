-- =====================================================================
-- TruckOS — 20260712000500_radar_recompra.sql
-- Radar de Recompra (B2) + Recall & Campanhas de Fabricante (B3).
-- =====================================================================

create table public.repurchase_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  category text not null,
  description text not null,
  predicted_at date,
  confidence int not null default 50,
  estimated_value numeric(12,2) not null default 0,
  status text not null default 'prevista'
    check (status in ('prevista','contatada','agendada','convertida','descartada')),
  source text not null default 'radar' check (source in ('radar','dvi','manual')),
  converted_wo_id uuid references public.work_orders(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_repurchase_tenant_status on public.repurchase_opportunities(tenant_id, status);
create index idx_repurchase_vehicle_category on public.repurchase_opportunities(vehicle_id, category);

create trigger trg_repurchase_updated_at
  before update on public.repurchase_opportunities
  for each row execute function public.set_updated_at();

alter table public.repurchase_opportunities enable row level security;

create policy "repurchase_opportunities_tenant_isolation" on public.repurchase_opportunities
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- RPC: recalcula o radar do tenant (chamada manual pelo botao "Atualizar
-- radar" — nao ha cron real neste projeto ainda, mesmo padrao usado em
-- refresh_pm_status / followup de orcamentos).
-- ---------------------------------------------------------------------
create or replace function public.compute_repurchase_radar(p_tenant_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted int := 0;
  r record;
begin
  if not exists (
    select 1 from public.tenant_members
    where user_id = auth.uid() and tenant_id = p_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  for r in
    with historico as (
      select
        wo.vehicle_id,
        wo.customer_id,
        s.category,
        wo.created_at,
        s.id as section_id
      from public.wo_sections s
      join public.work_orders wo on wo.id = s.work_order_id
      where wo.tenant_id = p_tenant_id
        and wo.status = 'entregue'
        and s.category is not null
    ),
    agregado as (
      select
        vehicle_id, customer_id, category,
        count(*) as ocorrencias,
        max(created_at) as ultima,
        (max(created_at)::date - min(created_at)::date) / nullif(count(*) - 1, 0) as intervalo_medio_dias
      from historico
      group by vehicle_id, customer_id, category
      having count(*) >= 2
    ),
    valor as (
      select h.vehicle_id, h.category, avg(coalesce(wp.qty * wp.unit_price, 0)) as valor_medio_pecas,
             avg(coalesce(s.std_hours * s.labor_rate, 0)) as valor_medio_mo
      from historico h
      join public.wo_sections s on s.id = h.section_id
      left join public.wo_parts wp on wp.section_id = s.id
      group by h.vehicle_id, h.category
    )
    select
      a.vehicle_id, a.customer_id, a.category, a.ocorrencias,
      (a.ultima::date + (a.intervalo_medio_dias || ' days')::interval)::date as predicted_at,
      least(90, 40 + a.ocorrencias * 15) as confidence,
      coalesce(v.valor_medio_pecas, 0) + coalesce(v.valor_medio_mo, 0) as estimated_value
    from agregado a
    left join valor v on v.vehicle_id = a.vehicle_id and v.category = a.category
    where a.intervalo_medio_dias is not null
      and (a.ultima::date + (a.intervalo_medio_dias || ' days')::interval)::date <= current_date + 45
  loop
    if not exists (
      select 1 from public.repurchase_opportunities
      where vehicle_id = r.vehicle_id and category = r.category
        and status in ('prevista','contatada','agendada')
    ) then
      insert into public.repurchase_opportunities
        (tenant_id, vehicle_id, customer_id, category, description, predicted_at, confidence, estimated_value)
      values
        (p_tenant_id, r.vehicle_id, r.customer_id, r.category,
         'Provável recompra: ' || r.category, r.predicted_at, r.confidence, r.estimated_value);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

grant execute on function public.compute_repurchase_radar to authenticated;

-- ---------------------------------------------------------------------
-- Recall & campanhas de fabricante (B3)
-- ---------------------------------------------------------------------
create table public.manufacturer_recalls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade, -- null = global (seed)
  brand text not null,
  model_pattern text, -- ilike, null = qualquer modelo da marca
  year_from int,
  year_to int,
  title text not null,
  description text,
  campaign_ref text,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_manufacturer_recalls_brand on public.manufacturer_recalls(brand) where active;

alter table public.manufacturer_recalls enable row level security;

create policy "manufacturer_recalls_select" on public.manufacturer_recalls
  for select using (tenant_id is null or tenant_id in (select public.current_tenants()));

create policy "manufacturer_recalls_manage" on public.manufacturer_recalls
  for insert with check (tenant_id in (select public.current_tenants()));

create policy "manufacturer_recalls_update" on public.manufacturer_recalls
  for update using (tenant_id in (select public.current_tenants()));

create policy "manufacturer_recalls_delete" on public.manufacturer_recalls
  for delete using (tenant_id in (select public.current_tenants()));

-- Veiculos da frota com recall/campanha ativa batendo marca/modelo/ano
create or replace function public.vehicle_recall_matches(p_tenant_id uuid)
returns table (
  vehicle_id uuid, plate text, brand text, model text, year int,
  customer_id uuid, customer_name text,
  recall_id uuid, title text, description text, campaign_ref text
)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, v.plate, v.brand, v.model, v.year, v.customer_id, c.name,
         r.id, r.title, r.description, r.campaign_ref
  from public.vehicles v
  join public.customers c on c.id = v.customer_id
  join public.manufacturer_recalls r
    on r.active
   and (r.tenant_id is null or r.tenant_id = p_tenant_id)
   and lower(r.brand) = lower(v.brand)
   and (r.model_pattern is null or v.model ilike r.model_pattern)
   and (r.year_from is null or v.year >= r.year_from)
   and (r.year_to is null or v.year <= r.year_to)
  where v.tenant_id = p_tenant_id;
$$;

grant execute on function public.vehicle_recall_matches to authenticated;
