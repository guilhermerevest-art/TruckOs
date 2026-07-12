'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PackageCheck, Loader2 } from 'lucide-react';
import { formatBRL } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

type Item = {
  id: string;
  description: string;
  qty: number;
  unit_cost: number;
  received_qty: number;
  part_id: string | null;
};

export function ReceiveItems({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [drafts, setDrafts] = useState<Record<string, { qty: number; cost: number }>>(
    Object.fromEntries(
      items.map(it => [
        it.id,
        { qty: Math.max(Number(it.qty) - Number(it.received_qty ?? 0), 0), cost: Number(it.unit_cost) },
      ]),
    ),
  );
  const [loading, setLoading] = useState<string | null>(null);

  function setDraft(id: string, patch: Partial<{ qty: number; cost: number }>) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function receive(item: Item) {
    const draft = drafts[item.id];
    if (!draft || draft.qty <= 0) {
      toast.show({ type: 'warning', title: 'Informe uma quantidade maior que zero' });
      return;
    }
    setLoading(item.id);
    const { error } = await supabase.rpc('receive_purchase_item', {
      p_item_id: item.id,
      p_qty: draft.qty,
      p_unit_cost: draft.cost,
    });
    setLoading(null);

    if (error) {
      toast.show({ type: 'error', title: 'Erro ao receber', description: error.message });
      return;
    }

    toast.show({
      type: 'success',
      title: `${item.description}: +${draft.qty} recebido${draft.qty === 1 ? '' : 's'}`,
      description: item.part_id ? 'Estoque e custo médio atualizados.' : undefined,
    });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {items.map(it => {
        const pending = Math.max(Number(it.qty) - Number(it.received_qty ?? 0), 0);
        const done = pending <= 0;
        const draft = drafts[it.id] ?? { qty: 0, cost: Number(it.unit_cost) };
        return (
          <div
            key={it.id}
            className={`rounded-lg border p-3 ${done ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{it.description}</div>
                <div className="text-xs text-slate-500">
                  Pedido: {Number(it.qty)} · Recebido: {Number(it.received_qty ?? 0)}
                  {!it.part_id && ' · não vinculado ao catálogo (não mexe no saldo)'}
                </div>
              </div>
              {done && (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                  <PackageCheck className="h-4 w-4" /> Completo
                </span>
              )}
            </div>

            {!done && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Receber agora</label>
                  <input
                    type="number"
                    step="0.001"
                    value={draft.qty}
                    onChange={e => setDraft(it.id, { qty: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Custo unit.</label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.cost}
                    onChange={e => setDraft(it.id, { cost: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => receive(it)}
                    disabled={loading === it.id}
                    className="btn-primary w-full py-1.5 text-xs"
                  >
                    {loading === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageCheck className="h-3 w-3" />}
                    Receber
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
