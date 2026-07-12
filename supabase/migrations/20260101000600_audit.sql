-- =====================================================================
-- TruckOS — 007_audit.sql
-- Auditoria, knowledge base, helpers
-- =====================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  at timestamptz not null default now()
);

create index idx_audit_tenant_at on public.audit_logs(tenant_id, at desc);
create index idx_audit_entity on public.audit_logs(entity, entity_id);

alter table public.audit_logs enable row level security;

-- Apenas owner/manager le audit
create policy "audit_select_managers" on public.audit_logs
  for select using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role in ('owner','manager')
    )
  );

-- knowledge_base: diagnosticos aprendidos por tenant
create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_brand text,
  vehicle_model text,
  symptom text not null,
  cause text not null,
  solution text not null,
  source_wo_id uuid references public.work_orders(id),
  occurrences int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_kb_tenant_vehicle on public.knowledge_base(tenant_id, vehicle_brand, vehicle_model);

create trigger trg_kb_updated_at
  before update on public.knowledge_base
  for each row execute function public.set_updated_at();

alter table public.knowledge_base enable row level security;
create policy "kb_tenant_isolation" on public.knowledge_base
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- helper_sessions
create table public.helper_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  messages jsonb not null default '[]'::jsonb,
  context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_helper_sessions_updated_at
  before update on public.helper_sessions
  for each row execute function public.set_updated_at();

alter table public.helper_sessions enable row level security;
create policy "helper_sessions_own" on public.helper_sessions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- onboarding_progress
create table public.onboarding_progress (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  steps_completed text[] default '{}',
  tour_dismissed boolean default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, module)
);

alter table public.onboarding_progress enable row level security;
create policy "onboarding_own" on public.onboarding_progress
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- message_templates (templates WhatsApp por evento)
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,  -- NULL = global
  event text not null
    check (event in ('wo_created','quote_sent','quote_reminder','approved',
                     'part_arrived','wo_ready','wo_delivered','nps',
                     'pm_due','billing_due','billing_overdue')),
  channel text default 'whatsapp',
  body text not null,
  active boolean default true,
  delay_minutes int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_msg_templates_event on public.message_templates(event, active);

alter table public.message_templates enable row level security;
create policy "msg_templates_tenant_read" on public.message_templates
  for select using (
    tenant_id is null or tenant_id in (select public.current_tenants())
  );
create policy "msg_templates_owners_write" on public.message_templates
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role in ('owner','manager')
    )
  );