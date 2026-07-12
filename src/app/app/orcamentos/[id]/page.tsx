import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import { ArrowLeft, MessageCircle, Send, Check } from 'lucide-react';
import Link from 'next/link';
import { QuoteActions } from './QuoteActions';

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from('quotes')
    .select(
      `*,
      items:quote_items(*),
      work_order:work_orders(
        number, reported_issue, status, customer:customers(name, document), vehicle:vehicles(plate, brand, model)
      )`,
    )
    .eq('id', id)
    .single();

  if (!quote) notFound();

  const wo = quote.work_order as any;
  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/aprovar/${quote.approval_token}`;

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/orcamentos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
              OS #{wo?.number}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{wo?.customer?.name}</h1>
            <div className="text-sm text-slate-500">
              {wo?.vehicle?.plate} · {wo?.vehicle?.brand} {wo?.vehicle?.model}
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <span className="font-semibold">Defeito:</span> {wo?.reported_issue}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Itens do orcamento</h2>
            <div className="divide-y">
              {quote.items?.map(it => (
                <div key={it.id} className="flex items-center justify-between py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          it.kind === 'part'
                            ? 'bg-blue-100 text-blue-700'
                            : it.kind === 'labor'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {it.kind === 'part' ? 'Peca' : it.kind === 'labor' ? 'M.O.' : 'Terceiro'}
                      </span>
                      <span className="text-sm font-medium">{it.description}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {Number(it.qty)}x · {formatBRL(Number(it.unit_price))}
                      {it.option_group && it.option_group !== 'completo' && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                          {it.option_group}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">
                      {formatBRL(Number(it.qty) * Number(it.unit_price))}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        it.status === 'approved'
                          ? 'text-green-600'
                          : it.status === 'rejected'
                          ? 'text-red-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {it.status === 'approved' ? 'Aprovado' : it.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{formatBRL(Number(quote.subtotal))}</span>
              </div>
              {Number(quote.discount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Desconto</span>
                  <span>- {formatBRL(Number(quote.discount))}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>Total</span>
                <span>{formatBRL(Number(quote.total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">Status</h3>
            <div className="mt-2 text-sm">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  quote.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : quote.status === 'sent'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {quote.status}
              </span>
            </div>
            {quote.valid_until && (
              <div className="mt-2 text-xs text-slate-500">
                Valido ate {new Date(quote.valid_until).toLocaleDateString('pt-BR')}
              </div>
            )}
            {quote.sent_at && (
              <div className="mt-1 text-xs text-slate-500">
                Enviado em {new Date(quote.sent_at).toLocaleDateString('pt-BR')}
              </div>
            )}
            {quote.approved_at && (
              <div className="mt-1 text-xs text-green-600">
                Aprovado em {new Date(quote.approved_at).toLocaleDateString('pt-BR')}
              </div>
            )}
          </div>

          {/* Link publico */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">Link de aprovacao</h3>
            <p className="mt-1 text-xs text-slate-500">
              Cliente aprova item a item pelo celular, sem login.
            </p>
            <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700 break-all">
              {publicUrl}
            </div>
            <QuoteActions
              quoteId={quote.id}
              status={quote.status}
              approvalToken={quote.approval_token}
              publicUrl={publicUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}