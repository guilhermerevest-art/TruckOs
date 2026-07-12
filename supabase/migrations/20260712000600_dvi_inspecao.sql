-- =====================================================================
-- TruckOS — 20260712000600_dvi_inspecao.sql
-- Checklist de Inspecao Vendedor (DVI). Ver Bloco C4 do MD.
-- =====================================================================

create table public.wo_inspections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  item_key text not null,
  item_label text not null,
  category text not null,
  status text not null default 'nao_verificado'
    check (status in ('nao_verificado','verde','amarelo','vermelho')),
  note text,
  photo_url text,
  approved boolean not null default false,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (work_order_id, item_key)
);

create index idx_wo_inspections_wo on public.wo_inspections(work_order_id);

alter table public.wo_inspections enable row level security;

create policy "wo_inspections_tenant_isolation" on public.wo_inspections
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- Pagina publica de acompanhamento: exibe o raio-x + permite aprovar
-- ---------------------------------------------------------------------
create or replace function public.public_work_order_inspection(p_token text)
returns table (id uuid, item_label text, category text, status text, note text, photo_url text, approved boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.item_label, i.category, i.status, i.note, i.photo_url, i.approved
  from public.wo_inspections i
  join public.work_orders wo on wo.id = i.work_order_id
  where wo.public_token = p_token
    and i.status <> 'nao_verificado'
  order by i.category, i.item_label;
$$;

grant execute on function public.public_work_order_inspection to anon, authenticated;

create or replace function public.public_wo_inspection_approve(p_token text, p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo_id uuid;
begin
  select id into v_wo_id from public.work_orders where public_token = p_token;
  if v_wo_id is null then
    raise exception 'invalid_token';
  end if;

  update public.wo_inspections
     set approved = true
   where work_order_id = v_wo_id
     and id = any(p_item_ids);
end;
$$;

grant execute on function public.public_wo_inspection_approve to anon, authenticated;

-- ---------------------------------------------------------------------
-- Estende o Radar: itens amarelos/vermelhos da DVI nao aprovados tambem
-- viram oportunidade (mesma chamada "Atualizar radar" ja existente).
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

  -- Itens de DVI amarelos/vermelhos nao aprovados pelo cliente
  for r in
    select wo.vehicle_id, wo.customer_id, i.category, i.item_label, i.status
    from public.wo_inspections i
    join public.work_orders wo on wo.id = i.work_order_id
    where wo.tenant_id = p_tenant_id
      and i.status in ('amarelo','vermelho')
      and not i.approved
      and i.checked_at > now() - interval '30 days'
  loop
    if not exists (
      select 1 from public.repurchase_opportunities
      where vehicle_id = r.vehicle_id and category = r.category
        and status in ('prevista','contatada','agendada')
    ) then
      insert into public.repurchase_opportunities
        (tenant_id, vehicle_id, customer_id, category, description, predicted_at, confidence, estimated_value, source)
      values
        (p_tenant_id, r.vehicle_id, r.customer_id, r.category,
         'DVI: ' || r.item_label || ' (' || r.status || ', não aprovado)',
         current_date + 14, case when r.status = 'vermelho' then 75 else 55 end, 0, 'dvi');
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;
