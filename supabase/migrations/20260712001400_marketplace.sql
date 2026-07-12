-- =====================================================================
-- TruckOS — 20260712001400_marketplace.sql
-- Marketplace de Pecas entre Oficinas. Ver Bloco E2 do MD.
--
-- Nota de escopo: nao ha parceiro de pagamento integrado (Stripe Connect
-- ou similar) — a intermediacao de pagamento do MD ("taxa de transacao
-- 3-5%") fica registrada como campo (platform_fee_pct) mas o pagamento
-- em si acontece fora da plataforma ate existir integracao real.
-- Raio geografico usa cidade/estado do cadastro (sem geocodificacao —
-- nao ha chave de mapas configurada neste projeto).
--
-- Excecao deliberada ao isolamento por tenant: listagens sao visiveis a
-- QUALQUER tenant autenticado (e o proposito do marketplace), mas so o
-- dono da listagem pode escrever nela.
-- =====================================================================

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seller_name text, -- denormalizado: RLS de `tenants` nao deixaria o comprador ver o nome via join
  part_id uuid references public.parts(id) on delete set null,
  description text not null,
  oem_codes text[] default '{}',
  brand text,
  qty numeric(12,3) not null default 1,
  unit_price numeric(12,2) not null,
  photos text[] default '{}',
  city text,
  state text,
  status text not null default 'disponivel' check (status in ('disponivel','reservado','vendido','cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_marketplace_listings_status on public.marketplace_listings(status, state);

create trigger trg_marketplace_listings_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

create or replace function public.set_marketplace_listing_seller_name()
returns trigger
language plpgsql
as $$
begin
  if new.seller_name is null then
    select name into new.seller_name from public.tenants where id = new.tenant_id;
  end if;
  return new;
end;
$$;

create trigger trg_marketplace_listings_seller_name
  before insert on public.marketplace_listings
  for each row execute function public.set_marketplace_listing_seller_name();

create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_tenant_id uuid not null references public.tenants(id) on delete cascade,
  seller_tenant_id uuid not null references public.tenants(id) on delete cascade,
  qty numeric(12,3) not null default 1,
  agreed_price numeric(12,2) not null,
  platform_fee_pct numeric(5,2) not null default 4,
  status text not null default 'solicitado'
    check (status in ('solicitado','aceito','recusado','enviado','recebido','cancelado')),
  payment_status text not null default 'pendente_integracao',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_marketplace_orders_buyer on public.marketplace_orders(buyer_tenant_id);
create index idx_marketplace_orders_seller on public.marketplace_orders(seller_tenant_id);

create trigger trg_marketplace_orders_updated_at
  before update on public.marketplace_orders
  for each row execute function public.set_updated_at();

create table public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  sender_tenant_id uuid not null references public.tenants(id) on delete cascade,
  sender_name text,
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_marketplace_messages_order on public.marketplace_messages(order_id, created_at);

create or replace function public.set_marketplace_message_sender_name()
returns trigger
language plpgsql
as $$
begin
  if new.sender_name is null then
    select name into new.sender_name from public.tenants where id = new.sender_tenant_id;
  end if;
  return new;
end;
$$;

create trigger trg_marketplace_messages_sender_name
  before insert on public.marketplace_messages
  for each row execute function public.set_marketplace_message_sender_name();

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_messages enable row level security;

create policy "marketplace_listings_select_platform" on public.marketplace_listings
  for select using (auth.role() = 'authenticated');

create policy "marketplace_listings_manage_own" on public.marketplace_listings
  for insert with check (tenant_id in (select public.current_tenants()));
create policy "marketplace_listings_update_own" on public.marketplace_listings
  for update using (tenant_id in (select public.current_tenants()));
create policy "marketplace_listings_delete_own" on public.marketplace_listings
  for delete using (tenant_id in (select public.current_tenants()));

create policy "marketplace_orders_select_participant" on public.marketplace_orders
  for select using (
    buyer_tenant_id in (select public.current_tenants())
    or seller_tenant_id in (select public.current_tenants())
  );
create policy "marketplace_orders_insert_buyer" on public.marketplace_orders
  for insert with check (buyer_tenant_id in (select public.current_tenants()));
create policy "marketplace_orders_update_participant" on public.marketplace_orders
  for update using (
    buyer_tenant_id in (select public.current_tenants())
    or seller_tenant_id in (select public.current_tenants())
  );

create policy "marketplace_messages_select_participant" on public.marketplace_messages
  for select using (
    order_id in (
      select id from public.marketplace_orders
      where buyer_tenant_id in (select public.current_tenants())
         or seller_tenant_id in (select public.current_tenants())
    )
  );
create policy "marketplace_messages_insert_participant" on public.marketplace_messages
  for insert with check (
    sender_tenant_id in (select public.current_tenants())
    and order_id in (
      select id from public.marketplace_orders
      where buyer_tenant_id in (select public.current_tenants())
         or seller_tenant_id in (select public.current_tenants())
    )
  );

-- ---------------------------------------------------------------------
-- RPC: cria pedido a partir de uma listagem (resolve seller_tenant_id
-- automaticamente, evita o comprador ter que saber o tenant do vendedor)
-- ---------------------------------------------------------------------
create or replace function public.create_marketplace_order(p_listing_id uuid, p_qty numeric)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_buyer_tenant_id uuid;
  v_listing record;
  v_order_id uuid;
begin
  select tenant_id into v_buyer_tenant_id from public.tenant_members
   where user_id = auth.uid() and active limit 1;
  if v_buyer_tenant_id is null then
    raise exception 'no_active_tenant';
  end if;

  select * into v_listing from public.marketplace_listings where id = p_listing_id and status = 'disponivel';
  if v_listing is null then
    raise exception 'listing_not_available';
  end if;
  if v_listing.tenant_id = v_buyer_tenant_id then
    raise exception 'cannot_buy_own_listing';
  end if;

  insert into public.marketplace_orders (listing_id, buyer_tenant_id, seller_tenant_id, qty, agreed_price)
  values (p_listing_id, v_buyer_tenant_id, v_listing.tenant_id, p_qty, v_listing.unit_price * p_qty)
  returning id into v_order_id;

  update public.marketplace_listings set status = 'reservado' where id = p_listing_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_marketplace_order to authenticated;
