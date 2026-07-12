'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Item = {
  id: string;
  item_label: string;
  category: string;
  status: 'verde' | 'amarelo' | 'vermelho';
  note: string | null;
  photo_url: string | null;
  approved: boolean;
};

const STATUS_DOT: Record<Item['status'], string> = {
  verde: 'bg-green-500',
  amarelo: 'bg-amber-500',
  vermelho: 'bg-red-600',
};

export function InspecaoPublica({ token, items }: { token: string; items: Item[] }) {
  const supabase = createClient();
  const [approved, setApproved] = useState<Set<string>>(new Set(items.filter(i => i.approved).map(i => i.id)));
  const [saving, setSaving] = useState(false);

  const needsAttention = items.filter(i => i.status !== 'verde');

  function toggle(id: string) {
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function salvarAprovacao() {
    setSaving(true);
    await supabase.rpc('public_wo_inspection_approve', {
      p_token: token,
      p_item_ids: Array.from(approved),
    });
    setSaving(false);
  }

  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Raio-X do veículo</h2>
      <p className="mb-4 text-sm text-slate-500">Inspeção completa feita pela nossa equipe</p>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${STATUS_DOT[item.status]}`} />
              <div>
                <div className="text-sm font-medium text-slate-900">{item.item_label}</div>
                {item.note && <div className="text-xs text-slate-500">{item.note}</div>}
              </div>
            </div>
            {item.status !== 'verde' && (
              <button
                onClick={() => toggle(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  approved.has(item.id) ? 'bg-green-600 text-white' : 'border border-slate-300 text-slate-600'
                }`}
              >
                {approved.has(item.id) ? 'Aprovado' : 'Aprovar'}
              </button>
            )}
          </div>
        ))}
      </div>

      {needsAttention.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {needsAttention.length} item(ns) precisam de atenção — aprove para que a oficina agende o reparo.
        </div>
      )}

      <button
        onClick={salvarAprovacao}
        disabled={saving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        <CheckCircle2 className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar aprovações'}
      </button>
    </section>
  );
}
