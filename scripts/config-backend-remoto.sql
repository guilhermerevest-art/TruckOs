-- =====================================================================
-- TruckOS — CONFIG BACKEND REMOTO (rodar uma vez no SQL Editor)
-- Habilita RLS, Auth Hook e Realtime
-- =====================================================================

-- 1. CONFIRMAR RLS ATIVO EM TODAS AS TABELAS
-- (deveria ja estar, mas garantindo)
alter table public.tenants                       enable row level security;
alter table public.tenant_members                enable row level security;
alter table public.tenant_integrations           enable row level security;
alter table public.usage_counters                enable row level security;
alter table public.customers                     enable row level security;
alter table public.customer_contacts             enable row level security;
alter table public.vehicles                      enable row level security;
alter table public.work_orders                   enable row level security;
alter table public.wo_status_history             enable row level security;
alter table public.wo_sections                   enable row level security;
alter table public.wo_parts                      enable row level security;
alter table public.wo_labor_logs                 enable row level security;
alter table public.wo_media                      enable row level security;
alter table public.wo_third_party_services       enable row level security;
alter table public.quotes                        enable row level security;
alter table public.quote_items                   enable row level security;
alter table public.quote_followups               enable row level security;
alter table public.parts                         enable row level security;
alter table public.warehouses                    enable row level security;
alter table public.stock_balances                enable row level security;
alter table public.stock_moves                   enable row level security;
alter table public.part_requests                 enable row level security;
alter table public.suppliers                     enable row level security;
alter table public.purchases                     enable row level security;
alter table public.purchase_items                enable row level security;
alter table public.pm_plans                      enable row level security;
alter table public.contracts                     enable row level security;
alter table public.contract_usage                enable row level security;
alter table public.invoices                      enable row level security;
alter table public.payables                      enable row level security;
alter table public.commissions                   enable row level security;
alter table public.cash_sessions                 enable row level security;
alter table public.fiscal_documents              enable row level security;
alter table public.wa_instances                  enable row level security;
alter table public.wa_conversations              enable row level security;
alter table public.wa_messages                   enable row level security;
alter table public.campaigns                     enable row level security;
alter table public.nps_responses                 enable row level security;
alter table public.audit_logs                    enable row level security;
alter table public.knowledge_base                enable row level security;
alter table public.helper_sessions               enable row level security;
alter table public.onboarding_progress           enable row level security;
alter table public.message_templates             enable row level security;

-- 2. AUTH HOOK: injeta tenant_id e role no JWT
-- Substitui a funcao existente (idempotente)
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

  -- 1. tenta ler do metadata (multi-tenant: tenant ativo)
  v_tenant_id := nullif(claims->>'active_tenant_id','')::uuid;
  v_role      := nullif(claims->>'active_role','');

  -- 2. fallback: pega o primeiro tenant ativo do usuario
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
  'Auth Hook: injeta tenant_id e role no JWT. Single-tenant pega do primeiro membership.';

-- 3. REALTIME: habilita publicacao para as tabelas chave
do $$
begin
  -- Cria a publicacao se nao existir
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Adiciona tabelas (idempotente via DO)
  begin
    alter publication supabase_realtime add table public.work_orders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.wo_status_history;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quotes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.part_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.wa_conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.wa_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.invoices;
  exception when duplicate_object then null;
  end;
end $$;

-- 4. RPC: move_work_order (ja existe na 008_rpc.sql, garantindo)
-- (se nao existir, nao faz mal)

-- 5. STORAGE: bucket para fotos de OS (executar manualmente ou via dashboard)
insert into storage.buckets (id, name, public)
values ('wo-media', 'wo-media', false)
on conflict (id) do nothing;

-- Politica de storage: usuarios veem midias do proprio tenant
create policy "wo_media_select_tenant" on storage.objects
  for select using (
    bucket_id = 'wo-media'
    and (storage.foldername(name))[1] in (
      select tenant_id::text from public.tenant_members
      where user_id = auth.uid() and active
    )
  );

create policy "wo_media_insert_tenant" on storage.objects
  for insert with check (
    bucket_id = 'wo-media'
    and (storage.foldername(name))[1] in (
      select tenant_id::text from public.tenant_members
      where user_id = auth.uid() and active
    )
  );

-- 6. View de NPS: GRANT explicito
grant select on public.v_dashboard_day to authenticated;
grant select on public.v_nps_summary to authenticated;

-- 7. CONFIRMACAO: lista tabelas e status
select
  tablename,
  rowsecurity as rls_on
from pg_tables
where schemaname = 'public'
  and tablename not like 'pg_%'
  and tablename not in ('schema_migrations','supabase_migrations')
order by tablename;