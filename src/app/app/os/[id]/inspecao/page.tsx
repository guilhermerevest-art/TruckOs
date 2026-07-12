import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { InspecaoClient } from './InspecaoClient';

export default async function InspecaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, number, public_token, vehicle:vehicles(plate, brand, model)')
    .eq('id', id)
    .single();
  if (!wo) notFound();

  const { data: tenant } = await supabase.from('tenants').select('id').single();

  const { data: items } = await supabase
    .from('wo_inspections')
    .select('*')
    .eq('work_order_id', id);

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="border-b bg-white p-4">
        <Link href={`/app/os/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar a OS #{wo.number}
        </Link>
      </div>
      <InspecaoClient
        workOrderId={id}
        tenantId={tenant?.id ?? ''}
        vehicleLabel={wo.vehicle ? `${(wo.vehicle as any).plate} — ${(wo.vehicle as any).brand} ${(wo.vehicle as any).model}` : ''}
        publicToken={wo.public_token}
        initialItems={items ?? []}
      />
    </div>
  );
}
