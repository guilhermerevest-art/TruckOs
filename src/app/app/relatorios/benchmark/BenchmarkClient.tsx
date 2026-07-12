'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, RefreshCw, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type Bucket = {
  tenant_count: number;
  ticket_medio_p25: number;
  ticket_medio_p50: number;
  ticket_medio_p75: number;
  conversao_p25: number;
  conversao_p50: number;
  conversao_p75: number;
  prazo_dias_p25: number;
  prazo_dias_p50: number;
  prazo_dias_p75: number;
};

type BenchmarkData = {
  opted_in: boolean;
  own: { ticket_medio: number; conversao: number; prazo_dias: number | null };
  bucket: Bucket | null;
  porte: string;
  regiao: string;
};

export function BenchmarkClient({
  tenantId,
  plan,
  optIn,
  initialData,
}: {
  tenantId: string;
  plan: string;
  optIn: boolean;
  initialData: BenchmarkData | null;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(optIn);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  async function toggleOptIn(value: boolean) {
    setEnabled(value);
    const { error } = await supabase.from('tenants').update({ benchmark_opt_in: value }).eq('id', tenantId);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao salvar', description: error.message });
      setEnabled(!value);
      return;
    }
    toast.show({ type: 'success', title: value ? 'Participando do benchmark' : 'Saiu do benchmark' });
    atualizar();
  }

  async function atualizar() {
    setLoading(true);
    try {
      await supabase.rpc('compute_benchmark_aggregates');
      const { data: d, error } = await supabase.rpc('tenant_benchmark', { p_tenant_id: tenantId });
      if (error) throw error;
      setData(d);
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao atualizar', description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  if (plan !== 'fleet') {
    return (
      <div className="p-6 lg:p-8">
        <Link href="/app/relatorios" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="empty-state flex flex-col items-center gap-2">
          <Lock className="h-8 w-8 text-slate-400" />
          <div className="font-bold text-slate-900">Exclusivo do plano Fleet</div>
          <p className="text-sm text-slate-500">Compare seus indicadores com oficinas do seu porte e região.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <Link href="/app/relatorios" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BarChart3 className="h-6 w-6 text-sky-600" /> Benchmark Anônimo
          </h1>
          <p className="text-sm text-slate-500">Como sua oficina está frente às do mesmo porte e região</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={enabled} onChange={e => toggleOptIn(e.target.checked)} />
            Participar (opt-in)
          </label>
          <button onClick={atualizar} disabled={loading} className="btn-secondary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {!enabled && (
        <div className="empty-state">
          Ative o opt-in acima pra comparar seus números com o mercado. Seus dados nunca são
          identificados — só entram numa média anônima por porte/região (mínimo 5 oficinas por
          recorte).
        </div>
      )}

      {enabled && data && !data.bucket && (
        <div className="empty-state">
          Ainda não há oficinas suficientes no seu recorte (porte "{data.porte}", região "{data.regiao}")
          para exibir com anonimato garantido — precisa de pelo menos 5. Volte quando a base crescer.
        </div>
      )}

      {enabled && data?.bucket && (
        <div className="grid gap-4 md:grid-cols-3">
          <BenchmarkCard
            label="Ticket médio"
            own={data.own.ticket_medio}
            p25={data.bucket.ticket_medio_p25}
            p50={data.bucket.ticket_medio_p50}
            p75={data.bucket.ticket_medio_p75}
            format={formatBRL}
          />
          <BenchmarkCard
            label="Conversão de orçamento"
            own={data.own.conversao}
            p25={data.bucket.conversao_p25}
            p50={data.bucket.conversao_p50}
            p75={data.bucket.conversao_p75}
            format={v => `${v.toFixed(1)}%`}
          />
          <BenchmarkCard
            label="Prazo médio de entrega"
            own={data.own.prazo_dias ?? 0}
            p25={data.bucket.prazo_dias_p25}
            p50={data.bucket.prazo_dias_p50}
            p75={data.bucket.prazo_dias_p75}
            format={v => `${v.toFixed(1)} dias`}
            lowerIsBetter
          />
          <div className="text-xs text-slate-400 md:col-span-3">
            Baseado em {data.bucket.tenant_count} oficinas do porte "{data.porte}" / região "{data.regiao}", últimos 90 dias.
          </div>
        </div>
      )}
    </div>
  );
}

function BenchmarkCard({
  label,
  own,
  p25,
  p50,
  p75,
  format,
  lowerIsBetter,
}: {
  label: string;
  own: number;
  p25: number;
  p50: number;
  p75: number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const range = Math.max(p75 - p25, 0.0001);
  const pct = Math.max(0, Math.min(100, ((own - p25) / range) * 100));
  const quartile = own >= p75 ? (lowerIsBetter ? 'inferior' : 'superior') : own <= p25 ? (lowerIsBetter ? 'superior' : 'inferior') : 'médio';

  return (
    <div className="card-base p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{format(own)}</div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>p25 {format(p25)}</span>
        <span>mediana {format(p50)}</span>
        <span>p75 {format(p75)}</span>
      </div>
      <div className="mt-2 text-xs font-semibold text-slate-600">Você está no quartil {quartile} do mercado</div>
    </div>
  );
}
