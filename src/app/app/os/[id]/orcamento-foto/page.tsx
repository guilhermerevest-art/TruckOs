import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PhotoQuoteClient } from './PhotoQuoteClient';

export default async function OrcamentoFotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, number, vehicle:vehicles(plate, brand, model, year)')
    .eq('id', id)
    .single();

  if (!wo) notFound();
  const vehicle = wo.vehicle as any;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="p-4">
        <Link
          href={`/app/os/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar a OS #{wo.number}
        </Link>
      </div>
      <PhotoQuoteClient
        workOrderId={id}
        vehicleLabel={vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : ''}
      />
    </div>
  );
}
