-- =====================================================================
-- Fix: tenants_insert_self bloqueia INSERT mesmo via service_role
-- A policy `with check (created_by = auth.uid())` falha no service_role
-- porque auth.uid() retorna NULL nesse contexto (nao ha usuario autenticado).
-- Solucao: permitir INSERT quando o chamador eh service_role (caso do /api/signup)
-- ou quando created_by bate com o usuario autenticado (futuro signup client-side).
-- ======================================================================

drop policy if exists "tenants_insert_self" on public.tenants;

create policy "tenants_insert_self" on public.tenants
  for insert with check (
    auth.role() = 'service_role'
    or created_by = auth.uid()
  );

-- Mesmo problema na policy de SELECT inicial (durante o proprio signup,
-- o usuario ainda nao eh membro do tenant que acabou de ser criado).
-- Service role precisa enxergar a linha recem-criada pra inserir o tenant_member.
drop policy if exists "tenants_select_members" on public.tenants;

create policy "tenants_select_members" on public.tenants
  for select using (
    auth.role() = 'service_role'
    or id in (select tenant_id from public.tenant_members where user_id = auth.uid() and active)
  );
