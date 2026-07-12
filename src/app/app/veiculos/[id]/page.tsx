import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Truck, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

const SEVERITY_LABEL: Record<string, { label: string; color: string }> = {
  alta: { label: 'Alta', color: 'bg-red-100 text-red-700' },
  media: { label: 'Media', color: 'bg-amber-100 text-amber-700' },
  baixa: { label: 'Baixa', color: 'bg-slate-100 text-slate-700' },
};

const TIPO_LABEL: Record<string, string> = {
  pm_vencida: 'Preventiva vencida',
  pm_proxima: 'Preventiva proxima do vencimento',
  reincidencia: 'Reincidencia de defeito',
  sem_manutencao: 'Muito tempo sem manutencao',
};

function gaugeColor(score: number) {
  if (score >= 70) return { ring: '#16a34a', text: 'text-green-600', badge: 'bg-green-100 text-green-700' };
  if (score >= 40) return { ring: '#d97706', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' };
  return { ring: '#dc2626', text: 'text-red-600', badge: 'bg-red-100 text-red-700' };
}

export default async function VeiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*, customer:customers(id, name)')
    .eq('id', id)
    .single();
  if (!vehicle) notFound();

  const { data: healthNow } = await supabase.rpc('refresh_vehicle_health', { p_vehicle_id: id });

  const since = new Date();
  since.setDate(since.getDate() - 100);
  const { data: oldSnapshot } = await supabase
    .from('vehicle_health_snapshots')
    .select('score, computed_at')
    .eq('vehicle_id', id)
    .lte('computed_at', since.toISOString())
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentWO } = await supabase
    .from('work_orders')
    .select('id, number, status, created_at, totals')
    .eq('vehicle_id', id)
    .order('created_at', { ascending: false })
    .limit(8);

  const score: number = healthNow?.score ?? 0;
  const breakdown: any[] = healthNow?.breakdown ?? [];
  const colors = gaugeColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  const trendDiff = oldSnapshot ? score - oldSnapshot.score : null;

  return (
    <div className="p-6 lg:p-8">
      <Link
        href={vehicle.customer ? `/app/clientes/${(vehicle.customer as any).id}` : '/app/clientes'}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao cliente
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <Truck className="h-8 w-8 text-slate-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{vehicle.plate}</h1>
          <p className="text-sm text-slate-500">
            {vehicle.brand} {vehicle.model} {vehicle.year} · {(vehicle.customer as any)?.name}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-base flex flex-col items-center p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Score de saude
          </div>
          <div className="relative mt-3 h-40 w-40">
            <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="12" />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={colors.ring}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`text-4xl font-extrabold ${colors.text}`}>{score}</div>
              <div className="text-xs text-slate-400">/ 100</div>
            </div>
          </div>
          {trendDiff !== null && (
            <div className="mt-3 flex items-center gap-1 text-sm font-semibold">
              {trendDiff > 0 && <TrendingUp className="h-4 w-4 text-green-600" />}
              {trendDiff < 0 && <TrendingDown className="h-4 w-4 text-red-600" />}
              {trendDiff === 0 && <Minus className="h-4 w-4 text-slate-400" />}
              <span className={trendDiff > 0 ? 'text-green-600' : trendDiff < 0 ? 'text-red-600' : 'text-slate-500'}>
                {trendDiff > 0 ? `+${trendDiff}` : trendDiff} vs. ~3 meses atras
              </span>
            </div>
          )}
          {trendDiff === null && (
            <p className="mt-3 text-center text-xs text-slate-400">
              Tendencia disponivel apos acumular historico.
            </p>
          )}
        </div>

        <div className="card-base p-5 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> O que derruba sua nota
          </h2>
          {breakdown.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed p-6 text-center text-sm text-slate-500">
              Nada pesando contra este veiculo agora. 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {breakdown.map((b, i) => {
                const sev = SEVERITY_LABEL[b.severidade] ?? SEVERITY_LABEL.baixa;
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg border bg-slate-50 p-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {TIPO_LABEL[b.tipo] ?? b.tipo}
                      </div>
                      <div className="text-xs text-slate-500">{b.item}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sev.color}`}>
                        {sev.label}
                      </span>
                      <span className="text-xs font-bold text-red-600">{b.impacto}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {breakdown.length > 0 && (
            <Link href={`/app/os/nova?vehicle_id=${vehicle.id}`} className="btn-primary mt-4 w-full">
              Orcar agora
            </Link>
          )}
        </div>
      </div>

      <div className="card-base mt-6 p-5">
        <h2 className="mb-3 font-bold text-slate-900">Historico de OS</h2>
        <div className="divide-y">
          {recentWO?.map(wo => (
            <Link
              key={wo.id}
              href={`/app/os/${wo.id}`}
              className="flex items-center justify-between py-2.5 hover:bg-slate-50"
            >
              <div>
                <div className="font-bold text-slate-900">OS #{wo.number}</div>
                <div className="text-xs text-slate-500">{new Date(wo.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{formatBRL((wo.totals as any)?.total)}</div>
                <div className="text-xs text-slate-500">{wo.status}</div>
              </div>
            </Link>
          ))}
          {!recentWO?.length && <div className="py-6 text-center text-sm text-slate-500">Sem OS ainda</div>}
        </div>
      </div>
    </div>
  );
}
