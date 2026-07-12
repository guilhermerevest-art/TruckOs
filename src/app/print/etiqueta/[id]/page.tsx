// Etiqueta de patio: impressao em A4 com 12 etiquetas (ou termica 80mm)
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { KANBAN_PHASES } from '@/lib/utils';

export default async function EtiquetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: wo } = await supabase
    .from('work_orders')
    .select(
      `number, status, bay, vehicle:vehicles(plate), customer:customers(name)`,
    )
    .eq('id', id)
    .single();

  if (!wo) notFound();

  const phaseLabel = KANBAN_PHASES.find(p => p.key === wo.status)?.label ?? wo.status;
  const vehicle = wo.vehicle as any;
  const customer = wo.customer as any;

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/app/os/${id}`} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <button onClick={() => window.print()} className="btn-primary">
            <Printer className="h-4 w-4" /> Imprimir etiqueta
          </button>
        </div>

        {/* 12 etiquetas 100x50mm em A4 */}
        <div className="grid grid-cols-2 gap-3 print:gap-0">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="break-inside-avoid rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 print:border-solid print:border-slate-900"
              style={{ minHeight: '140px' }}
            >
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1">
                <div className="text-xl font-extrabold text-slate-900">#{wo.number}</div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  TruckOS
                </div>
              </div>
              <div className="mt-2 space-y-1">
                <div className="text-lg font-bold text-slate-900">{vehicle?.plate}</div>
                <div className="text-sm font-semibold text-slate-700">{customer?.name}</div>
                {wo.bay && (
                  <div className="text-xs text-slate-500">Box: {wo.bay}</div>
                )}
                <div className="mt-2 inline-block rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                  {phaseLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4; margin: 1cm; }
          .grid { gap: 0 !important; }
        }
      `}</style>
    </div>
  );
}