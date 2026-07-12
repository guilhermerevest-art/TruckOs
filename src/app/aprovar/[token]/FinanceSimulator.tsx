'use client';

import { useState } from 'react';
import { CreditCard, CheckCircle2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatBRL } from '@/lib/utils';

const OPTIONS = [1, 3, 6, 12];
// Taxa ilustrativa so pra simulacao — nao ha parceiro de credito real
// integrado ainda (ver comentario na migration truckos_financia).
const MONTHLY_RATE = 0.0299;

export function FinanceSimulator({ token, total, customerName }: { token: string; total: number; customerName: string }) {
  const supabase = createClient();
  const [installments, setInstallments] = useState(6);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  function valorParcela(n: number) {
    if (n <= 1) return total;
    const fator = (MONTHLY_RATE * Math.pow(1 + MONTHLY_RATE, n)) / (Math.pow(1 + MONTHLY_RATE, n) - 1);
    return total * fator;
  }

  async function solicitar() {
    setSending(true);
    await supabase.rpc('public_request_financing', {
      p_token: token,
      p_installments: installments,
      p_customer_name: customerName,
    });
    setSending(false);
    setDone(true);
  }

  if (total <= 0) return null;

  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <CreditCard className="h-5 w-5 text-sky-600" /> Parcelar este reparo
      </h2>
      <p className="mt-1 text-sm text-slate-500">Simulação — sujeita a análise de crédito de um parceiro financeiro.</p>

      {done ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-5 w-5" /> Pedido registrado! A oficina vai te procurar com os próximos passos.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setInstallments(n)}
                className={`rounded-lg border-2 p-2 text-center text-xs font-semibold ${
                  installments === n ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                {n}x
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-center">
            <div className="text-2xl font-bold text-slate-900">
              {installments}x {formatBRL(valorParcela(installments))}
            </div>
            {installments > 1 && <div className="text-xs text-slate-500">Total parcelado: {formatBRL(valorParcela(installments) * installments)}</div>}
          </div>
          <button
            onClick={solicitar}
            disabled={sending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Solicitar parcelamento'}
          </button>
        </>
      )}
    </section>
  );
}
