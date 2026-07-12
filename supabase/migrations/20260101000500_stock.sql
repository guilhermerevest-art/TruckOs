-- =====================================================================
-- TruckOS — 006_stock.sql
-- Estoque basico (pecas, saldos, movimentos, requisicoes)
-- =====================================================================

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  barcode text,
  description text not null,
  oem_codes text[] default '{}',
  brand text,
  category text,
  unit text default 'UN',
  ncm text,
  cest text,
  cst text,
  origin int,
  min_qty numeric(12,3) default 0,
  max_qty numeric(12,3) default 0,
  avg_cost numeric(12,4) default 0,
  sale_price numeric(12,2) default 0,
  margin_pct numeric(5,2) default 0,
  location text,                  -- rua/prateleira
  photo_url text,
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index idx_parts_tenant_desc on public.parts(tenant_id, description);
create index idx_parts_tenant_barcode on public.parts(tenant_id, barcode);

create trigger trg_parts_updated_at
  before update on public.parts
  for each row execute function public.set_updated_at();

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text default 'matriz' check (kind in ('matriz','movel','filial')),
  created_at timestamptz not null default now()
);

create table public.stock_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  qty numeric(12,3) not null default 0,
  reserved_qty numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, part_id)
);

create index idx_stock_balances_part on public.stock_balances(part_id);

create trigger trg_stock_balances_updated_at
  before update on public.stock_balances
  for each row execute function public.set_updated_at();

create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  part_id uuid not null references public.parts(id) on delete restrict,
  kind text not null check (kind in
    ('entrada_nf','saida_os','ajuste','devolucao','transferencia','garantia')),
  qty numeric(12,3) not null,
  unit_cost numeric(12,4) default 0,
  work_order_id uuid references public.work_orders(id),
  user_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index idx_stock_moves_part on public.stock_moves(part_id, created_at desc);

-- Trigger: atualiza saldo automaticamente
create or replace function public.apply_stock_move()
returns trigger
language plpgsql
as $$
begin
  insert into public.stock_balances (tenant_id, warehouse_id, part_id, qty)
  values (new.tenant_id, new.warehouse_id, new.part_id, new.qty)
  on conflict (warehouse_id, part_id)
  do update set qty = public.stock_balances.qty + excluded.qty,
                updated_at = now();

  -- atualiza custo medio
  if new.kind = 'entrada_nf' and new.unit_cost > 0 then
    update public.parts p
       set avg_cost = (
         (coalesce((select sum(qty) from public.stock_balances sb
                    where sb.part_id = p.id and sb.warehouse_id = new.warehouse_id), 0) * p.avg_cost
          + new.qty * new.unit_cost)
         / nullif(coalesce((select sum(qty) from public.stock_balances sb
                    where sb.part_id = p.id and sb.warehouse_id = new.warehouse_id), 0) + new.qty, 0)
       )
     where p.id = new.part_id;
  end if;

  return new;
end;
$$;

create trigger trg_stock_moves_apply
  after insert on public.stock_moves
  for each row execute function public.apply_stock_move();

create table public.part_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  section_id uuid references public.wo_sections(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  description text,
  qty numeric(12,3) not null default 1,
  status text not null default 'pendente'
    check (status in ('pendente','separado','entregue','sem_estoque','cancelado')),
  requested_by uuid not null references auth.users(id),
  fulfilled_by uuid references auth.users(id),
  fulfilled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_part_requests_status on public.part_requests(tenant_id, status);

create trigger trg_part_requests_updated_at
  before update on public.part_requests
  for each row execute function public.set_updated_at();

-- FK do wo_parts para parts (atrasada para nao depender da ordem)
alter table public.wo_parts
  add constraint fk_wo_parts_part
  foreign key (part_id) references public.parts(id) on delete set null;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.parts enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_moves enable row level security;
alter table public.part_requests enable row level security;

create policy "parts_tenant_isolation" on public.parts
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "warehouses_tenant_isolation" on public.warehouses
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "stock_balances_tenant_isolation" on public.stock_balances
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "stock_moves_tenant_isolation" on public.stock_moves
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "part_requests_tenant_isolation" on public.part_requests
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));