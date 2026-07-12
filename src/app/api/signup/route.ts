import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { email, password, name, slug } = await req.json();

  // 1. cria usuario no Auth (anon key ok, signup eh publico)
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
  if (!authData.user) return NextResponse.json({ error: 'signup_failed' }, { status: 400 });

  // 2. cria tenant via service_role (bypassa RLS)
  const admin = createAdminClient();
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({
      name,
      slug,
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: authData.user.id,
    })
    .select()
    .single();
  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 400 });

  // 3. vincula como owner
  const { error: memberError } = await admin
    .from('tenant_members')
    .insert({
      tenant_id: tenant.id,
      user_id: authData.user.id,
      role: 'owner',
    });
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 400 });

  // 4. cria um warehouse padrao para a oficina
  await admin.from('warehouses').insert({
    tenant_id: tenant.id,
    name: 'Almoxarifado Principal',
    kind: 'matriz',
  });

  return NextResponse.json({ ok: true, tenantId: tenant.id });
}