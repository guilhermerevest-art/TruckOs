import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Truck } from 'lucide-react';
import { formatBRL } from '@/lib/utils';
import { ReceiveItems } from './ReceiveItems';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  cotacao: { label: 'Cotação', color: 'bg-slate-100 text-slate-700' },
  pedido: { label: 'Pedido feito', color: 'bg-blue-100 text-blue-700' },
  recebido_parcial: { label: 'Recebido parcial', color: 'bg-amber-100 text-amber-700' },
  recebido: { label: 'Recebido', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from('purchases')
    .select('*, supplier:suppliers(name, cnpj, contacts), items:purchase_items(*)')
    .eq('id', id)
    .single();

  if (!purchase) notFound();

  const meta = STATUS_LABELS[purchase.status] ?? STATUS_LABELS.cotacao;
  const items = (purchase.items as any[]) ?? [];
  const supplier = purchase.supplier as any;

  return (
    <div className="p-6 lg:p-8">
      <Link href="/app/compras" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Truck className="h-3.5 w-3.5" /> Compra
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{supplier?.name ?? 'Fornecedor não definido'}</h1>
            <div className="mt-1 text-sm text-slate-500">
              Criada em {new Date(purchase.created_at).toLocaleDateString('pt-BR')}
              {purchase.expected_at && ` · previsão ${new Date(purchase.expected_at).toLocaleDateString('pt-BR')}`}
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${meta.color}`}>{meta.label}</span>
        </div>

        {purchase.notes && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{purchase.notes}</div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Itens</div>
            <div className="font-semibold">{formatBRL(Number(purchase.total) - Number(purchase.freight ?? 0))}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Frete</div>
            <div className="font-semibold">{formatBRL(Number(purchase.freight ?? 0))}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-lg font-bold text-sky-700">{formatBRL(Number(purchase.total))}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Receber mercadoria</h2>
        {purchase.status === 'recebido' ? (
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
            ✅ Compra totalmente recebida em{' '}
            {purchase.received_at && new Date(purchase.received_at).toLocaleDateString('pt-BR')}.
            Conta a pagar já foi criada no Financeiro.
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              Informe o que chegou de cada item. O estoque e o custo médio são atualizados na hora.
            </p>
            <ReceiveItems items={items} />
          </>
        )}
      </div>
    </div>
  );
}
