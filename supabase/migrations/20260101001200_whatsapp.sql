-- =====================================================================
-- TruckOS — 013_whatsapp.sql
-- WhatsApp: instancias, conversas, mensagens, campanhas, NPS
-- =====================================================================

create table public.wa_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_name text not null unique,
  phone_e164 text,
  status text default 'disconnected' check (status in ('connected','disconnected','qr_pending','banned')),
  qr_code text,
  webhook_secret text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create trigger trg_wa_instances_updated_at
  before update on public.wa_instances
  for each row execute function public.set_updated_at();

create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_phone text not null,
  contact_name text,
  customer_id uuid references public.customers(id) on delete set null,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  assigned_to uuid references auth.users(id),
  status text default 'aberta' check (status in ('aberta','pendente','resolvida','arquivada')),
  last_message_at timestamptz default now(),
  unread_count int default 0,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wa_conv_tenant_phone on public.wa_conversations(tenant_id, contact_phone);
create index idx_wa_conv_tenant_status on public.wa_conversations(tenant_id, status);
create index idx_wa_conv_wo on public.wa_conversations(work_order_id);

create trigger trg_wa_conv_updated_at
  before update on public.wa_conversations
  for each row execute function public.set_updated_at();

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.wa_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  kind text default 'text' check (kind in ('text','image','audio','document','video','button_reply','location','contact')),
  body text,
  media_url text,
  evolution_message_id text,
  status text default 'sent' check (status in ('queued','sent','delivered','read','failed')),
  work_order_id uuid references public.work_orders(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  sent_by uuid references auth.users(id),
  is_automated boolean default false,
  error text,
  created_at timestamptz not null default now()
);

create index idx_wa_messages_conv on public.wa_messages(conversation_id, created_at desc);
create index idx_wa_messages_tenant_at on public.wa_messages(tenant_id, created_at desc);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  segment_filter jsonb,
  template_id uuid,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  status text default 'rascunho' check (status in ('rascunho','agendada','rodando','concluida','cancelada')),
  stats jsonb default '{"sent":0,"delivered":0,"read":0,"replied":0,"optout":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaigns_tenant_status on public.campaigns(tenant_id, status);

create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create table public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contact_phone text,
  score int not null check (score between 0 and 10),
  comment text,
  responded_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create index idx_nps_tenant_score on public.nps_responses(tenant_id, score);
create index idx_nps_tenant_at on public.nps_responses(tenant_id, responded_at desc);

alter table public.wa_instances enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.campaigns enable row level security;
alter table public.nps_responses enable row level security;

create policy "wa_instances_tenant_isolation" on public.wa_instances
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wa_conv_tenant_isolation" on public.wa_conversations
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "wa_messages_tenant_isolation" on public.wa_messages
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "campaigns_tenant_isolation" on public.campaigns
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create policy "nps_tenant_isolation" on public.nps_responses
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));