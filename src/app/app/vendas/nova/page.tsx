'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Plus, X, Loader2, Receipt } from 'lucide-react';
import { formatBRL } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

type Customer = { id: string; name: string };
type Item = { part_id: string | null; description: string; qty: number; unit_price: number; stockQty?: number };

const PAYMENT_METHODS = [
  { v: 'dinheiro', label: 'Dinheiro' },
  { v: 'pix', label: 'Pix' },
  { v: 'cartao', label: 'Cartão' },
  { v: 'fiado', label: 'Fiado' },
];

export default function NewCounterSalePage() {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [avulsa, setAvulsa] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const [items, setItems] = useState<Item[]>([{ part_id: null, description: '', qty: 1, unit_price: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [loading, setLoading] = useState(false);

  const [catalog, setCatalog] = useState<any[]>([]);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const term = `%${customerSearch}%`;
      const { data } = await supabase
        .from('customers')
        .select('id, name')
        .or(`name.ilike.${term},document.ilike.${term}`)
        .limit(8);
      setCustomerResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [customerSearch, supabase]);

  function addItem() {
    setItems([...items, { part_id: null, description: '', qty: 1, unit_price: 0 }]);
  }
  function updateItem(i: number, patch: Partial<Item>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  async function loadCatalog(term: string, idx: number) {
    setActiveItemIdx(idx);
    if (term.length < 2) {
      setCatalog([]);
      return;
    }
    const { data } = await supabase
      .from('parts')
      .select('id, sku, description, sale_price, stock_balances(qty)')
      .or(`description.ilike.%${term}%,sku.ilike.%${term}%`)
      .limit(6);
    setCatalog(data ?? []);
  }

  function pickFromCatalog(idx: number, part: any) {
    const stockQty = (part.stock_balances as any[])?.[0]?.qty ?? 0;
    updateItem(idx, {
      part_id: part.id,
      description: part.description,
      unit_price: Number(part.sale_price ?? 0),
      stockQty,
    });
    setCatalog([]);
    setActiveItemIdx(null);
  }

  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unit_price, 0);
  const total = Math.max(subtotal - discount, 0);

  async function save() {
    const empty = items.find(it => !it.description);
    if (empty) {
      toast.show({ type: 'warning', title: 'Preencha a descrição de todos os itens' });
      return;
    }
    if (!avulsa && !customer) {
      toast.show({ type: 'warning', title: 'Selecione um cliente ou marque como venda avulsa' });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('create_counter_sale', {
      p_customer_id: avulsa ? null : customer!.id,
      p_items: items.map(it => ({
        part_id: it.part_id,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
      })),
      p_discount: discount,
      p_payment_method: paymentMethod,
    });

    setLoading(false);

    if (error) {
      toast.show({ type: 'error', title: 'Erro ao registrar venda', description: error.message });
      return;
    }

    // avisa se alguma peca ficou com saldo negativo
    const partIds = items.map(it => it.part_id).filter(Boolean) as string[];
    if (partIds.length) {
      const { data: balances } = await supabase
        .from('stock_balances')
        .select('part_id, qty')
        .in('part_id', partIds);
      const negative = (balances ?? []).filter(b => Number(b.qty) < 0);
      if (negative.length > 0) {
        toast.show({
          type: 'warning',
          title: 'Atenção: estoque ficou negativo',
          description: `${negative.length} peça(s) com saldo abaixo de zero — ajuste na próxima compra.`,
        });
      }
    }

    toast.show({ type: 'success', title: 'Venda registrada!', description: formatBRL(total) });
    router.push(`/app/vendas/${data}`);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <Link href="/app/vendas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">Nova venda de balcão</h1>

      <div className="mt-4 space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        {/* Cliente */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-slate-700">Cliente</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={avulsa}
                onChange={e => {
                  setAvulsa(e.target.checked);
                  if (e.target.checked) setCustomer(null);
                }}
              />
              Venda avulsa (sem identificar cliente)
            </label>
          </div>

          {!avulsa && (
            customer ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-2.5 text-sm">
                <span className="font-semibold text-green-900">{customer.name}</span>
                <button onClick={() => setCustomer(null)} className="text-green-700 hover:text-green-900">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <input
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerPicker(true);
                  }}
                  onFocus={() => setShowCustomerPicker(true)}
                  placeholder="Buscar cliente por nome ou CPF/CNPJ..."
                  className="input-base"
                />
                {showCustomerPicker && customerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                    {customerResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomer(c);
                          setShowCustomerPicker(false);
                          setCustomerSearch('');
                        }}
                        className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Itens */}
        <div>
          <label className="block text-sm font-semibold text-slate-700">Peças</label>
          <div className="mt-2 space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      value={it.description}
                      onChange={e => {
                        updateItem(i, { description: e.target.value, part_id: null, stockQty: undefined });
                        loadCatalog(e.target.value, i);
                      }}
                      onFocus={() => setActiveItemIdx(i)}
                      placeholder="Buscar peça do estoque..."
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    {activeItemIdx === i && catalog.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                        {catalog.map(c => {
                          const qty = (c.stock_balances as any[])?.[0]?.qty ?? 0;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => pickFromCatalog(i, c)}
                              className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                            >
                              <div>
                                <div className="font-semibold">{c.description}</div>
                                <div className="text-xs text-slate-500">{c.sku} · {formatBRL(c.sale_price)}</div>
                              </div>
                              <span className={`text-xs font-semibold ${qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {qty} un.
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {it.part_id && it.stockQty !== undefined && (
                  <div className={`mt-1.5 text-xs ${it.stockQty >= it.qty ? 'text-slate-500' : 'text-orange-600 font-semibold'}`}>
                    Saldo em estoque: {it.stockQty} un.
                    {it.stockQty < it.qty && ' — vai ficar negativo'}
                  </div>
                )}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Qtd</label>
                    <input
                      type="number"
                      step="0.001"
                      value={it.qty}
                      onChange={e => updateItem(i, { qty: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Preço unit.</label>
                    <input
                      type="number"
                      step="0.01"
                      value={it.unit_price}
                      onChange={e => updateItem(i, { unit_price: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Subtotal</label>
                    <div className="rounded bg-white px-2 py-1 text-sm font-semibold">
                      {formatBRL(it.qty * it.unit_price)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addItem}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-600"
            >
              <Plus className="h-4 w-4" /> Adicionar peça
            </button>
          </div>
        </div>

        {/* Pagamento */}
        <div>
          <label className="block text-sm font-semibold text-slate-700">Forma de pagamento</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map(p => (
              <button
                key={p.v}
                type="button"
                onClick={() => setPaymentMethod(p.v)}
                className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition ${
                  paymentMethod === p.v
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">Desconto (R$)</label>
          <input
            type="number"
            step="0.01"
            value={discount}
            onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
            className="input-base mt-1"
          />
        </div>

        <div className="border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span>{formatBRL(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Desconto</span>
              <span>- {formatBRL(discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-2xl font-extrabold">
            <span>Total</span>
            <span className="text-sky-700">{formatBRL(total)}</span>
          </div>
        </div>

        <button onClick={save} disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Receipt className="h-5 w-5" />}
          {loading ? 'Registrando…' : 'Confirmar venda'}
        </button>
      </div>
    </div>
  );
}
