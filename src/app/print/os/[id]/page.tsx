// Pagina de impressao da OS (otimizada pra A4 / impressora termica 80mm)
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import { KANBAN_PHASES } from '@/lib/utils';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function PrintOSPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: wo } = await supabase
    .from('work_orders')
    .select(
      `*,
      customer:customers(name, document, email),
      vehicle:vehicles(plate, brand, model, year, vin),
      sections:wo_sections(*),
      parts:wo_parts(*)`,
    )
    .eq('id', id)
    .single();

  if (!wo) notFound();

  const customer = wo.customer as any;
  const vehicle = wo.vehicle as any;
  const sections = (wo.sections as any[]) ?? [];
  const parts = (wo.parts as any[]) ?? [];

  const phaseLabel = KANBAN_PHASES.find(p => p.key === wo.status)?.label ?? wo.status;

  const totalParts = parts.reduce((acc, p) => acc + Number(p.qty) * Number(p.unit_price), 0);
  const totalLabor = sections.reduce((acc, s) => acc + Number(s.std_hours ?? 0) * Number(s.labor_rate ?? 0), 0);
  const total = totalParts + totalLabor;

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/app/os/${id}`} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <button onClick={() => window.print()} className="btn-primary">
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </button>
        </div>

        {/* Documento */}
        <article className="rounded-xl bg-white p-8 shadow-sm print:shadow-none print:rounded-none">
          {/* Cabeçalho */}
          <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900">ORDEM DE SERVIÇO</h1>
              <div className="mt-1 text-2xl font-bold text-sky-700">#{wo.number}</div>
              <div className="mt-2 text-sm text-slate-500">
                Aberta em {new Date(wo.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Fase atual
              </div>
              <div className="mt-1 rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-700">
                {phaseLabel}
              </div>
            </div>
          </header>

          {/* Cliente + Veículo */}
          <section className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cliente
              </div>
              <div className="mt-1 text-base font-bold">{customer?.name}</div>
              {customer?.document && <div className="text-sm text-slate-600">{customer.document}</div>}
              {customer?.email && <div className="text-sm text-slate-600">{customer.email}</div>}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Veículo
              </div>
              <div className="mt-1 text-base font-bold">{vehicle?.plate}</div>
              <div className="text-sm text-slate-600">
                {vehicle?.brand} {vehicle?.model} {vehicle?.year}
              </div>
              {vehicle?.vin && <div className="text-xs text-slate-500">VIN: {vehicle.vin}</div>}
            </div>
          </section>

          {/* Defeito */}
          {wo.reported_issue && (
            <section className="mt-6 rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Defeito relatado
              </div>
              <p className="mt-1 text-sm">{wo.reported_issue}</p>
            </section>
          )}

          {/* Serviços */}
          {sections.length > 0 && (
            <section className="mt-6">
              <h2 className="border-b pb-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                Serviços
              </h2>
              <table className="mt-3 w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 text-left">Categoria</th>
                    <th className="py-2 text-left">Descrição</th>
                    <th className="py-2 text-right">Tempo</th>
                    <th className="py-2 text-right">Valor/h</th>
                    <th className="py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sections.map(s => (
                    <tr key={s.id}>
                      <td className="py-2 font-semibold">{s.category}</td>
                      <td className="py-2">{s.description}</td>
                      <td className="py-2 text-right">{Number(s.std_hours).toFixed(1)}h</td>
                      <td className="py-2 text-right">{formatBRL(Number(s.labor_rate))}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatBRL(Number(s.std_hours) * Number(s.labor_rate))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Peças */}
          {parts.length > 0 && (
            <section className="mt-6">
              <h2 className="border-b pb-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                Peças
              </h2>
              <table className="mt-3 w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 text-left">Descrição</th>
                    <th className="py-2 text-right">Qtd</th>
                    <th className="py-2 text-right">Unit.</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parts.map(p => (
                    <tr key={p.id}>
                      <td className="py-2">{p.description}</td>
                      <td className="py-2 text-right">{Number(p.qty)}</td>
                      <td className="py-2 text-right">{formatBRL(Number(p.unit_price))}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatBRL(Number(p.qty) * Number(p.unit_price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Total */}
          <section className="mt-6 flex justify-end border-t-2 border-slate-900 pt-4">
            <div className="w-64 text-right">
              <div className="flex justify-between text-sm">
                <span>Peças:</span>
                <span>{formatBRL(totalParts)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Mão de obra:</span>
                <span>{formatBRL(totalLabor)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2 text-2xl font-extrabold">
                <span>TOTAL:</span>
                <span className="text-sky-700">{formatBRL(total)}</span>
              </div>
            </div>
          </section>

          {/* Garantia + Assinatura */}
          <section className="mt-10 grid grid-cols-2 gap-8 border-t pt-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Garantia
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {wo.warranty_terms ?? '90 dias para serviços / conforme fabricante para peças.'}
              </p>
            </div>
            <div>
              <div className="border-t-2 border-slate-900 pt-1 text-center text-xs text-slate-500">
                Assinatura do cliente
              </div>
            </div>
          </section>
        </article>
      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  );
}