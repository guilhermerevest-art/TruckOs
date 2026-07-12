import { createClient } from '@/lib/supabase/server';
import { MarketplaceClient } from './MarketplaceClient';

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id, name').single();

  const [{ data: listings }, { data: myListings }, { data: myOrders }] = await Promise.all([
    supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'disponivel')
      .order('created_at', { ascending: false })
      .limit(100),
    tenant
      ? supabase.from('marketplace_listings').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    tenant
      ? supabase
          .from('marketplace_orders')
          .select('*, listing:marketplace_listings(description, seller_name)')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <MarketplaceClient
      tenantId={tenant?.id ?? ''}
      allListings={(listings ?? []).filter(l => l.tenant_id !== tenant?.id)}
      myListings={myListings ?? []}
      myOrders={myOrders ?? []}
    />
  );
}
