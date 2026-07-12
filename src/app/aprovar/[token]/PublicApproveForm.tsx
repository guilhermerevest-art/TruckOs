'use client';

import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

type Item = {
  id: string;
  description: string;
  qty: number;
  unit_price: number;
  option_group: string;
  status: 'pending' | 'approved' | 'rejected';
};

export function PublicApproveForm({
  token,
  total,
  items,
  disabled,
  expired,
}: {
  token: string;
  total: number;
  items: Item[];
  disabled: boolean;
  expired: boolean | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(items.filter(i => i.status === 'approved').map(i => i.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  function toggle(id: string) {
    if (disabled || expired) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    if (disabled || expired) return;
    setSelected(new Set(items.map(i => i.id)));
  }
  function deselectAll() {
    if (disabled || expired) return;
    setSelected(new Set());
  }

  const subtotalSelecionado = items
    .filter(i => selected.has(i.id))
    .reduce((acc, i) => acc + i.qty * i.unit_price, 0);

  async function submit() {
    if (disabled || expired) return;
    setSubmitting(true);
    setError('');

    const res = await fetch(`/api/public/quote/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        item_ids: Array.from(selected),
        meta: {
          ip: 'cliente',
          user_agent: navigator.userAgent,
          channel: 'web',
        },
      }),
    });

    if (!res.ok) {
      const j = await res.json();
      setError(j.error || 'Erro ao enviar');
      setSubmitting(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="p-8 text-center">
        <Check className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="mt-3 text-xl font-bold text-slate-900">Resposta enviada!</h2>
        <p className="mt-2 text-slate-600">
          A oficina recebera sua decisao e iniciara o servico em breve.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-bold text-slate-900">Itens ({items.length})</h3>
        {!disabled && !expired && (
          <div className="flex gap-2 text-xs">
            <button
              onClick={selectAll}
              className="font-semibold text-sky-600 hover:underline"
            >
              Marcar todos
            </button>
            <span className="text-slate-300">·</span>
            <button
              onClick={deselectAll}
              className="font-semibold text-slate-600 hover:underline"
            >
              Desmarcar
            </button>
          </div>
        )}
      </div>

      <div className="divide-y">
        {items.map(it => {
          const isSelected = selected.has(it.id);
          const wasApproved = it.status === 'approved';
          const wasRejected = it.status === 'rejected';
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => toggle(it.id)}
              disabled={Boolean(disabled || expired)}
              className={`flex w-full items-start gap-3 p-4 text-left transition ${
                disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-50'
              }`}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
                  isSelected
                    ? 'border-sky-600 bg-sky-600'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900">{it.description}</div>
                <div className="text-xs text-slate-500">
                  {it.qty}x · {formatBRL(it.unit_price)}
                  {it.option_group && it.option_group !== 'completo' && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5">
                      {it.option_group}
                    </span>
                  )}
                </div>
                {wasRejected && (
                  <div className="mt-1 text-xs text-red-600">Recusado anteriormente</div>
                )}
              </div>
              <div className="text-right font-bold text-slate-900">
                {formatBRL(it.qty * it.unit_price)}
              </div>
            </button>
          );
        })}
      </div>

      {!disabled && !expired && (
        <div className="border-t bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-600">Total dos itens selecionados</span>
            <span className="text-2xl font-bold text-slate-900">{formatBRL(subtotalSelecionado)}</span>
          </div>
          {error && (
            <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>
          )}
          <button
            onClick={submit}
            disabled={submitting || selected.size === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {submitting
              ? 'Enviando...'
              : selected.size === items.length
              ? 'Aprovar todos os itens'
              : `Aprovar ${selected.size} item${selected.size === 1 ? '' : 'ns'}`}
          </button>
        </div>
      )}
    </div>
  );
}