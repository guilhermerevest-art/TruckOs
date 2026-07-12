'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Plus, X, Loader2, UserPlus, Package } from 'lucide-react';
import { formatBRL } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

type Supplier = { id: string; name: string };
type Item = { part_id: string | null; description: string; qty: number; unit_cost: number };

export default function NewPurchasePage() {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const [expectedAt, setExpectedAt] = useState('');
  const [freight, setFreight] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([{ part_id: null, description: '', qty: 1, unit_cost: 0 }]);

  const [catalog, setCatalog] = useState<any[]>([]);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Busca fornecedor
  useEffect(() => {
    if (supplierSearch.length < 2) {
      setSupplierResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name')
        .ilike('name', `%${supplierSearch}%`)
        .limit(8);
      setSupplierResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [supplierSearch, supabase]);

  async function createSupplierInline() {
    if (!supplierSearch.trim()) return;
    setCreatingSupplier(true);
    const { data: tenant } = await supabase.from('tenants').select('id').single();
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ tenant_id: tenant?.id, name: supplierSearch.trim() })
      .select('id, name')
      .single();
    setCreatingSupplier(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao criar fornecedor', description: error.message });
      return;
    }
    setSupplier(data);
    setShowSupplierPicker(false);
    setSupplierSearch('');
    toast.show({ type: 'success', title: `Fornecedor "${data.name}" criado` });
  }

  function addItem() {
    setItems([...items, { part_id: null, description: '', qty: 1, unit_cost: 0 }]);
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
      .select('id, sku, description, avg_cost')
      .or(`description.ilike.%${term}%,sku.ilike.%${term}%`)
      .limit(6);
    setCatalog(data ?? []);
  }

  function pickFromCatalog(idx: number, part: any) {
    updateItem(idx, {
      part_id: part.id,
      description: part.description,
      unit_cost: Number(part.avg_cost ?? 0),
    });
    setCatalog([]);
    setActiveItemIdx(null);
  }

  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unit_cost, 0);
  const total = subtotal + (freight || 0);

  async function save() {
    if (!supplier) {
      toast.show({ type: 'warning', title: 'Selecione ou cadastre um fornecedor' });
      return;
    }
    const empty = items.find(it => !it.description);
    if (empty) {
      toast.show({ type: 'warning', title: 'Preencha a descrição de todos os itens' });
      return;
    }

    setLoading(true);
    const { data: tenant } = await supabase.from('tenants').select('id').single();

    const { data: purchase, error } = await supabase
      .from('purchases')
      .insert({
        tenant_id: tenant?.id,
        supplier_id: supplier.id,
        status: 'pedido',
        freight,
        total,
        expected_at: expectedAt || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      toast.show({ type: 'error', title: 'Erro ao criar compra', description: error.message });
      setLoading(false);
      return;
    }

    const { error: itemsErr } = await supabase.from('purchase_items').insert(
      items.map(it => ({
        tenant_id: tenant?.id,
        purchase_id: purchase.id,
        part_id: it.part_id,
        description: it.description,
        qty: it.qty,
        unit_cost: it.unit_cost,
      })),
    );

    if (itemsErr) {
      toast.show({ type: 'error', title: 'Erro ao salvar itens', description: itemsErr.message });
      setLoading(false);
      return;
    }

    toast.show({ type: 'success', title: 'Compra criada!', description: 'Agora é só receber quando chegar.' });
    router.push(`/app/compras/${purchase.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <Link href="/app/compras" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">Nova compra</h1>

      <div className="mt-4 space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        {/* Fornecedor */}
        <div>
          <label className="block text-sm font-semibold text-slate-700">
            Fornecedor <span className="text-red-500">*</span>
          </label>
          {supplier ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-2.5 text-sm">
              <span className="font-semibold text-green-900">{supplier.name}</span>
              <button onClick={() => setSupplier(null)} className="text-green-700 hover:text-green-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative mt-1">
              <input
                value={supplierSearch}
                onChange={e => {
                  setSupplierSearch(e.target.value);
                  setShowSupplierPicker(true);
                }}
                onFocus={() => setShowSupplierPicker(true)}
                placeholder="Buscar fornecedor..."
                className="input-base"
              />
              {showSupplierPicker && supplierResults.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                  {supplierResults.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplier(s);
                        setShowSupplierPicker(false);
                        setSupplierSearch('');
                      }}
                      className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {supplierSearch.trim().length >= 2 && (
                <button
                  type="button"
                  onClick={createSupplierInline}
                  disabled={creatingSupplier}
                  className="btn-secondary mt-2 w-full text-sm"
                >
                  {creatingSupplier ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Cadastrar novo fornecedor: "{supplierSearch}"
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Previsão de chegada</label>
            <input
              type="date"
              value={expectedAt}
              onChange={e => setExpectedAt(e.target.value)}
              className="input-base mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">Frete (R$)</label>
            <input
              type="number"
              step="0.01"
              value={freight}
              onChange={e => setFreight(parseFloat(e.target.value) || 0)}
              className="input-base mt-1"
            />
          </div>
        </div>

        {/* Itens */}
        <div>
          <label className="block text-sm font-semibold text-slate-700">Itens da compra</label>
          <div className="mt-2 space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      value={it.description}
                      onChange={e => {
                        updateItem(i, { description: e.target.value, part_id: null });
                        loadCatalog(e.target.value, i);
                      }}
                      onFocus={() => setActiveItemIdx(i)}
                      placeholder="Buscar peça do catálogo ou digitar nova..."
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    {activeItemIdx === i && catalog.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                        {catalog.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => pickFromCatalog(i, c)}
                            className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                          >
                            <div className="font-semibold">{c.description}</div>
                            <div className="text-xs text-slate-500">{c.sku}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {it.part_id && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-sky-700">
                    <Package className="h-3 w-3" /> Vinculado ao catálogo — atualiza o saldo ao receber
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
                    <label className="text-xs text-slate-500">Custo unit.</label>
                    <input
                      type="number"
                      step="0.01"
                      value={it.unit_cost}
                      onChange={e => updateItem(i, { unit_cost: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Subtotal</label>
                    <div className="rounded bg-white px-2 py-1 text-sm font-semibold">
                      {formatBRL(it.qty * it.unit_cost)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addItem}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-600"
            >
              <Plus className="h-4 w-4" /> Adicionar item
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">Observações</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="input-base mt-1"
          />
        </div>

        <div className="border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Itens</span>
            <span>{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Frete</span>
            <span>{formatBRL(freight)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-2xl font-extrabold">
            <span>Total</span>
            <span className="text-sky-700">{formatBRL(total)}</span>
          </div>
        </div>

        <button onClick={save} disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
          {loading ? 'Salvando…' : 'Criar pedido de compra'}
        </button>
      </div>
    </div>
  );
}
