import { createClient } from '@/lib/supabase/server';
import { RadarClient } from './RadarClient';

export default async function RadarPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id').single();

  const [{ data: opportunities }, { data: recallMatches }] = await Promise.all([
    supabase
      .from('repurchase_opportunities')
      .select('*, vehicle:vehicles(plate, brand, model), customer:customers(name, contacts:customer_contacts(phone_e164, whatsapp))')
      .order('predicted_at', { ascending: true }),
    tenant ? supabase.rpc('vehicle_recall_matches', { p_tenant_id: tenant.id }) : Promise.resolve({ data: [] }),
  ]);

  return (
    <RadarClient
      tenantId={tenant?.id ?? ''}
      initialOpportunities={opportunities ?? []}
      recallMatches={recallMatches ?? []}
    />
  );
}
