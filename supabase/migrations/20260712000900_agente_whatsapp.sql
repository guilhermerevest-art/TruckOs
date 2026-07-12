-- =====================================================================
-- TruckOS — 20260712000900_agente_whatsapp.sql
-- Agente IA no WhatsApp da oficina. Ver Bloco A2 do MD.
-- Desligado por padrao em todo tenant (enabled=false) — so age depois
-- que o dono configura e liga explicitamente.
-- =====================================================================

create table public.wa_agent_configs (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  intents jsonb not null default '{
    "status": true, "agendamento": true, "triagem": true,
    "garantia": true, "negociacao": false
  }'::jsonb,
  active_hours jsonb not null default '{"mode": "fora_comercial", "start": "18:00", "end": "08:00"}'::jsonb,
  tone text not null default 'proximo' check (tone in ('formal', 'proximo')),
  forbidden_replies text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger trg_wa_agent_configs_updated_at
  before update on public.wa_agent_configs
  for each row execute function public.set_updated_at();

alter table public.wa_agent_configs enable row level security;

create policy "wa_agent_configs_tenant_isolation" on public.wa_agent_configs
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

create table public.wa_agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  reason text not null,
  summary text,
  created_at timestamptz not null default now()
);

create index idx_wa_agent_handoffs_tenant on public.wa_agent_handoffs(tenant_id, created_at desc);

alter table public.wa_agent_handoffs enable row level security;

create policy "wa_agent_handoffs_tenant_isolation" on public.wa_agent_handoffs
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));
