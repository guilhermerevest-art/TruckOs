import { createClient } from '@/lib/supabase/server';
import { SocorroClient } from './SocorroClient';

export default async function SocorroInternalPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('slug').single();

  const { data: calls } = await supabase
    .from('roadside_calls')
    .select('*, customer:customers(name), vehicle:vehicles(plate)')
    .order('created_at', { ascending: false })
    .limit(50);

  return <SocorroClient tenantSlug={tenant?.slug ?? ''} initialCalls={calls ?? []} />;
}
