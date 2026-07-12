import { createClient } from '@/lib/supabase/server';
import { AgendaClient } from './AgendaClient';

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id').single();

  const { data: mechanics } = await supabase
    .from('tenant_members')
    .select('user_id, display_name, role')
    .in('role', ['mechanic', 'advisor'])
    .eq('active', true);

  return (
    <AgendaClient
      tenantId={tenant?.id ?? ''}
      mechanics={(mechanics ?? []).map(m => ({
        id: m.user_id,
        name: m.display_name ?? `${m.role === 'mechanic' ? 'Mecânico' : 'Consultor'} ${m.user_id.slice(0, 4)}`,
      }))}
    />
  );
}
