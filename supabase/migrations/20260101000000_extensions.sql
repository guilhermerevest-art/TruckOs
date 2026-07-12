-- =====================================================================
-- TruckOS — 001_extensions.sql
-- Extensoes necessarias e configuracao base
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "uuid-ossp";
create extension if not exists "pgsodium";      -- criptografia de credenciais

-- Funcao utilitaria: updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Funcao utilitaria: grava audit log generico
create or replace function public.write_audit_log()
returns trigger
language plpgsql
as $$
begin
  insert into public.audit_logs (tenant_id, user_id, action, entity, entity_id, before, after)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

comment on function public.write_audit_log() is
  'Trigger generica que espelha operacoes de tabelas de negocio em audit_logs.';
