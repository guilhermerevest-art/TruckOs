'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, Loader2, ArrowLeft, Zap, Package } from 'lucide-react';
import { formatBRL } from '@/lib/utils';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

type Item = {
  description: string;
  kind: 'part' | 'labor' | 'third_party';
  qty: number;
  unit_price: number;
  part_id?: string | null;
};

// Templates de serviços mais comuns — para o orçamento montar em segundos
const QUOTE_TEMPLATES = [
  { kind: 'labor' as const, description: 'Mão de obra — diagnóstico', qty: 1, unit_price: 120 },
  { kind: 'labor' as const, description: 'Mão de obra — revisão geral (8h)', qty: 8, unit_price: 120 },
  { kind: 'labor' as const, description: 'Mão de obra — troca de embreagem', qty: 5, unit_price: 120 },
  { kind: 'labor' as const, description: 'Mão de obra — troca de pastilhas', qty: 2, unit_price: 120 },
  { kind: 'third_party' as const, description: 'Serviço de retífica', qty: 1, unit_price: 450 },
  { kind: 'third_party' as const, description: 'Lavagem completa', qty: 1, unit_price: 80 },
];

export default function NewQuotePage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get('wo_id');

  const [items, setItems] = useState<Item[]>([
    { description: '', kind: 'part', qty: 1, unit_price: 0 },
  ]);
  const [discount, setDiscount] = useState(0);
  const [validDays, setValidDays] = useState(7);
  const [loading, setLoading] = useState(false);

  // Catálogo de peças para autocomplete
  const [catalog, setCatalog] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  function addItem() {
    const next = [...items, { description: '', kind: 'part' as const, qty: 1, unit_price: 0 }];
    setItems(next);
    setActiveItemIdx(next.length - 1);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, patch: Partial<Item>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function loadCatalog(term: string, idx: number) {
    setSearchTerm(term);
    setActiveItemIdx(idx);
    if (term.length < 2) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('parts')
      .select('id, sku, description, sale_price, stock_balances(qty)')
      .eq('active', true)
      .or(`description.ilike.%${term}%,sku.ilike.%${term}%`)
      .limit(6);
    setCatalog(data ?? []);
  }

  function pickFromCatalog(idx: number, part: any) {
    updateItem(idx, {
      description: part.description,
      kind: 'part',
      unit_price: Number(part.sale_price ?? 0),
      part_id: part.id,
    });
    setCatalog([]);
    setSearchTerm('');
    setActiveItemIdx(null);
  }

  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
  const total = Math.max(0, subtotal - discount);

  async function save() {
    if (!workOrderId) {
      toast.show({ type: 'error', title: 'Abra esta tela a partir de uma OS' });
      return;
    }
    const empty = items.find(it => !it.description);
    if (empty) {
      toast.show({
        type: 'warning',
        title: 'Preencha a descrição de todos os itens',
        description: 'Você tem um item em branco.',
      });
      return;
    }
    const noPrice = items.find(it => it.unit_price <= 0);
    if (noPrice) {
      toast.show({
        type: 'warning',
        title: 'Defina o preço de todos os itens',
        description: 'Itens com valor R$ 0,00 serão cobrados assim.',
      });
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data: tenant } = await supabase.from('tenants').select('id').single();
    if (!tenant) {
      toast.show({ type: 'error', title: 'Não achei a oficina do seu usuário' });
      setLoading(false);
      return;
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        tenant_id: tenant.id,
        work_order_id: workOrderId,
        subtotal,
        discount,
        total,
        valid_until: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
      })
      .select()
      .single();

    if (error) {
      toast.show({ type: 'error', title: 'Erro ao salvar', description: error.message });
      setLoading(false);
      return;
    }

    const { error: itemsErr } = await supabase.from('quote_items').insert(
      items.map(it => ({
        tenant_id: tenant.id,
        quote_id: quote.id,
        kind: it.kind,
        ref_id: it.part_id ?? null,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
      })),
    );

    if (itemsErr) {
      toast.show({ type: 'error', title: 'Erro ao salvar itens', description: itemsErr.message });
      setLoading(false);
      return;
    }

    toast.show({
      type: 'success',
      title: 'Orçamento criado!',
      description: `Total ${formatBRL(total)} — abrindo para enviar ao cliente.`,
    });
    router.push(`/app/orcamentos/${quote.id}`);
  }

  if (!workOrderId) {
    return (
      <div className="p-6">
        <Link href="/app/os" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="empty-state">
          <h1 className="text-xl font-bold text-slate-900">Crie uma OS primeiro</h1>
          <p className="mt-2 text-slate-600">O orçamento é feito a partir de uma OS existente.</p>
          <Link href="/app/os/nova" className="btn-primary mt-4">
            <Plus className="h-4 w-4" /> Nova OS
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <Link
        href={`/app/os/${workOrderId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar pra OS
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Novo orçamento</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Rascunho
        </span>
      </div>

      {/* Templates 1-clique */}
      {items.length === 1 && !items[0].description && (
        <div className="card-base mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Zap className="h-4 w-4 text-amber-500" />
            Atalhos rápidos
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUOTE_TEMPLATES.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setItems([...items, { ...t, qty: t.qty, unit_price: t.unit_price }])}
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
              >
                + {t.description}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="card-base p-4">
            <div className="flex items-start gap-2">
              <select
                value={item.kind}
                onChange={e => updateItem(i, { kind: e.target.value as any })}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="part">Peça</option>
                <option value="labor">Mão de obra</option>
                <option value="third_party">Terceiro</option>
              </select>
              <div className="relative flex-1">
                <input
                  value={item.description}
                  onChange={e => {
                    updateItem(i, { description: e.target.value });
                    if (item.kind === 'part') loadCatalog(e.target.value, i);
                  }}
                  onFocus={() => setActiveItemIdx(i)}
                  placeholder="Descrição…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                {item.kind === 'part' && activeItemIdx === i && catalog.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                    {catalog.map(c => {
                      const stockQty = (c.stock_balances as any[])?.[0]?.qty ?? 0;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickFromCatalog(i, c)}
                          className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                        >
                          <div>
                            <div className="font-semibold">{c.description}</div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{c.sku}</span>
                              <span>{formatBRL(c.sale_price)}</span>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold ${stockQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {stockQty} un.
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => removeItem(i)}
                disabled={items.length === 1}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500">Qtd</label>
                <input
                  type="number"
                  step="0.001"
                  value={item.qty}
                  onChange={e => updateItem(i, { qty: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Preço unit.</label>
                <input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={e =>
                    updateItem(i, { unit_price: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Subtotal</label>
                <div className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-semibold">
                  {formatBRL(item.qty * item.unit_price)}
                </div>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addItem}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-600"
        >
          <Plus className="h-4 w-4" /> Adicionar item
        </button>
      </div>

      <div className="card-base mt-6 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Desconto (R$)</label>
            <input
              type="number"
              step="0.01"
              value={discount}
              onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
              className="input-base mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Válido por (dias)</label>
            <input
              type="number"
              value={validDays}
              onChange={e => setValidDays(parseInt(e.target.value) || 7)}
              className="input-base mt-1"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1 border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span>{formatBRL(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Desconto</span>
              <span>- {formatBRL(discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-2xl font-extrabold">
            <span>Total</span>
            <span className="text-sky-700">{formatBRL(total)}</span>
          </div>
        </div>

        <button
          onClick={save}
          disabled={loading}
          className="btn-primary mt-4 w-full py-3 text-base"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          {loading ? 'Salvando…' : 'Criar orçamento'}
        </button>
      </div>
    </div>
  );
}
