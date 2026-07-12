-- =====================================================================
-- TruckOS — 20260712000200_vehicle_health_score.sql
-- Score de Saude do Veiculo (0-100). Ver MD/TruckOS-Funcionalidades-Alto-Valor.md B1.
-- =====================================================================

create table public.vehicle_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  score int not null,
  breakdown jsonb not null default '[]',
  computed_at timestamptz not null default now()
);

create index idx_vehicle_health_snapshots_vehicle on public.vehicle_health_snapshots(vehicle_id, computed_at desc);

alter table public.vehicle_health_snapshots enable row level security;

create policy "vehicle_health_snapshots_tenant_isolation" on public.vehicle_health_snapshots
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- Calculo (sempre ao vivo, nao depende de snapshot para o valor atual)
-- ---------------------------------------------------------------------
create or replace function public.compute_vehicle_health(p_vehicle_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_score int := 100;
  v_breakdown jsonb := '[]'::jsonb;
  v_pm record;
  v_recidiv record;
  v_last_service date;
begin
  -- 1. Preventivas vencidas/proximas
  for v_pm in
    select id, name, status from public.pm_plans
    where vehicle_id = p_vehicle_id and active
  loop
    if v_pm.status = 'vencido' then
      v_score := v_score - 15;
      v_breakdown := v_breakdown || jsonb_build_object(
        'tipo', 'pm_vencida', 'item', v_pm.name, 'severidade', 'alta', 'impacto', -15
      );
    elsif v_pm.status = 'proximo' then
      v_score := v_score - 5;
      v_breakdown := v_breakdown || jsonb_build_object(
        'tipo', 'pm_proxima', 'item', v_pm.name, 'severidade', 'media', 'impacto', -5
      );
    end if;
  end loop;

  -- 2. Reincidencia: mesma categoria de servico em 2+ OS nos ultimos 180 dias
  for v_recidiv in
    select s.category, count(distinct wo.id) as ocorrencias
    from public.wo_sections s
    join public.work_orders wo on wo.id = s.work_order_id
    where wo.vehicle_id = p_vehicle_id
      and wo.created_at >= now() - interval '180 days'
      and s.category is not null
    group by s.category
    having count(distinct wo.id) >= 2
  loop
    v_score := v_score - least((v_recidiv.ocorrencias - 1) * 10, 20);
    v_breakdown := v_breakdown || jsonb_build_object(
      'tipo', 'reincidencia', 'item', v_recidiv.category, 'severidade', 'media',
      'ocorrencias', v_recidiv.ocorrencias, 'impacto', -least((v_recidiv.ocorrencias - 1) * 10, 20)
    );
  end loop;

  -- 3. Tempo sem manutencao
  select max(wo.created_at)::date into v_last_service
  from public.work_orders wo where wo.vehicle_id = p_vehicle_id;

  if v_last_service is not null and v_last_service < (current_date - interval '365 days') then
    v_score := v_score - 5;
    v_breakdown := v_breakdown || jsonb_build_object(
      'tipo', 'sem_manutencao', 'item', 'Sem OS ha mais de 12 meses', 'severidade', 'media', 'impacto', -5
    );
  end if;

  v_score := greatest(0, least(100, v_score));

  return jsonb_build_object('score', v_score, 'breakdown', v_breakdown, 'computed_at', now());
end;
$$;

grant execute on function public.compute_vehicle_health to authenticated;

-- ---------------------------------------------------------------------
-- Snapshot: grava historico (no maximo 1x/dia por veiculo) p/ calcular tendencia
-- ---------------------------------------------------------------------
create or replace function public.refresh_vehicle_health(p_vehicle_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
  v_last_snapshot_at timestamptz;
begin
  select tenant_id into v_tenant_id from public.vehicles where id = p_vehicle_id;
  if v_tenant_id is null then
    raise exception 'vehicle_not_found';
  end if;

  v_result := public.compute_vehicle_health(p_vehicle_id);

  select max(computed_at) into v_last_snapshot_at
  from public.vehicle_health_snapshots where vehicle_id = p_vehicle_id;

  if v_last_snapshot_at is null or v_last_snapshot_at < now() - interval '1 day' then
    insert into public.vehicle_health_snapshots (tenant_id, vehicle_id, score, breakdown)
    values (v_tenant_id, p_vehicle_id, (v_result->>'score')::int, v_result->'breakdown');
  end if;

  return v_result;
end;
$$;

grant execute on function public.refresh_vehicle_health to authenticated;
