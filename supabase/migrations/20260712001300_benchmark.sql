-- =====================================================================
-- TruckOS — 20260712001300_benchmark.sql
-- Benchmark Anonimo entre Oficinas. Ver Bloco E1 do MD.
-- Regras inegociaveis (do proprio MD): opt-in explicito, k-anonimato
-- (minimo de tenants por recorte pra exibir), nunca dado que identifique
-- cliente final. So 3 KPIs no primeiro corte (ticket medio, conversao de
-- orcamento, prazo medio de entrega) — deliberadamente enxuto.
-- =====================================================================

alter table public.tenants
  add column if not exists benchmark_opt_in boolean not null default false;

create table public.benchmark_aggregates (
  id uuid primary key default gen_random_uuid(),
  porte text not null,
  regiao text not null,
  tenant_count int not null,
  ticket_medio_p25 numeric(12,2),
  ticket_medio_p50 numeric(12,2),
  ticket_medio_p75 numeric(12,2),
  conversao_p25 numeric(5,2),
  conversao_p50 numeric(5,2),
  conversao_p75 numeric(5,2),
  prazo_dias_p25 numeric(6,1),
  prazo_dias_p50 numeric(6,1),
  prazo_dias_p75 numeric(6,1),
  computed_at timestamptz not null default now(),
  unique (porte, regiao)
);

-- Leitura publica dos agregados (sao anonimos por natureza — nunca tem
-- tenant_id nem cliente). Sem policy de escrita: so a funcao abaixo grava.
alter table public.benchmark_aggregates enable row level security;
create policy "benchmark_aggregates_select_all" on public.benchmark_aggregates
  for select using (true);

-- ---------------------------------------------------------------------
-- Recalcula os agregados (roda sob demanda — sem cron real neste
-- projeto ainda; mesmo padrao do radar/PM). k-anonimato aplicado na
-- LEITURA (tenant_benchmark), nao aqui — aqui so guardamos o bucket.
-- ---------------------------------------------------------------------
create or replace function public.compute_benchmark_aggregates()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.benchmark_aggregates;

  insert into public.benchmark_aggregates
    (porte, regiao, tenant_count,
     ticket_medio_p25, ticket_medio_p50, ticket_medio_p75,
     conversao_p25, conversao_p50, conversao_p75,
     prazo_dias_p25, prazo_dias_p50, prazo_dias_p75)
  select
    porte, regiao, count(*)::int,
    percentile_cont(0.25) within group (order by ticket_medio),
    percentile_cont(0.50) within group (order by ticket_medio),
    percentile_cont(0.75) within group (order by ticket_medio),
    percentile_cont(0.25) within group (order by conversao),
    percentile_cont(0.50) within group (order by conversao),
    percentile_cont(0.75) within group (order by conversao),
    percentile_cont(0.25) within group (order by prazo_dias),
    percentile_cont(0.50) within group (order by prazo_dias),
    percentile_cont(0.75) within group (order by prazo_dias)
  from (
    select
      t.id as tenant_id,
      case
        when os_mes.qtd < 50 then 'pequena'
        when os_mes.qtd < 150 then 'media'
        else 'grande'
      end as porte,
      coalesce(t.address->>'state', 'BR') as regiao,
      coalesce((
        select avg(i.paid_amount) from public.invoices i
        where i.tenant_id = t.id and i.status = 'paga' and i.paid_at >= now() - interval '90 days'
      ), 0) as ticket_medio,
      coalesce((
        select (count(*) filter (where q.status = 'approved')::numeric / nullif(count(*), 0)) * 100
        from public.quotes q
        where q.tenant_id = t.id and q.created_at >= now() - interval '90 days'
          and q.status in ('approved','rejected','expired','partial')
      ), 0) as conversao,
      (
        select avg(extract(epoch from (wo.delivered_at - wo.created_at)) / 86400.0)
        from public.work_orders wo
        where wo.tenant_id = t.id and wo.status = 'entregue' and wo.delivered_at >= now() - interval '90 days'
      ) as prazo_dias
    from public.tenants t
    join lateral (
      select count(*) as qtd from public.work_orders wo2
      where wo2.tenant_id = t.id and wo2.created_at >= now() - interval '30 days'
    ) os_mes on true
    where t.benchmark_opt_in and not t.is_sandbox
  ) x
  where prazo_dias is not null
  group by porte, regiao;
end;
$$;

grant execute on function public.compute_benchmark_aggregates to authenticated;

-- ---------------------------------------------------------------------
-- RPC: KPIs do proprio tenant + faixa de mercado do seu bucket, com
-- k-anonimato (minimo 5 tenants no recorte pra exibir a faixa).
-- ---------------------------------------------------------------------
create or replace function public.tenant_benchmark(p_tenant_id uuid, p_min_k int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_own jsonb;
  v_porte text;
  v_regiao text;
  v_bucket record;
begin
  if not exists (
    select 1 from public.tenant_members where user_id = auth.uid() and tenant_id = p_tenant_id and active
  ) then
    raise exception 'forbidden';
  end if;

  select t.*, coalesce(t.address->>'state', 'BR') as regiao_calc into v_tenant from public.tenants t where t.id = p_tenant_id;

  select
    case
      when (select count(*) from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.created_at >= now() - interval '30 days') < 50 then 'pequena'
      when (select count(*) from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.created_at >= now() - interval '30 days') < 150 then 'media'
      else 'grande'
    end into v_porte;
  v_regiao := v_tenant.regiao_calc;

  select jsonb_build_object(
    'ticket_medio', coalesce((select avg(i.paid_amount) from public.invoices i where i.tenant_id = p_tenant_id and i.status = 'paga' and i.paid_at >= now() - interval '90 days'), 0),
    'conversao', coalesce((select (count(*) filter (where q.status = 'approved')::numeric / nullif(count(*), 0)) * 100 from public.quotes q where q.tenant_id = p_tenant_id and q.created_at >= now() - interval '90 days' and q.status in ('approved','rejected','expired','partial')), 0),
    'prazo_dias', (select avg(extract(epoch from (wo.delivered_at - wo.created_at)) / 86400.0) from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.status = 'entregue' and wo.delivered_at >= now() - interval '90 days')
  ) into v_own;

  select * into v_bucket from public.benchmark_aggregates where porte = v_porte and regiao = v_regiao;

  if v_bucket is null or v_bucket.tenant_count < p_min_k then
    return jsonb_build_object('opted_in', v_tenant.benchmark_opt_in, 'own', v_own, 'bucket', null, 'porte', v_porte, 'regiao', v_regiao);
  end if;

  return jsonb_build_object(
    'opted_in', v_tenant.benchmark_opt_in,
    'own', v_own,
    'porte', v_porte,
    'regiao', v_regiao,
    'bucket', jsonb_build_object(
      'tenant_count', v_bucket.tenant_count,
      'ticket_medio_p25', v_bucket.ticket_medio_p25, 'ticket_medio_p50', v_bucket.ticket_medio_p50, 'ticket_medio_p75', v_bucket.ticket_medio_p75,
      'conversao_p25', v_bucket.conversao_p25, 'conversao_p50', v_bucket.conversao_p50, 'conversao_p75', v_bucket.conversao_p75,
      'prazo_dias_p25', v_bucket.prazo_dias_p25, 'prazo_dias_p50', v_bucket.prazo_dias_p50, 'prazo_dias_p75', v_bucket.prazo_dias_p75
    )
  );
end;
$$;

grant execute on function public.tenant_benchmark to authenticated;
