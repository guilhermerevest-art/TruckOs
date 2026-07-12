-- =====================================================================
-- TruckOS — 20260712001000_gestao_pneus.sql
-- Gestao de Pneus (add-on). Ver Bloco D1 do MD.
-- =====================================================================

create table public.tires (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fire_number text not null,
  brand text not null,
  model text,
  size text,
  life_number int not null default 1,
  status text not null default 'estoque' check (status in ('estoque','em_uso','recapagem','sucateado')),
  purchase_cost numeric(12,2) default 0,
  purchase_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fire_number)
);

create index idx_tires_tenant_status on public.tires(tenant_id, status);

create trigger trg_tires_updated_at
  before update on public.tires
  for each row execute function public.set_updated_at();

create table public.tire_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tire_id uuid not null references public.tires(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  axle_number int not null,
  position_code text not null, -- ex: 'E-ext','E-int','D-ext','D-int'
  odometer_at_mount int,
  odometer_at_removal int,
  tread_depth_mm numeric(5,2),
  mounted_at timestamptz not null default now(),
  removed_at timestamptz
);

create index idx_tire_positions_tire on public.tire_positions(tire_id, mounted_at desc);
create index idx_tire_positions_vehicle_active on public.tire_positions(vehicle_id) where removed_at is null;

create table public.tire_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tire_id uuid not null references public.tires(id) on delete cascade,
  kind text not null check (kind in ('instalacao','remocao','rodizio','recapagem_enviada','recapagem_recebida','sucateamento','medicao')),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  position_code text,
  km_at_event int,
  tread_depth_mm numeric(5,2),
  cost numeric(12,2),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_tire_events_tire on public.tire_events(tire_id, created_at desc);

alter table public.tires enable row level security;
alter table public.tire_positions enable row level security;
alter table public.tire_events enable row level security;

create policy "tires_tenant_isolation" on public.tires
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "tire_positions_tenant_isolation" on public.tire_positions
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "tire_events_tenant_isolation" on public.tire_events
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- RPC: monta ou rodizia um pneu numa posicao (fecha posicao anterior se
-- havia, fecha posicao anterior do pneu se ja estava montado em outro
-- lugar, registra evento).
-- ---------------------------------------------------------------------
create or replace function public.mount_tire(
  p_tire_id uuid,
  p_vehicle_id uuid,
  p_position_code text,
  p_axle_number int,
  p_kind text default 'instalacao'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_vehicle_odometer int;
  v_position_id uuid;
begin
  select tenant_id into v_tenant_id from public.tires where id = p_tire_id;
  if v_tenant_id is null then
    raise exception 'tire_not_found';
  end if;

  select odometer_km into v_vehicle_odometer from public.vehicles where id = p_vehicle_id;

  -- fecha posicao atual do pneu, se houver
  update public.tire_positions
     set removed_at = now(), odometer_at_removal = v_vehicle_odometer
   where tire_id = p_tire_id and removed_at is null;

  -- fecha o que estava montado nessa posicao do veiculo, se houver (troca)
  update public.tire_positions
     set removed_at = now(), odometer_at_removal = v_vehicle_odometer
   where vehicle_id = p_vehicle_id and position_code = p_position_code and removed_at is null;

  insert into public.tire_positions (tenant_id, tire_id, vehicle_id, axle_number, position_code, odometer_at_mount)
  values (v_tenant_id, p_tire_id, p_vehicle_id, p_axle_number, p_position_code, v_vehicle_odometer)
  returning id into v_position_id;

  update public.tires set status = 'em_uso' where id = p_tire_id;

  insert into public.tire_events (tenant_id, tire_id, kind, vehicle_id, position_code, km_at_event, created_by)
  values (v_tenant_id, p_tire_id, p_kind, p_vehicle_id, p_position_code, v_vehicle_odometer, auth.uid());

  return v_position_id;
end;
$$;

grant execute on function public.mount_tire to authenticated;

create or replace function public.remove_tire(p_tire_id uuid, p_new_status text default 'estoque')
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_vehicle_id uuid;
  v_odometer int;
begin
  select tenant_id into v_tenant_id from public.tires where id = p_tire_id;
  if v_tenant_id is null then
    raise exception 'tire_not_found';
  end if;

  select vehicle_id, v.odometer_km into v_vehicle_id, v_odometer
  from public.tire_positions tp join public.vehicles v on v.id = tp.vehicle_id
  where tp.tire_id = p_tire_id and tp.removed_at is null limit 1;

  update public.tire_positions
     set removed_at = now(), odometer_at_removal = v_odometer
   where tire_id = p_tire_id and removed_at is null;

  update public.tires set status = p_new_status where id = p_tire_id;

  insert into public.tire_events (tenant_id, tire_id, kind, vehicle_id, km_at_event, created_by)
  values (v_tenant_id, p_tire_id,
          case when p_new_status = 'recapagem' then 'recapagem_enviada'
               when p_new_status = 'sucateado' then 'sucateamento'
               else 'remocao' end,
          v_vehicle_id, v_odometer, auth.uid());
end;
$$;

grant execute on function public.remove_tire to authenticated;

create or replace function public.receive_from_recap(p_tire_id uuid, p_cost numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.tires where id = p_tire_id;
  if v_tenant_id is null then
    raise exception 'tire_not_found';
  end if;

  update public.tires set status = 'estoque', life_number = life_number + 1 where id = p_tire_id;

  insert into public.tire_events (tenant_id, tire_id, kind, cost, created_by)
  values (v_tenant_id, p_tire_id, 'recapagem_recebida', p_cost, auth.uid());
end;
$$;

grant execute on function public.receive_from_recap to authenticated;
