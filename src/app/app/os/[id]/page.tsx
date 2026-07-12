import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { KANBAN_PHASES, formatBRL } from '@/lib/utils';
import { ArrowLeft, ExternalLink, Wrench, Clock, Printer, Tag } from 'lucide-react';
import { PhaseMoveButtons } from './PhaseMoveButtons';
import { WODetailClient } from './WODetailClient';
import { PhotoCapture } from '@/components/PhotoCapture';

export default async function WODetailPage({
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
      customer:customers(id, name, document),
      vehicle:vehicles(id, plate, brand, model, year),
      sections:wo_sections(*),
      parts:wo_parts(*),
      quotes(*, items:quote_items(*))`,
    )
    .eq('id', id)
    .single();

  if (!wo) notFound();

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/acompanhamento/${wo.public_token}`;
  const currentPhase = KANBAN_PHASES.find(p => p.key === wo.status);
  const customer = wo.customer as any;
  const vehicle = wo.vehicle as any;
  const sections = (wo.sections as any[]) ?? [];
  const parts = (wo.parts as any[]) ?? [];
  const quotes = (wo.quotes as any[]) ?? [];

  const totalParts = parts.reduce((acc, p) => acc + Number(p.qty) * Number(p.unit_price), 0);
  const totalLabor = sections.reduce((acc, s) => acc + Number(s.std_hours ?? 0) * Number(s.labor_rate ?? 0), 0);
  const totalGeral = totalParts + totalLabor;

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/os"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao Kanban
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-slate-500">Ordem de Servico</div>
            <h1 className="text-3xl font-extrabold text-slate-900">#{wo.number}</h1>
            <div className="mt-2 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs text-slate-500">Cliente</div>
                <Link href={`/app/clientes/${customer?.id}`} className="font-bold text-slate-900 hover:text-sky-600">
                  {customer?.name}
                </Link>
              </div>
              <div>
                <div className="text-xs text-slate-500">Veiculo</div>
                <div className="font-bold text-slate-900">{vehicle?.plate}</div>
                <div className="text-xs text-slate-500">
                  {vehicle?.brand} {vehicle?.model}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Hodometro</div>
                <div className="font-bold text-slate-900">
                  {(wo.odometer_km ?? 0).toLocaleString('pt-BR')} km
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Fase atual</div>
                <span
                  className={`phase-chip ${currentPhase?.color}`}
                >
                  {currentPhase?.label}
                </span>
              </div>
            </div>
            {wo.reported_issue && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
                <span className="font-semibold text-amber-900">Defeito relatado:</span>{' '}
                <span className="text-amber-900">{wo.reported_issue}</span>
              </div>
            )}
          </div>

          {/* Acoes rapidas */}
          <div className="flex flex-col gap-2">
            <Link
              href={`/print/os/${wo.id}`}
              target="_blank"
              className="btn-secondary"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </Link>
            <Link
              href={`/print/etiqueta/${wo.id}`}
              target="_blank"
              className="btn-secondary"
            >
              <Tag className="h-4 w-4" /> Etiqueta patio
            </Link>
            {!quotes.length && (
              <Link
                href={`/app/orcamentos/novo?wo_id=${wo.id}`}
                className="btn-primary"
              >
                + Criar orcamento
              </Link>
            )}
          </div>
        </div>

        {/* Botoes de fase */}
        <PhaseMoveButtons woId={wo.id} currentPhase={wo.status} woNumber={wo.number} />

        {/* Link publico */}
        {wo.public_token && (
          <div className="mt-4 rounded-lg border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700">
              Link publico de acompanhamento
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-600">
                {publicUrl}
              </code>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Grid principal */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Fotos da OS */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Fotos e midia</h2>
            <PhotoCapture workOrderId={wo.id} kind="foto_servico" />
          </div>

          {/* Secoes de servico */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Wrench className="h-5 w-5 text-sky-600" /> Secoes de servico
              </h2>
              <span className="badge badge-neutral">{sections.length}</span>
            </div>
            <WODetailClient woId={wo.id} initialSections={sections} initialParts={parts} />
          </div>

          {/* Orcamentos */}
          {quotes.length > 0 && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-bold text-slate-900">Orcamentos</h2>
              <div className="space-y-2">
                {quotes.map(q => (
                  <Link
                    key={q.id}
                    href={`/app/orcamentos/${q.id}`}
                    className="flex items-center justify-between rounded-lg border bg-slate-50 p-3 hover:bg-slate-100"
                  >
                    <div>
                      <div className="font-semibold">Orcamento</div>
                      <div className="text-xs text-slate-500">
                        {q.status} · {new Date(q.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">
                        R$ {Number(q.total).toFixed(2)}
                      </div>
                      <div className="text-xs text-sky-600">Ver →</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-bold text-slate-900">Totais</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Peças</span>
                <span className="font-medium">{formatBRL(totalParts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mão de obra</span>
                <span className="font-medium">{formatBRL(totalLabor)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-2xl font-extrabold">
                <span>Total</span>
                <span className="text-sky-700">{formatBRL(totalGeral)}</span>
              </div>
              {totalGeral === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Adicione serviços e peças para compor o valor.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
              <Clock className="h-4 w-4 text-slate-500" /> Historico
            </h3>
            <ol className="space-y-2 text-sm">
              {((wo as any).history ?? [])?.slice(0, 8).map((h: any) => (
                <li key={h.id} className="border-l-2 border-sky-300 pl-3">
                  <div className="font-semibold text-slate-900">
                    {KANBAN_PHASES.find(p => p.key === h.to_status)?.label ?? h.to_status}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(h.at).toLocaleString('pt-BR')}
                  </div>
                  {h.note && <div className="text-xs text-slate-600">{h.note}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}