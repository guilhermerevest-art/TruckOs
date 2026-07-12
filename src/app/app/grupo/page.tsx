import { createClient } from '@/lib/supabase/server';
import { GrupoClient } from './GrupoClient';

export default async function GrupoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tenant } = await supabase.from('tenants').select('id, name, group_id').single();

  if (!tenant?.group_id) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Grupo / Rede</h1>
        <div className="empty-state">
          Sua oficina ainda não faz parte de uma rede no TruckOS. Esse recurso é para grupos com
          múltiplas unidades (redes regionais, concessionárias) — fale com o suporte TruckOS para
          organizar suas unidades em um grupo.
        </div>
      </div>
    );
  }

  const { data: isAdmin } = await supabase
    .from('tenant_group_admins')
    .select('group_id')
    .eq('group_id', tenant.group_id)
    .eq('user_id', user?.id ?? '')
    .maybeSingle();

  const { data: priceList } = await supabase
    .from('group_price_lists')
    .select('*')
    .eq('group_id', tenant.group_id)
    .order('description');

  let dashboard: any[] = [];
  if (isAdmin) {
    const { data } = await supabase.rpc('group_dashboard', { p_group_id: tenant.group_id });
    dashboard = data ?? [];
  }

  return (
    <GrupoClient
      groupId={tenant.group_id}
      isAdmin={!!isAdmin}
      dashboard={dashboard}
      priceList={priceList ?? []}
    />
  );
}
