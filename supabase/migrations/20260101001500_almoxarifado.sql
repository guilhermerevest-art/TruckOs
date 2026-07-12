-- =====================================================================
-- TruckOS — 015_almoxarifado.sql
-- Modulo de almoxarifado: liga estoque <-> compras, vendas balcao, OS e orcamento
--
-- Decisoes de produto (confirmadas com o dono da oficina):
--   1. Peca de estoque usada na OS: baixa IMEDIATA (nao e so reserva).
--   2. Sem saldo suficiente: permite mesmo assim, so avisa (fica negativo).
--   3. Compra recebida: cria conta a pagar automaticamente no Financeiro.
--   4. Menu continua "Estoque"; Compras e Vendas viram itens separados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vendas de balcao (peca vendida sem OS — cliente avulso ou cadastrado)
-- ---------------------------------------------------------------------
create table public.part_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'concluida' check (status in ('concluida','cancelada')),
  payment_method text check (payment_method in ('pix','cartao','boleto','dinheiro','transferencia','fiado')),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_part_sales_tenant_created on public.part_sales(tenant_id, created_at desc);
create index idx_part_sales_customer on public.part_sales(customer_id);

create table public.part_sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.part_sales(id) on delete cascade,
  part_id uuid references public.parts(id) on delete set null,
  description text not null,
  qty numeric(12,3) not null default 1,
  unit_cost numeric(12,4) default 0,
  unit_price numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index idx_part_sale_items_sale on public.part_sale_items(sale_id);

alter table public.part_sales enable row level security;
alter table public.part_sale_items enable row level security;

create policy "part_sales_tenant_isolation" on public.part_sales
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "part_sale_items_tenant_isolation" on public.part_sale_items
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- 2. stock_moves: rastreabilidade (compra / venda de origem) + novo kind
-- ---------------------------------------------------------------------
alter table public.stock_moves
  add column if not exists purchase_id uuid references public.purchases(id) on delete set null,
  add column if not exists sale_id uuid references public.part_sales(id) on delete set null;

alter table public.stock_moves drop constraint if exists stock_moves_kind_check;
alter table public.stock_moves add constraint stock_moves_kind_check
  check (kind in ('entrada_nf','saida_os','ajuste','devolucao','transferencia','garantia','saida_venda'));

-- ---------------------------------------------------------------------
-- 3. Fix: apply_stock_move() nunca tinha sido exercitada de verdade.
--    Tinha 2 bugs latentes que corrigimos agora que o modulo entra em uso:
--    a) nao tratava sinal por "kind" (saida nunca decrementava o saldo)
--    b) o calculo de custo medio contava a entrada em dobro
-- ---------------------------------------------------------------------
create or replace function public.apply_stock_move()
returns trigger
language plpgsql
as $$
declare
  v_delta numeric(12,3);
  v_qty_before numeric(12,3);
  v_avg_cost_before numeric(12,4);
begin
  v_delta := case
    when new.kind in ('saida_os','saida_venda','garantia') then -abs(new.qty)
    when new.kind in ('entrada_nf','devolucao') then abs(new.qty)
    else new.qty  -- ajuste/transferencia: quem chama decide o sinal
  end;

  select coalesce(sum(qty), 0) into v_qty_before
    from public.stock_balances
   where part_id = new.part_id and warehouse_id = new.warehouse_id;

  select avg_cost into v_avg_cost_before from public.parts where id = new.part_id;

  insert into public.stock_balances (tenant_id, warehouse_id, part_id, qty)
  values (new.tenant_id, new.warehouse_id, new.part_id, v_delta)
  on conflict (warehouse_id, part_id)
  do update set qty = public.stock_balances.qty + v_delta,
                updated_at = now();

  if new.kind = 'entrada_nf' and new.unit_cost > 0 then
    update public.parts
       set avg_cost = case
         when (coalesce(v_qty_before, 0) + new.qty) > 0
           then (coalesce(v_qty_before, 0) * coalesce(v_avg_cost_before, 0) + new.qty * new.unit_cost)
                / (coalesce(v_qty_before, 0) + new.qty)
         else new.unit_cost
       end
     where id = new.part_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. invoices: novo "kind" para venda de balcao
-- ---------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check
  check (kind in ('os_avulsa','consolidada_frota','contrato','venda_balcao'));

-- ---------------------------------------------------------------------
-- 5. RPC: usar peca do estoque numa OS (baixa imediata, permite negativo)
-- ---------------------------------------------------------------------
create or replace function public.add_wo_part_from_stock(
  p_work_order_id uuid,
  p_part_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_description text default null,
  p_section_id uuid default null
)
returns table (wo_part_id uuid, resulting_qty numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_warehouse_id uuid;
  v_unit_cost numeric;
  v_catalog_description text;
  v_wo_part_id uuid;
begin
  select tenant_id into v_tenant_id from public.work_orders where id = p_work_order_id;
  if v_tenant_id is null then
    raise exception 'work_order_not_found';
  end if;

  if not exists (
    select 1 from public.tenant_members
    where user_id = auth.uid() and tenant_id = v_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_qty';
  end if;

  select avg_cost, description into v_unit_cost, v_catalog_description
    from public.parts where id = p_part_id and tenant_id = v_tenant_id;
  if v_catalog_description is null then
    raise exception 'part_not_found';
  end if;

  select id into v_warehouse_id from public.warehouses
   where tenant_id = v_tenant_id order by created_at asc limit 1;
  if v_warehouse_id is null then
    raise exception 'warehouse_not_found';
  end if;

  insert into public.wo_parts
    (tenant_id, work_order_id, section_id, part_id, source, description, qty, unit_cost, unit_price, applied_at)
  values
    (v_tenant_id, p_work_order_id, p_section_id, p_part_id, 'estoque',
     coalesce(p_description, v_catalog_description), p_qty, coalesce(v_unit_cost, 0), p_unit_price, now())
  returning id into v_wo_part_id;

  insert into public.stock_moves
    (tenant_id, warehouse_id, part_id, kind, qty, unit_cost, work_order_id, user_id, note)
  values
    (v_tenant_id, v_warehouse_id, p_part_id, 'saida_os', p_qty, coalesce(v_unit_cost, 0), p_work_order_id, auth.uid(), 'Uso em OS');

  return query
    select v_wo_part_id, sb.qty
    from public.stock_balances sb
    where sb.warehouse_id = v_warehouse_id and sb.part_id = p_part_id;
end;
$$;

grant execute on function public.add_wo_part_from_stock to authenticated;

-- ---------------------------------------------------------------------
-- 6. RPC: remover peca da OS (devolve ao estoque se veio do estoque)
-- ---------------------------------------------------------------------
create or replace function public.remove_wo_part(p_wo_part_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_wo_id uuid;
  v_part_id uuid;
  v_qty numeric;
  v_source text;
  v_applied_at timestamptz;
  v_warehouse_id uuid;
begin
  select tenant_id, work_order_id, part_id, qty, source, applied_at
    into v_tenant_id, v_wo_id, v_part_id, v_qty, v_source, v_applied_at
  from public.wo_parts where id = p_wo_part_id;

  if v_tenant_id is null then
    raise exception 'wo_part_not_found';
  end if;

  if not exists (
    select 1 from public.tenant_members
    where user_id = auth.uid() and tenant_id = v_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  if v_source = 'estoque' and v_applied_at is not null and v_part_id is not null then
    select id into v_warehouse_id from public.warehouses
     where tenant_id = v_tenant_id order by created_at asc limit 1;

    insert into public.stock_moves
      (tenant_id, warehouse_id, part_id, kind, qty, work_order_id, user_id, note)
    values
      (v_tenant_id, v_warehouse_id, v_part_id, 'devolucao', v_qty, v_wo_id, auth.uid(), 'Remocao de peca da OS');
  end if;

  delete from public.wo_parts where id = p_wo_part_id;
end;
$$;

grant execute on function public.remove_wo_part to authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC: venda de balcao (com ou sem cliente identificado)
--    p_items: [{ "part_id": uuid|null, "description": text, "qty": numeric, "unit_price": numeric }]
-- ---------------------------------------------------------------------
create or replace function public.create_counter_sale(
  p_customer_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_payment_method text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_warehouse_id uuid;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_part_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_unit_cost numeric;
  v_description text;
begin
  select t into v_tenant_id from public.current_tenants() t limit 1;
  if v_tenant_id is null then
    raise exception 'no_tenant_context';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items';
  end if;

  select id into v_warehouse_id from public.warehouses
   where tenant_id = v_tenant_id order by created_at asc limit 1;
  if v_warehouse_id is null then
    raise exception 'warehouse_not_found';
  end if;

  select coalesce(sum((it->>'qty')::numeric * (it->>'unit_price')::numeric), 0)
    into v_subtotal
  from jsonb_array_elements(p_items) it;

  v_total := greatest(v_subtotal - coalesce(p_discount, 0), 0);

  insert into public.part_sales
    (tenant_id, warehouse_id, customer_id, status, payment_method, subtotal, discount, total, created_by)
  values
    (v_tenant_id, v_warehouse_id, p_customer_id, 'concluida', p_payment_method, v_subtotal, coalesce(p_discount, 0), v_total, auth.uid())
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_part_id := nullif(v_item->>'part_id', '')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_description := v_item->>'description';

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty';
    end if;

    v_unit_cost := 0;
    if v_part_id is not null then
      select avg_cost into v_unit_cost from public.parts where id = v_part_id and tenant_id = v_tenant_id;
    end if;

    insert into public.part_sale_items
      (tenant_id, sale_id, part_id, description, qty, unit_cost, unit_price)
    values
      (v_tenant_id, v_sale_id, v_part_id, v_description, v_qty, coalesce(v_unit_cost, 0), v_unit_price);

    if v_part_id is not null then
      insert into public.stock_moves
        (tenant_id, warehouse_id, part_id, kind, qty, unit_cost, sale_id, user_id, note)
      values
        (v_tenant_id, v_warehouse_id, v_part_id, 'saida_venda', v_qty, coalesce(v_unit_cost, 0), v_sale_id, auth.uid(), 'Venda de balcao');
    end if;
  end loop;

  -- fatura ja quitada, so quando da pra identificar o cliente (invoices exige customer_id)
  if p_customer_id is not null then
    insert into public.invoices
      (tenant_id, customer_id, kind, amount, paid_amount, paid_at, payment_method, status, notes, created_by)
    values
      (v_tenant_id, p_customer_id, 'venda_balcao', v_total, v_total, now(), p_payment_method, 'paga', 'Venda de peca de balcao', auth.uid())
    returning id into v_invoice_id;

    update public.part_sales set invoice_id = v_invoice_id where id = v_sale_id;
  end if;

  return v_sale_id;
end;
$$;

grant execute on function public.create_counter_sale to authenticated;

-- ---------------------------------------------------------------------
-- 8. RPC: receber item de uma compra (entrada de estoque + custo medio +
--    fecha/parcializa a compra + gera conta a pagar na 1a movimentacao)
-- ---------------------------------------------------------------------
create or replace function public.receive_purchase_item(
  p_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_purchase_id uuid;
  v_part_id uuid;
  v_warehouse_id uuid;
  v_all_received boolean;
  v_purchase_total numeric;
  v_supplier_id uuid;
  v_supplier_name text;
  v_expected_at date;
  v_received_at_before timestamptz;
begin
  select pi.tenant_id, pi.purchase_id, pi.part_id
    into v_tenant_id, v_purchase_id, v_part_id
  from public.purchase_items pi where pi.id = p_item_id;

  if v_tenant_id is null then
    raise exception 'purchase_item_not_found';
  end if;

  if not exists (
    select 1 from public.tenant_members
    where user_id = auth.uid() and tenant_id = v_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_qty';
  end if;

  select id into v_warehouse_id from public.warehouses
   where tenant_id = v_tenant_id order by created_at asc limit 1;

  if v_part_id is not null then
    insert into public.stock_moves
      (tenant_id, warehouse_id, part_id, kind, qty, unit_cost, purchase_id, user_id, note)
    values
      (v_tenant_id, v_warehouse_id, v_part_id, 'entrada_nf', p_qty, p_unit_cost, v_purchase_id, auth.uid(), 'Recebimento de compra');
  end if;

  update public.purchase_items
     set received_qty = coalesce(received_qty, 0) + p_qty,
         unit_cost = p_unit_cost
   where id = p_item_id;

  select bool_and(coalesce(received_qty, 0) >= qty)
    into v_all_received
  from public.purchase_items
  where purchase_id = v_purchase_id;

  select received_at, total, supplier_id, expected_at
    into v_received_at_before, v_purchase_total, v_supplier_id, v_expected_at
  from public.purchases where id = v_purchase_id;

  update public.purchases
     set status = case when v_all_received then 'recebido' else 'recebido_parcial' end,
         received_at = coalesce(received_at, now())
   where id = v_purchase_id;

  -- conta a pagar criada uma unica vez, no primeiro recebimento (parcial ou total)
  if v_received_at_before is null then
    select name into v_supplier_name from public.suppliers where id = v_supplier_id;

    insert into public.payables
      (tenant_id, supplier_id, category, description, amount, due_date, status)
    values
      (v_tenant_id, v_supplier_id, 'fornecedor',
       'Compra de pecas' || case when v_supplier_name is not null then ' - ' || v_supplier_name else '' end,
       v_purchase_total, coalesce(v_expected_at, current_date + 30), 'aberta');
  end if;
end;
$$;

grant execute on function public.receive_purchase_item to authenticated;
