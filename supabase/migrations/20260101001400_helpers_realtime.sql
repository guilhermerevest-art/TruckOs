-- =====================================================================
-- TruckOS — 015_realtime.sql
-- Habilita Realtime nas tabelas chave
-- =====================================================================

-- Habilita Realtime para as tabelas principais
alter publication supabase_realtime add table public.work_orders;
alter publication supabase_realtime add table public.wo_status_history;
alter publication supabase_realtime add table public.quotes;
alter publication supabase_realtime add table public.part_requests;
alter publication supabase_realtime add table public.wa_conversations;
alter publication supabase_realtime add table public.wa_messages;
alter publication supabase_realtime add table public.invoices;

-- Funcao utilitaria: trigger automatico de PM (chamado por cron no futuro)
create or replace function public.refresh_pm_status()
returns void
language plpgsql
as $$
begin
  update public.pm_plans
     set status = case
       when next_due_at < current_date then 'vencido'
       when next_due_at <= current_date + 15 then 'proximo'
       else 'ok'
     end,
     updated_at = now();
end;
$$;

-- View: dashboard gestor (resumo do dia)
create or replace view public.v_dashboard_day as
select
  t.id as tenant_id,
  t.name as tenant_name,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id and wo.status not in ('entregue','cancelado')
  ) as os_abertas,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id and wo.status = 'pronto'
  ) as os_prontas,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id and wo.status = 'aguardando_aprovacao'
  ) as orcamentos_pendentes,
  (
    select count(*) from public.quotes q
    where q.tenant_id = t.id and q.status = 'sent'
  ) as orcamentos_enviados,
  (
    select count(*) from public.work_orders wo
    where wo.tenant_id = t.id
      and wo.phase_entered_at < (now() - interval '24 hours')
      and wo.status not in ('entregue','cancelado')
  ) as os_paradas_24h,
  (
    select coalesce(sum(amount), 0) from public.invoices i
    where i.tenant_id = t.id and i.status = 'paga'
      and i.paid_at >= date_trunc('month', now())
  ) as faturamento_mes
from public.tenants t;

grant select on public.v_dashboard_day to authenticated;

-- View: NPS agregado
create or replace view public.v_nps_summary as
select
  tenant_id,
  count(*) as total_responses,
  avg(score) as avg_score,
  count(*) filter (where score >= 9) as promoters,
  count(*) filter (where score between 7 and 8) as passives,
  count(*) filter (where score <= 6) as detractors,
  case
    when count(*) > 0 then
      round(((count(*) filter (where score >= 9)::numeric - count(*) filter (where score <= 6)::numeric) / count(*)) * 100, 1)
    else 0
  end as nps_score
from public.nps_responses
group by tenant_id;

grant select on public.v_nps_summary to authenticated;