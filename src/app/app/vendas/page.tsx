import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Receipt, TrendingUp } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cartao: 'Cartão',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  fiado: 'Fiado',
};

export default async function VendasPage() {
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [{ data: sales }, { data: salesToday }, { data: salesMonth }] = await Promise.all([
    supabase
      .from('part_sales')
      .select('id, total, payment_method, status, created_at, customer:customers(name)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('part_sales').select('total').eq('status', 'concluida').gte('created_at', startOfDay.toISOString()),
    supabase.from('part_sales').select('total').eq('status', 'concluida').gte('created_at', startOfMonth.toISOString()),
  ]);

  const totalHoje = (salesToday ?? []).reduce((acc, s) => acc + Number(s.total), 0);
  const totalMes = (salesMonth ?? []).reduce((acc, s) => acc + Number(s.total), 0);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendas balcão</h1>
          <p className="text-sm text-slate-500">Venda de peças avulsa, sem precisar abrir OS</p>
        </div>
        <Link href="/app/vendas/nova" className="btn-primary">
          <Plus className="h-4 w-4" /> Nova venda
        </Link>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="card-base p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Vendido hoje</span>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(totalHoje)}</div>
        </div>
        <div className="card-base p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Vendido este mês</span>
            <Receipt className="h-5 w-5 text-sky-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(totalMes)}</div>
        </div>
      </div>

      <div className="space-y-2">
        {sales?.map(s => (
          <Link
            key={s.id}
            href={`/app/vendas/${s.id}`}
            className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-slate-400" />
              <div>
                <div className="font-bold text-slate-900">
                  {(s.customer as any)?.name ?? 'Venda avulsa'}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(s.created_at).toLocaleString('pt-BR')}
                  {s.payment_method && ` · ${PAYMENT_LABELS[s.payment_method] ?? s.payment_method}`}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-slate-900">{formatBRL(Number(s.total))}</div>
              {s.status === 'cancelada' && (
                <span className="text-xs font-semibold text-red-600">Cancelada</span>
              )}
            </div>
          </Link>
        ))}

        {!sales?.length && (
          <div className="empty-state">
            <div className="text-slate-400">Nenhuma venda registrada ainda</div>
            <Link href="/app/vendas/nova" className="mt-4 inline-block text-sm font-semibold text-sky-600 hover:underline">
              + Primeira venda
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
