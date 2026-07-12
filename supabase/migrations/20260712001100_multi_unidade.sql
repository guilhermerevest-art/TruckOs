-- =====================================================================
-- TruckOS — 20260712001100_multi_unidade.sql
-- Multi-unidade / Rede & Franquia. Ver Bloco D4 do MD.
--
-- Decisao de design: NAO usamos dupla membership ativa por usuario (o
-- mesmo motivo do modo treinamento — current_tenants() e .single() em
-- dezenas de telas assumem no maximo 1 tenant ativo por vez). Em vez
-- disso, consolidacao entre unidades acontece via funcoes SECURITY
-- DEFINER que verificam explicitamente pertencimento ao grupo
-- (tenant_group_admins ou tenant_members do proprio tenant), sem nunca
-- alterar o RLS por-tenant existente. Cada usuario continua operando
-- dentro de UM tenant por vez; o /grupo so agrega leitura.
-- =====================================================================

create table public.tenant_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.tenants
  add column if not exists group_id uuid references public.tenant_groups(id) on delete set null;

create index if not exists idx_tenants_group on public.tenants(group_id);

-- Quem pode ver o dashboard consolidado do grupo (tipicamente donos da rede)
create table public.tenant_group_admins (
  group_id uuid not null references public.tenant_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Tabela de precos corporativa: preco sugerido por sku/descricao, valido
-- pra todas as unidades do grupo (leitura livre pros membros do grupo;
-- escrita so pelos admins do grupo).
create table public.group_price_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tenant_groups(id) on delete cascade,
  sku text,
  description text not null,
  corporate_price numeric(12,2) not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index idx_group_price_lists_group on public.group_price_lists(group_id);

alter table public.tenant_groups enable row level security;
alter table public.tenant_group_admins enable row level security;
alter table public.group_price_lists enable row level security;

create policy "tenant_groups_select_members" on public.tenant_groups
  for select using (
    id in (select group_id from public.tenants where id in (select public.current_tenants()))
    or id in (select group_id from public.tenant_group_admins where user_id = auth.uid())
  );

create policy "tenant_group_admins_select_self" on public.tenant_group_admins
  for select using (user_id = auth.uid());

create policy "group_price_lists_select_members" on public.group_price_lists
  for select using (
    group_id in (select group_id from public.tenants where id in (select public.current_tenants()))
  );

create policy "group_price_lists_manage_admins" on public.group_price_lists
  for insert with check (group_id in (select group_id from public.tenant_group_admins where user_id = auth.uid()));

create policy "group_price_lists_update_admins" on public.group_price_lists
  for update using (group_id in (select group_id from public.tenant_group_admins where user_id = auth.uid()));

create policy "group_price_lists_delete_admins" on public.group_price_lists
  for delete using (group_id in (select group_id from public.tenant_group_admins where user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- RPC: dashboard consolidado (por unidade + total). So pra quem esta em
-- tenant_group_admins daquele grupo.
-- ---------------------------------------------------------------------
create or replace function public.group_dashboard(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.tenant_group_admins where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  select jsonb_agg(jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', t.name,
    'os_abertas', (select count(*) from public.work_orders wo where wo.tenant_id = t.id and wo.status <> 'entregue'),
    'faturamento_mes', (
      select coalesce(sum(i.paid_amount), 0) from public.invoices i
      where i.tenant_id = t.id and i.status = 'paga' and i.paid_at >= date_trunc('month', now())
    ),
    'ticket_medio', (
      select coalesce(avg(i.paid_amount), 0) from public.invoices i
      where i.tenant_id = t.id and i.status = 'paga' and i.paid_at >= date_trunc('month', now())
    ),
    'clientes', (select count(*) from public.customers c where c.tenant_id = t.id)
  ))
  into v_result
  from public.tenants t
  where t.group_id = p_group_id;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function public.group_dashboard to authenticated;

-- ---------------------------------------------------------------------
-- RPC: busca se um documento (CNPJ/CPF) ja e cliente em outra unidade do
-- mesmo grupo — visibilidade cross-unidade sem unificar o cadastro.
-- Qualquer membro ativo de uma unidade do grupo pode consultar.
-- ---------------------------------------------------------------------
create or replace function public.group_search_customer(p_document text)
returns table (tenant_id uuid, tenant_name text, customer_id uuid, customer_name text, total_os int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select t.group_id into v_group_id
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.user_id = auth.uid() and tm.active
  limit 1;

  if v_group_id is null then
    raise exception 'not_in_a_group';
  end if;

  return query
  select t.id, t.name, c.id, c.name,
         (select count(*)::int from public.work_orders wo where wo.customer_id = c.id)
  from public.customers c
  join public.tenants t on t.id = c.tenant_id
  where t.group_id = v_group_id and c.document = p_document;
end;
$$;

grant execute on function public.group_search_customer to authenticated;

-- ---------------------------------------------------------------------
-- RPC: transferencia de estoque entre unidades do grupo. Ambos os lados
-- (peca de origem e peca de destino) sao resolvidos pela UI antes de
-- chamar — cada tenant tem seu proprio catalogo de pecas.
-- ---------------------------------------------------------------------
create or replace function public.transfer_stock_between_units(
  p_from_part_id uuid,
  p_to_part_id uuid,
  p_qty numeric,
  p_unit_cost numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from_tenant uuid;
  v_to_tenant uuid;
  v_from_group uuid;
  v_to_group uuid;
  v_from_warehouse uuid;
  v_to_warehouse uuid;
begin
  select tenant_id into v_from_tenant from public.parts where id = p_from_part_id;
  select tenant_id into v_to_tenant from public.parts where id = p_to_part_id;
  if v_from_tenant is null or v_to_tenant is null then
    raise exception 'part_not_found';
  end if;

  select group_id into v_from_group from public.tenants where id = v_from_tenant;
  select group_id into v_to_group from public.tenants where id = v_to_tenant;
  if v_from_group is null or v_from_group <> v_to_group then
    raise exception 'not_same_group';
  end if;

  if not exists (select 1 from public.tenant_members where user_id = auth.uid() and tenant_id = v_from_tenant and active)
     and not exists (select 1 from public.tenant_group_admins where group_id = v_from_group and user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  select id into v_from_warehouse from public.warehouses where tenant_id = v_from_tenant order by created_at limit 1;
  select id into v_to_warehouse from public.warehouses where tenant_id = v_to_tenant order by created_at limit 1;

  insert into public.stock_moves (tenant_id, warehouse_id, part_id, kind, qty, unit_cost, note)
  values (v_from_tenant, v_from_warehouse, p_from_part_id, 'transferencia', -abs(p_qty), p_unit_cost, 'Transferencia entre unidades do grupo');

  insert into public.stock_moves (tenant_id, warehouse_id, part_id, kind, qty, unit_cost, note)
  values (v_to_tenant, v_to_warehouse, p_to_part_id, 'transferencia', abs(p_qty), p_unit_cost, 'Transferencia entre unidades do grupo');
end;
$$;

grant execute on function public.transfer_stock_between_units to authenticated;
