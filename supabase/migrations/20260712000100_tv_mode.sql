-- =====================================================================
-- TruckOS — 20260712000100_tv_mode.sql
-- Modo Patio: TV/monitor da oficina, somente leitura, sem login (token de
-- dispositivo por tenant). Ver MD/TruckOS-Funcionalidades-Alto-Valor.md C1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. tenants.tv_token — token unico por oficina para a URL /tv/[token]
-- ---------------------------------------------------------------------
alter table public.tenants
  add column if not exists tv_token text unique;

create or replace function public.set_tenant_tv_token()
returns trigger
language plpgsql
as $$
begin
  if new.tv_token is null then
    new.tv_token := encode(gen_random_bytes(16), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenants_tv_token on public.tenants;
create trigger trg_tenants_tv_token
  before insert on public.tenants
  for each row execute function public.set_tenant_tv_token();

-- backfill de tenants existentes
update public.tenants set tv_token = encode(gen_random_bytes(16), 'hex') where tv_token is null;

-- ---------------------------------------------------------------------
-- 2. tenant_members.display_name — nome exibido na TV (nao expor e-mail
--    do usuario numa tela publica do patio)
-- ---------------------------------------------------------------------
alter table public.tenant_members
  add column if not exists display_name text;

-- ---------------------------------------------------------------------
-- 3. RPC publica: snapshot somente-leitura para a TV do patio
--    Sem alteracao de dados; nao expoe valores financeiros nem contatos.
-- ---------------------------------------------------------------------
create or replace function public.tv_snapshot(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  select id into v_tenant_id from public.tenants where tv_token = p_token;
  if v_tenant_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'tenant_name', t.name,
    'brand_color', t.brand_color,
    'tv_config', coalesce(t.settings->'tv', '{"panels":["kanban","pecas","prometidos"],"rotate_seconds":20}'::jsonb),
    'generated_at', now(),

    'work_orders_by_phase', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', wo.id,
               'number', wo.number,
               'plate', v.plate,
               'customer', c.name,
               'bay', wo.bay,
               'priority', wo.priority,
               'promised_at', wo.promised_at,
               'phase_entered_at', wo.phase_entered_at,
               'status', wo.status
             ) order by wo.phase_entered_at asc), '[]'::jsonb)
      from public.work_orders wo
      join public.vehicles v on v.id = wo.vehicle_id
      join public.customers c on c.id = wo.customer_id
      where wo.tenant_id = v_tenant_id
        and wo.status <> 'entregue'
    ),

    'part_requests_pending', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', pr.id,
               'description', coalesce(pr.description, p.description),
               'wo_number', wo.number,
               'qty', pr.qty,
               'requested_at', pr.created_at,
               'late', (now() - pr.created_at) > interval '2 hours'
             ) order by pr.created_at asc), '[]'::jsonb)
      from public.part_requests pr
      join public.work_orders wo on wo.id = pr.work_order_id
      left join public.parts p on p.id = pr.part_id
      where pr.tenant_id = v_tenant_id
        and pr.status = 'pendente'
    ),

    'promised_today', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', wo.id,
               'number', wo.number,
               'plate', v.plate,
               'customer', c.name,
               'promised_at', wo.promised_at,
               'status', wo.status
             ) order by wo.promised_at asc), '[]'::jsonb)
      from public.work_orders wo
      join public.vehicles v on v.id = wo.vehicle_id
      join public.customers c on c.id = wo.customer_id
      where wo.tenant_id = v_tenant_id
        and wo.status <> 'entregue'
        and wo.promised_at is not null
        and wo.promised_at::date = current_date
    ),

    'mechanic_queue', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'mechanic', coalesce(tm.display_name, 'Mecanico'),
               'wo_number', wo.number,
               'section', s.description,
               'started_at', l.started_at
             ) order by l.started_at asc), '[]'::jsonb)
      from public.wo_labor_logs l
      join public.work_orders wo on wo.id = l.work_order_id
      left join public.wo_sections s on s.id = l.section_id
      left join public.tenant_members tm on tm.tenant_id = v_tenant_id and tm.user_id = l.mechanic_id
      where l.tenant_id = v_tenant_id
        and l.ended_at is null
    )
  )
  into v_result
  from public.tenants t
  where t.id = v_tenant_id;

  return v_result;
end;
$$;

grant execute on function public.tv_snapshot to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC autenticada: regenerar o token da TV (owner/manager)
-- ---------------------------------------------------------------------
create or replace function public.regenerate_tv_token()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_new_token text;
begin
  select tenant_id into v_tenant_id from public.tenant_members
   where user_id = auth.uid() and active and role in ('owner','manager')
   limit 1;
  if v_tenant_id is null then
    raise exception 'forbidden';
  end if;

  v_new_token := encode(gen_random_bytes(16), 'hex');
  update public.tenants set tv_token = v_new_token where id = v_tenant_id;
  return v_new_token;
end;
$$;

grant execute on function public.regenerate_tv_token to authenticated;
