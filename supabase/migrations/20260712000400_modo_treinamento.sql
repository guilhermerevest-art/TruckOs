-- =====================================================================
-- TruckOS — 20260712000400_modo_treinamento.sql
-- Modo Treinamento: tenant sandbox com dados ficticios, reset com um
-- clique. Ver MD/TruckOS-Funcionalidades-Alto-Valor.md F5.
--
-- Decisao de design: RLS deste projeto (current_tenants()) assume que o
-- usuario tem no maximo UMA linha ativa em tenant_members por vez —
-- varias telas usam .single() nessa premissa. Por isso o modo treino NAO
-- adiciona uma segunda membership ativa: ele DESATIVA a membership do
-- tenant real e ATIVA a do tenant sandbox (e vice-versa ao sair). Assim
-- current_tenants() continua retornando exatamente 1 tenant sempre, sem
-- qualquer risco de misturar dados reais com dados de treino.
-- =====================================================================

alter table public.tenants
  add column if not exists is_sandbox boolean not null default false,
  add column if not exists sandbox_of uuid references public.tenants(id) on delete cascade;

create index if not exists idx_tenants_sandbox_of on public.tenants(sandbox_of);

-- ---------------------------------------------------------------------
-- RPC: cria (se nao existir) o tenant sandbox do usuario, semeia dados
-- ficticios minimos e alterna a membership ativa para ele.
-- ---------------------------------------------------------------------
create or replace function public.enter_training_mode()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_real_tenant_id uuid;
  v_role public.tenant_role;
  v_source record;
  v_sandbox_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_wo_id uuid;
begin
  select tenant_id, role into v_real_tenant_id, v_role
    from public.tenant_members
   where user_id = auth.uid() and active
   limit 1;

  if v_real_tenant_id is null then
    raise exception 'no_active_tenant';
  end if;

  select * into v_source from public.tenants where id = v_real_tenant_id;

  select id into v_sandbox_id from public.tenants where sandbox_of = v_real_tenant_id;

  if v_sandbox_id is null then
    insert into public.tenants (name, slug, brand_color, plan, status, settings, is_sandbox, sandbox_of, created_by)
    values (
      v_source.name || ' (Treinamento)',
      v_source.slug || '-treino-' || substr(md5(random()::text), 1, 6),
      v_source.brand_color, v_source.plan, 'active', v_source.settings, true, v_real_tenant_id, auth.uid()
    )
    returning id into v_sandbox_id;

    insert into public.tenant_members (tenant_id, user_id, role, active)
    values (v_sandbox_id, auth.uid(), v_role, true);

    insert into public.warehouses (tenant_id, name, kind)
    values (v_sandbox_id, 'Almoxarifado Principal', 'matriz');

    insert into public.customers (tenant_id, type, name, document, email)
    values (v_sandbox_id, 'pj', 'Transportes Treino LTDA', '00.000.000/0001-00', 'treino@exemplo.com')
    returning id into v_customer_id;

    insert into public.customer_contacts (tenant_id, customer_id, name, role, phone_e164, whatsapp, can_approve)
    values (v_sandbox_id, v_customer_id, 'Motorista Treino', 'motorista', '+5511999990000', true, true);

    insert into public.vehicles (tenant_id, customer_id, plate, brand, model, year, vehicle_type, axles, odometer_km)
    values (v_sandbox_id, v_customer_id, 'TRN-1A23', 'Volvo', 'FH 540', 2020, 'cavalo', 3, 320000)
    returning id into v_vehicle_id;

    insert into public.parts (tenant_id, sku, description, category, avg_cost, sale_price, min_qty)
    values
      (v_sandbox_id, 'TRN-001', 'Jogo de lona de freio', 'freios', 180, 320, 2),
      (v_sandbox_id, 'TRN-002', 'Filtro de oleo', 'motor', 25, 60, 5);

    insert into public.work_orders (tenant_id, number, customer_id, vehicle_id, status, reported_issue, priority)
    values (v_sandbox_id, 1, v_customer_id, v_vehicle_id, 'diagnostico', 'Ruido ao frear (treino)', 'normal')
    returning id into v_wo_id;

    insert into public.wo_sections (tenant_id, work_order_id, category, description, std_hours, labor_rate, status)
    values (v_sandbox_id, v_wo_id, 'freios', 'Troca de lona dianteira (treino)', 2, 120, 'pendente');
  else
    -- ja existe: garante que a membership do usuario nesse sandbox esta ativa
    insert into public.tenant_members (tenant_id, user_id, role, active)
    values (v_sandbox_id, auth.uid(), v_role, true)
    on conflict (tenant_id, user_id) do update set active = true, role = excluded.role;
  end if;

  update public.tenant_members set active = false where tenant_id = v_real_tenant_id and user_id = auth.uid();

  return v_sandbox_id;
end;
$$;

grant execute on function public.enter_training_mode to authenticated;

-- ---------------------------------------------------------------------
-- RPC: sai do sandbox, reativa a membership do tenant real
-- ---------------------------------------------------------------------
create or replace function public.exit_training_mode()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sandbox_id uuid;
  v_real_tenant_id uuid;
begin
  select tenant_id into v_sandbox_id
    from public.tenant_members
   where user_id = auth.uid() and active
   limit 1;

  select sandbox_of into v_real_tenant_id from public.tenants where id = v_sandbox_id and is_sandbox;
  if v_real_tenant_id is null then
    raise exception 'not_in_training_mode';
  end if;

  update public.tenant_members set active = false where tenant_id = v_sandbox_id and user_id = auth.uid();
  update public.tenant_members set active = true where tenant_id = v_real_tenant_id and user_id = auth.uid();

  return v_real_tenant_id;
end;
$$;

grant execute on function public.exit_training_mode to authenticated;

-- ---------------------------------------------------------------------
-- RPC: apaga os dados de treino do tenant real do usuario (so pode ser
-- chamada de fora do sandbox — owner/manager). Proxima entrada recria.
-- ---------------------------------------------------------------------
create or replace function public.reset_training_mode()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_real_tenant_id uuid;
  v_role public.tenant_role;
begin
  select tenant_id, role into v_real_tenant_id, v_role
    from public.tenant_members
   where user_id = auth.uid() and active
   limit 1;

  if v_role not in ('owner','manager') then
    raise exception 'forbidden';
  end if;

  delete from public.tenants where sandbox_of = v_real_tenant_id;
end;
$$;

grant execute on function public.reset_training_mode to authenticated;
