import { createClient } from '@/lib/supabase/server';
import { GarantiasClient } from './GarantiasClient';

export default async function GarantiasPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id').single();

  const [{ data: claims }, { data: suppliers }] = await Promise.all([
    supabase
      .from('warranty_claims')
      .select('*, supplier:suppliers(name), work_order:work_orders(number)')
      .order('created_at', { ascending: false }),
    supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
  ]);

  const bySupplier = new Map<string, { name: string; decided: number; approved: number; totalValue: number }>();
  (claims ?? []).forEach(c => {
    const name = (c.supplier as any)?.name ?? 'Sem fornecedor';
    const entry = bySupplier.get(name) ?? { name, decided: 0, approved: 0, totalValue: 0 };
    if (['aprovado', 'rejeitado', 'creditado'].includes(c.status)) {
      entry.decided += 1;
      if (c.status === 'aprovado' || c.status === 'creditado') entry.approved += 1;
    }
    if (c.status === 'creditado') entry.totalValue += Number(c.credited_value ?? c.claim_value ?? 0);
    bySupplier.set(name, entry);
  });

  return (
    <GarantiasClient
      tenantId={tenant?.id ?? ''}
      initialClaims={claims ?? []}
      suppliers={suppliers ?? []}
      supplierStats={Array.from(bySupplier.values()).sort((a, b) => b.decided - a.decided)}
    />
  );
}
