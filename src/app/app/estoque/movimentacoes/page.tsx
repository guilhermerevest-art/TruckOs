import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import { ArrowDown, ArrowUp, RefreshCcw, ArrowLeftRight } from 'lucide-react';

const MOVE_LABELS: Record<string, { label: string; color: string; sign: 'in' | 'out' | 'neutral' }> = {
  entrada_nf: { label: 'Entrada NF', color: 'bg-green-100 text-green-700', sign: 'in' },
  saida_os: { label: 'Saida OS', color: 'bg-orange-100 text-orange-700', sign: 'out' },
  ajuste: { label: 'Ajuste', color: 'bg-slate-100 text-slate-700', sign: 'neutral' },
  devolucao: { label: 'Devolucao', color: 'bg-blue-100 text-blue-700', sign: 'in' },
  transferencia: { label: 'Transferencia', color: 'bg-purple-100 text-purple-700', sign: 'neutral' },
  garantia: { label: 'Garantia', color: 'bg-red-100 text-red-700', sign: 'out' },
};

export default async function MovimentacoesPage() {
  const supabase = await createClient();
  const { data: moves } = await supabase
    .from('stock_moves')
    .select('id, kind, qty, unit_cost, created_at, note, part:parts(sku,description), warehouse:warehouses(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Movimentacoes de estoque</h1>
      <p className="text-sm text-slate-500">Entradas, saidas e ajustes recentes</p>

      <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Peca</th>
              <th className="px-4 py-3">Almox.</th>
              <th className="px-4 py-3 text-right">Qtd</th>
              <th className="px-4 py-3 text-right">Custo unit.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {moves?.map(m => {
              const meta = MOVE_LABELS[m.kind] ?? MOVE_LABELS.ajuste;
              const Icon = meta.sign === 'in' ? ArrowUp : meta.sign === 'out' ? ArrowDown : ArrowLeftRight;
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(m.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{(m.part as any)?.description}</div>
                    <div className="font-mono text-xs text-slate-500">{(m.part as any)?.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{(m.warehouse as any)?.name}</td>
                  <td className={`px-4 py-3 text-right font-bold ${meta.sign === 'in' ? 'text-green-600' : meta.sign === 'out' ? 'text-orange-600' : 'text-slate-600'}`}>
                    {meta.sign === 'out' ? '-' : ''}
                    {Number(m.qty).toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {formatBRL(Number(m.unit_cost))}
                  </td>
                </tr>
              );
            })}
            {!moves?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  Nenhuma movimentacao registrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}