-- =====================================================================
-- TruckOS — 20260712000700_agenda_inteligente.sql
-- Agenda Inteligente com capacidade real. Ver Bloco C3 do MD.
-- Sugestao de horario e calculo de capacidade ficam no frontend (dados
-- ja vem completos por semana); a tabela so guarda o compromisso.
-- =====================================================================

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  mechanic_id uuid references auth.users(id),
  bay text,
  service_description text not null,
  std_hours numeric(6,2) not null default 1,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado','confirmado','em_atendimento','concluido','no_show','cancelado')),
  overbooked boolean not null default false,
  work_order_id uuid references public.work_orders(id) on delete set null,
  source text not null default 'manual' check (source in ('manual','whatsapp','portal')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_appointments_tenant_start on public.appointments(tenant_id, scheduled_start);
create index idx_appointments_mechanic on public.appointments(mechanic_id, scheduled_start);

create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

create policy "appointments_tenant_isolation" on public.appointments
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- Agendamento publico (link/portal ou agente de WhatsApp) — cria com
-- status 'agendado', sem tocar em nenhuma outra tabela.
create or replace function public.public_create_appointment(
  p_tenant_slug text,
  p_customer_phone text,
  p_customer_name text,
  p_service_description text,
  p_std_hours numeric,
  p_scheduled_start timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_customer_id uuid;
  v_appointment_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = p_tenant_slug;
  if v_tenant_id is null then
    raise exception 'tenant_not_found';
  end if;

  select c.id into v_customer_id
  from public.customers c
  join public.customer_contacts cc on cc.customer_id = c.id
  where c.tenant_id = v_tenant_id and cc.phone_e164 = p_customer_phone
  limit 1;

  if v_customer_id is null then
    insert into public.customers (tenant_id, type, name)
    values (v_tenant_id, 'pf', coalesce(p_customer_name, 'Cliente WhatsApp'))
    returning id into v_customer_id;

    insert into public.customer_contacts (tenant_id, customer_id, name, role, phone_e164, whatsapp, can_approve)
    values (v_tenant_id, v_customer_id, coalesce(p_customer_name, 'Cliente WhatsApp'), 'outro', p_customer_phone, true, true);
  end if;

  insert into public.appointments
    (tenant_id, customer_id, service_description, std_hours, scheduled_start, scheduled_end, source)
  values
    (v_tenant_id, v_customer_id, p_service_description, p_std_hours,
     p_scheduled_start, p_scheduled_start + (p_std_hours || ' hours')::interval, 'portal')
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

grant execute on function public.public_create_appointment to anon, authenticated;
