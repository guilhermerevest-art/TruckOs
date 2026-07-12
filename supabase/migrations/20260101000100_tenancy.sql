-- =====================================================================
-- TruckOS — 002_tenancy.sql
-- Tenants, membros, integracoes, billing (espelho Stripe)
-- =====================================================================

-- ---------- tenants (oficinas) ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  cnpj text,
  logo_url text,
  brand_color text default '#0EA5E9',
  address jsonb,
  tax_regime text check (tax_regime in ('simples','presumido','real')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','read_only')),
  trial_ends_at timestamptz,
  plan text not null default 'starter'
    check (plan in ('starter','pro','fleet')),
  settings jsonb not null default '{
    "kanban_phases": [
      "recepcao","diagnostico","orcamento",
      "aguardando_aprovacao","aguardando_peca",
      "em_execucao","controle_qualidade","pronto","entregue"
    ],
    "min_margin_pct": 20,
    "default_payment_terms_days": 0,
    "currency": "BRL"
  }'::jsonb,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_tenants_status on public.tenants(status);

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------- tenant_members (RBAC N:N) ----------
create type public.tenant_role as enum (
  'owner','manager','advisor','mechanic','stock','finance'
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null,
  hourly_cost numeric(10,2),
  commission_rules jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index idx_tenant_members_user on public.tenant_members(user_id) where active;

create trigger trg_tenant_members_updated_at
  before update on public.tenant_members
  for each row execute function public.set_updated_at();

-- ---------- tenant_integrations (credenciais criptografadas) ----------
create table public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('evolution','stripe','focus_nfe','asaas')),
  -- credentials cifradas com pgsodium; client nunca ve
  credentials_encrypted bytea,
  status text default 'pending',
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- ---------- subscription_events (webhook idempotente) ----------
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb,
  processed_at timestamptz default now()
);

-- ---------- usage_counters (enforcement de limites) ----------
create table public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period date not null,
  work_orders_count int not null default 0,
  messages_sent int not null default 0,
  storage_mb numeric(12,2) not null default 0,
  primary key (tenant_id, period)
);

-- =====================================================================
-- JWT custom claim: injeta tenant_id e role no token do usuario
-- Chamado pelo Supabase Auth Hook (configurado no dashboard)
-- =====================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  v_user_id uuid;
  v_tenant_id uuid;
  v_role text;
begin
  claims := event->'claims';

  -- 1. tenta ler do metadata do user (multi-tenant: tenant ativo)
  v_tenant_id := nullif(claims->>'active_tenant_id','')::uuid;
  v_role      := nullif(claims->>'active_role','');

  -- 2. fallback: pega o primeiro tenant ativo do usuario
  -- (cobre o caso de usuario single-tenant que acabou de se cadastrar)
  if v_tenant_id is null then
    v_user_id := (claims->>'sub')::uuid;
    select tm.tenant_id, tm.role::text
      into v_tenant_id, v_role
      from public.tenant_members tm
     where tm.user_id = v_user_id
       and tm.active = true
     order by tm.created_at asc
     limit 1;
  end if;

  if v_tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
    claims := jsonb_set(claims, '{role}',      to_jsonb(coalesce(v_role, 'member')));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function public.custom_access_token_hook is
  'Auth Hook do Supabase: adiciona tenant_id e role ao JWT.
   Single-tenant: pega o primeiro membership ativo.
   Multi-tenant: le active_tenant_id/active_role do metadata (sincronizado por /api/auth/switch-tenant).';

-- =====================================================================
-- RLS: tenants
-- Usuario so ve tenants dos quais eh membro (ou eh customer; ver policies)
-- =====================================================================
alter table public.tenants enable row level security;

create policy "tenants_select_members" on public.tenants
  for select using (
    id in (select tenant_id from public.tenant_members where user_id = auth.uid() and active)
  );

create policy "tenants_update_owners" on public.tenants
  for update using (
    id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role = 'owner'
    )
  );

create policy "tenants_insert_self" on public.tenants
  for insert with check (created_by = auth.uid());

-- =====================================================================
-- RLS: tenant_members
-- Membros visiveis entre si; owner gerencia
-- =====================================================================
alter table public.tenant_members enable row level security;

create policy "tenant_members_select_same_tenant" on public.tenant_members
  for select using (
    tenant_id in (
      select tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.active
    )
  );

create policy "tenant_members_manage_owners" on public.tenant_members
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.active and tm.role in ('owner','manager')
    )
  );

-- =====================================================================
-- RLS: tenant_integrations (somente owner/manager)
-- =====================================================================
alter table public.tenant_integrations enable row level security;

create policy "tenant_integrations_owners" on public.tenant_integrations
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active and role in ('owner','manager')
    )
  );

-- subscription_events: somente service role escreve; leitura negada ao usuario
alter table public.subscription_events enable row level security;
-- sem policy -> bloqueado para anon/authenticated. service_role bypassa RLS.

-- usage_counters: somente leitura para o tenant
alter table public.usage_counters enable row level security;
create policy "usage_counters_select" on public.usage_counters
  for select using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and active
    )
  );
