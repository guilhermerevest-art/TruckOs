-- =====================================================================
-- TruckOS — 005_quotes.sql
-- Orcamentos, itens, follow-ups, aprovacao digital
-- =====================================================================

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','approved','partial','rejected','expired')),
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  approval_token text unique,        -- link unico do cliente
  approved_by_contact_id uuid references public.customer_contacts(id),
  approved_at timestamptz,
  approval_meta jsonb,               -- {ip, user_agent, channel}
  rejection_reason text,
  subtotal numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_quotes_wo on public.quotes(work_order_id);
create index idx_quotes_tenant_status on public.quotes(tenant_id, status);
create index idx_quotes_token on public.quotes(approval_token);

create trigger trg_quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- Token de aprovacao
create or replace function public.set_quote_token()
returns trigger
language plpgsql
as $$
begin
  if new.approval_token is null then
    new.approval_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

create trigger trg_quotes_token
  before insert on public.quotes
  for each row execute function public.set_quote_token();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  kind text not null check (kind in ('part','labor','third_party')),
  ref_id uuid,                       -- wo_parts.id ou wo_sections.id
  description text not null,
  qty numeric(10,3) not null default 1,
  unit_price numeric(12,2) not null,
  option_group text default 'completo',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_quote_items_quote on public.quote_items(quote_id);

create table public.quote_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  channel text default 'whatsapp',
  template_id uuid
);

create index idx_quote_followups_due on public.quote_followups(scheduled_at)
  where sent_at is null;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_followups enable row level security;

create policy "quotes_tenant_isolation" on public.quotes
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "quote_items_tenant_isolation" on public.quote_items
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "quote_followups_tenant_isolation" on public.quote_followups
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- =====================================================================
-- Aprovacao publica (sem login): valida token, registra decisao
-- =====================================================================
create or replace function public.public_quote_view(p_token text)
returns table (
  quote_id uuid,
  work_order_number int,
  customer_name text,
  tenant_name text,
  brand_color text,
  total numeric,
  valid_until date,
  status text,
  items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id,
    wo.number,
    c.name,
    t.name,
    t.brand_color,
    q.total,
    q.valid_until,
    q.status,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', qi.id,
      'description', qi.description,
      'qty', qi.qty,
      'unit_price', qi.unit_price,
      'option_group', qi.option_group,
      'status', qi.status
    ) order by qi.created_at), '[]'::jsonb)
  from public.quotes q
  join public.work_orders wo on wo.id = q.work_order_id
  join public.tenants t on t.id = q.tenant_id
  join public.customers c on c.id = wo.customer_id
  left join public.quote_items qi on qi.quote_id = q.id
  where q.approval_token = p_token
  group by q.id, wo.number, c.name, t.name, t.brand_color, q.total, q.valid_until, q.status;
$$;

grant execute on function public.public_quote_view to anon, authenticated;

-- Aprovar itens: registra ip/user_agent, atualiza status da quote
create or replace function public.public_quote_approve(
  p_token text,
  p_item_ids uuid[],
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_total int;
begin
  select id into v_quote_id from public.quotes where approval_token = p_token;
  if v_quote_id is null then
    raise exception 'quote_not_found';
  end if;

  -- marca itens aprovados
  update public.quote_items
     set status = 'approved'
   where quote_id = v_quote_id
     and id = any(p_item_ids);

  -- rejeita os demais
  update public.quote_items
     set status = 'rejected'
   where quote_id = v_quote_id
     and id <> all(p_item_ids)
     and status = 'pending';

  select count(*) into v_total
    from public.quote_items
   where quote_id = v_quote_id and status = 'approved';

  update public.quotes
     set status = case when v_total > 0 then 'approved' else 'rejected' end,
         approved_at = now(),
         approval_meta = p_meta
   where id = v_quote_id;
end;
$$;

grant execute on function public.public_quote_approve to anon, authenticated;