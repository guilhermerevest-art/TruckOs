-- =====================================================================
-- TruckOS — 20260712001500_truckos_financia.sql
-- TruckOS Financia (BNPL de reparo). Ver Bloco E3 do MD.
--
-- Nota de escopo (explicita no proprio MD): "Exige parceiro regulado —
-- e integracao, nao construir credito do zero." Sem parceiro de credito
-- configurado, isto e um SIMULADOR de parcelas + captura de interesse.
-- Nenhuma decisao de credito real acontece aqui; status fica sempre
-- 'simulado' ate existir integracao com uma fintech parceira.
-- =====================================================================

create table public.financing_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  customer_name text,
  customer_document text,
  amount numeric(12,2) not null,
  installments int not null,
  simulated_installment_value numeric(12,2) not null,
  status text not null default 'simulado'
    check (status in ('simulado','solicitado_parceiro','indisponivel')),
  created_at timestamptz not null default now()
);

create index idx_financing_requests_tenant on public.financing_requests(tenant_id, created_at desc);

alter table public.financing_requests enable row level security;

create policy "financing_requests_tenant_isolation" on public.financing_requests
  for all using (tenant_id in (select public.current_tenants()))
  with check (tenant_id in (select public.current_tenants()));

-- ---------------------------------------------------------------------
-- RPC publica: registra interesse em parcelamento na propria pagina de
-- aprovacao do orcamento (sem login, mesmo padrao de public_quote_approve).
-- ---------------------------------------------------------------------
create or replace function public.public_request_financing(
  p_token text,
  p_installments int,
  p_customer_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote record;
  v_request_id uuid;
  v_installment_value numeric;
begin
  select q.id, q.tenant_id, q.total into v_quote
  from public.quotes q where q.approval_token = p_token;

  if v_quote.id is null then
    raise exception 'invalid_token';
  end if;

  v_installment_value := round(v_quote.total / greatest(p_installments, 1), 2);

  insert into public.financing_requests
    (tenant_id, quote_id, customer_name, amount, installments, simulated_installment_value)
  values
    (v_quote.tenant_id, v_quote.id, p_customer_name, v_quote.total, p_installments, v_installment_value)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.public_request_financing to anon, authenticated;
