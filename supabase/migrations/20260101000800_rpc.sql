-- =====================================================================
-- TruckOS — 009_rpc.sql
-- Funcoes RPC utilizadas pelo frontend (Kanban e helpers)
-- =====================================================================

-- Mover OS de fase: atualiza status + phase_entered_at + grava historico
create or replace function public.move_work_order(
  p_work_order_id uuid,
  p_new_status text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_status text;
  v_tenant_id uuid;
begin
  select status, tenant_id into v_old_status, v_tenant_id
    from public.work_orders
   where id = p_work_order_id;

  if v_tenant_id is null then
    raise exception 'work_order_not_found';
  end if;

  -- checa que o usuario tem acesso ao tenant
  if not exists (
    select 1 from public.tenant_members
    where user_id = auth.uid() and tenant_id = v_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  update public.work_orders
     set status = p_new_status,
         phase_entered_at = now(),
         updated_at = now()
   where id = p_work_order_id;

  insert into public.wo_status_history
    (tenant_id, work_order_id, from_status, to_status, user_id, at)
  values
    (v_tenant_id, p_work_order_id, v_old_status, p_new_status, auth.uid(), now());
end;
$$;

grant execute on function public.move_work_order to authenticated;

-- Helper: incrementar contador de uso
create or replace function public.bump_usage_counter(
  p_field text,
  p_amount int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := (auth.jwt() ->> 'tenant_id')::uuid;
  if v_tenant_id is null then return; end if;

  insert into public.usage_counters (tenant_id, period, work_orders_count, messages_sent, storage_mb)
  values (v_tenant_id, date_trunc('month', now())::date, 0, 0, 0)
  on conflict (tenant_id, period) do nothing;

  execute format(
    'update public.usage_counters set %I = %I + $1
       where tenant_id = $2 and period = date_trunc(''month'', now())::date',
    p_field, p_field
  )
  using p_amount, v_tenant_id;
end;
$$;

grant execute on function public.bump_usage_counter to authenticated;