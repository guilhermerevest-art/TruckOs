import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cartao: 'Cartão',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  fiado: 'Fiado',
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from('part_sales')
    .select('*, customer:customers(name, document), items:part_sale_items(*)')
    .eq('id', id)
    .single();

  if (!sale) notFound();

  const customer = sale.customer as any;
  const items = (sale.items as any[]) ?? [];

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <Link href="/app/vendas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Receipt className="h-3.5 w-3.5" /> Venda de balcão
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{customer?.name ?? 'Venda avulsa'}</h1>
            <div className="mt-1 text-sm text-slate-500">
              {new Date(sale.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
          {sale.status === 'cancelada' && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Cancelada</span>
          )}
        </div>

        <div className="mt-5 divide-y border-t">
          {items.map(it => (
            <div key={it.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-semibold text-slate-900">{it.description}</div>
                <div className="text-xs text-slate-500">
                  {Number(it.qty)}x · {formatBRL(Number(it.unit_price))}
                </div>
              </div>
              <div className="font-bold text-slate-900">
                {formatBRL(Number(it.qty) * Number(it.unit_price))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span>{formatBRL(Number(sale.subtotal))}</span>
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Desconto</span>
              <span>- {formatBRL(Number(sale.discount))}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-2xl font-extrabold">
            <span>Total</span>
            <span className="text-sky-700">{formatBRL(Number(sale.total))}</span>
          </div>
          {sale.payment_method && (
            <div className="mt-2 text-xs text-slate-500">
              Pago via {PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
