import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Package, Clock, CheckCircle2 } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  cotacao: { label: 'Cotação', color: 'bg-slate-100 text-slate-700' },
  pedido: { label: 'Pedido feito', color: 'bg-blue-100 text-blue-700' },
  recebido_parcial: { label: 'Recebido parcial', color: 'bg-amber-100 text-amber-700' },
  recebido: { label: 'Recebido', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('purchases')
    .select('id, status, total, expected_at, received_at, created_at, supplier:suppliers(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data: purchases } = await query;

  const { count: abertasCount } = await supabase
    .from('purchases')
    .select('*', { count: 'exact', head: true })
    .in('status', ['cotacao', 'pedido', 'recebido_parcial']);

  const { data: recebidasMes } = await supabase
    .from('purchases')
    .select('total')
    .eq('status', 'recebido')
    .gte('received_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const totalRecebidoMes = (recebidasMes ?? []).reduce((acc, p) => acc + Number(p.total), 0);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
          <p className="text-sm text-slate-500">Pedidos a fornecedores e recebimento de mercadoria</p>
        </div>
        <Link href="/app/compras/nova" className="btn-primary">
          <Plus className="h-4 w-4" /> Nova compra
        </Link>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="card-base p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Em aberto (aguardando receber)</span>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{abertasCount ?? 0}</div>
        </div>
        <div className="card-base p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Recebido este mês</span>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(totalRecebidoMes)}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { v: 'all', label: 'Todas' },
          { v: 'cotacao', label: 'Cotação' },
          { v: 'pedido', label: 'Pedido feito' },
          { v: 'recebido_parcial', label: 'Recebido parcial' },
          { v: 'recebido', label: 'Recebido' },
        ].map(f => (
          <Link
            key={f.v}
            href={`/app/compras?status=${f.v}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              (params.status ?? 'all') === f.v
                ? 'bg-sky-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {purchases?.map(p => {
          const meta = STATUS_LABELS[p.status] ?? STATUS_LABELS.cotacao;
          return (
            <Link
              key={p.id}
              href={`/app/compras/${p.id}`}
              className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-slate-400" />
                <div>
                  <div className="font-bold text-slate-900">
                    {(p.supplier as any)?.name ?? 'Fornecedor não definido'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    {p.expected_at && ` · previsão ${new Date(p.expected_at).toLocaleDateString('pt-BR')}`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-900">{formatBRL(Number(p.total))}</div>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
            </Link>
          );
        })}

        {!purchases?.length && (
          <div className="empty-state">
            <div className="text-slate-400">Nenhuma compra registrada</div>
            <Link href="/app/compras/nova" className="mt-4 inline-block text-sm font-semibold text-sky-600 hover:underline">
              + Fazer primeira compra
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
