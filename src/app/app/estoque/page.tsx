import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Search, AlertTriangle, Package, TrendingDown, TrendingUp, ShoppingCart, Receipt, ClipboardList } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('parts')
    .select(
      'id, sku, description, brand, category, sale_price, min_qty, max_qty, location, stock_balances(qty)',
    )
    .eq('active', true)
    .order('description', { ascending: true })
    .limit(200);

  if (params.q) {
    query = query.or(`description.ilike.%${params.q}%,sku.ilike.%${params.q}%`);
  }

  const { data: parts } = await query;

  // Pega o saldo atual (do warehouse default)
  const items = (parts ?? []).map(p => {
    const balance = (p.stock_balances as any[])?.[0];
    const qty = balance?.qty ?? 0;
    const low = p.min_qty && qty < p.min_qty;
    return { ...p, qty, low };
  });

  const filtered = params.low === '1' ? items.filter(i => i.low) : items;

  // KPIs
  const totalPecas = items.length;
  const pecasBaixas = items.filter(i => i.low).length;
  const valorTotal = items.reduce(
    (acc, i) => acc + i.qty * Number(i.sale_price ?? 0),
    0,
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estoque</h1>
          <p className="text-sm text-slate-500">Pecas, saldos e alertas de reposicao</p>
        </div>
        <Link
          href="/app/estoque/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" /> Nova peca
        </Link>
      </div>

      {/* Atalhos do almoxarifado */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/app/compras" className="btn-secondary">
          <ShoppingCart className="h-4 w-4" /> Compras
        </Link>
        <Link href="/app/vendas" className="btn-secondary">
          <Receipt className="h-4 w-4" /> Vendas balcão
        </Link>
        <Link href="/app/estoque/movimentacoes" className="btn-secondary">
          <ClipboardList className="h-4 w-4" /> Movimentações
        </Link>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Pecas cadastradas</span>
            <Package className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalPecas}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Abaixo do minimo</span>
            <TrendingDown className="h-5 w-5 text-orange-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-orange-600">{pecasBaixas}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Valor total em estoque</span>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(valorTotal)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <form className="flex flex-1 items-center gap-2" action="/app/estoque">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Buscar peca ou SKU..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <button className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300">
            Buscar
          </button>
        </form>
        <Link
          href={params.low === '1' ? '/app/estoque' : '/app/estoque?low=1'}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            params.low === '1'
              ? 'bg-orange-100 text-orange-700'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {params.low === '1' ? 'Mostrando alertas' : 'Apenas alertas'}
        </Link>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descricao</th>
              <th className="px-4 py-3">Localizacao</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-right">Min/Max</th>
              <th className="px-4 py-3 text-right">Preco venda</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{p.description}</div>
                  <div className="text-xs text-slate-500">
                    {p.brand} {p.category && `· ${p.category}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.location ?? '-'}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`font-bold ${
                      p.low ? 'text-orange-600' : 'text-slate-900'
                    }`}
                  >
                    {Number(p.qty).toFixed(0)}
                  </span>
                  {p.low && (
                    <AlertTriangle className="ml-2 inline h-4 w-4 text-orange-500" />
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500">
                  {p.min_qty ?? '-'} / {p.max_qty ?? '-'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatBRL(Number(p.sale_price ?? 0))}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.low && (
                    <Link
                      href="/app/compras/nova"
                      className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-200"
                    >
                      <ShoppingCart className="h-3 w-3" /> Comprar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  Nenhuma peca encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}