import { createClient } from '@/lib/supabase/server';
import { BarChart3, TrendingUp, Star, Users, ClipboardCheck, Wrench } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

export default async function RelatoriosPage() {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // KPIs do mes
  const [
    { count: osFechadas },
    { data: faturamento },
    { data: topClientes },
    { data: nps },
    { count: totalClientes },
    { data: osPorStatus },
  ] = await Promise.all([
    supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .gte('delivered_at', startOfMonth.toISOString()),
    supabase
      .from('invoices')
      .select('amount')
      .eq('status', 'paga')
      .gte('paid_at', startOfMonth.toISOString()),
    supabase
      .from('work_orders')
      .select('customer:customers(id, name), totals')
      .gte('created_at', startOfMonth.toISOString())
      .limit(100),
    supabase
      .from('nps_responses')
      .select('score')
      .gte('responded_at', startOfMonth.toISOString()),
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('work_orders')
      .select('status')
      .gte('created_at', startOfMonth.toISOString()),
  ]);

  const fatTotal = (faturamento ?? []).reduce((acc, i) => acc + Number(i.amount), 0);
  const npsAvg =
    (nps ?? []).length > 0
      ? (nps ?? []).reduce((acc, n) => acc + Number(n.score), 0) / (nps ?? []).length
      : 0;

  // Ranking de clientes por faturamento (soma totals.total)
  const clienteTotals: Record<string, { nome: string; total: number }> = {};
  (topClientes ?? []).forEach(wo => {
    const c = wo.customer as any;
    if (!c) return;
    if (!clienteTotals[c.id]) clienteTotals[c.id] = { nome: c.name, total: 0 };
    clienteTotals[c.id].total += (wo.totals as any)?.total ?? 0;
  });
  const ranking = Object.values(clienteTotals)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // OS por fase
  const fases: Record<string, number> = {};
  (osPorStatus ?? []).forEach(o => {
    fases[o.status] = (fases[o.status] ?? 0) + 1;
  });

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Relatorios</h1>
        <p className="text-sm text-slate-500">Visao geral do mes</p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          icon={TrendingUp}
          label="Faturamento do mes"
          value={formatBRL(fatTotal)}
          color="text-green-600"
        />
        <KPI
          icon={ClipboardCheck}
          label="OS finalizadas"
          value={String(osFechadas ?? 0)}
          color="text-blue-600"
        />
        <KPI
          icon={Users}
          label="Total de clientes"
          value={String(totalClientes ?? 0)}
          color="text-purple-600"
        />
        <KPI
          icon={Star}
          label="NPS medio"
          value={npsAvg > 0 ? npsAvg.toFixed(1) : '-'}
          color="text-yellow-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* OS por fase */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Wrench className="h-5 w-5" /> OS por fase (mes)
          </h2>
          <div className="space-y-2">
            {Object.entries(fases)
              .sort((a, b) => b[1] - a[1])
              .map(([status, qty]) => {
                const max = Math.max(...Object.values(fases));
                const pct = max > 0 ? (qty / max) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-slate-700">{status}</span>
                      <span className="font-bold">{qty}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {!Object.keys(fases).length && (
              <div className="text-sm text-slate-500">Nenhuma OS no mes</div>
            )}
          </div>
        </div>

        {/* Top clientes */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <BarChart3 className="h-5 w-5" /> Top clientes do mes
          </h2>
          <div className="space-y-2">
            {ranking.map((c, i) => (
              <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                    {i + 1}
                  </div>
                  <div className="font-medium text-slate-900">{c.nome}</div>
                </div>
                <div className="font-bold text-slate-900">{formatBRL(c.total)}</div>
              </div>
            ))}
            {!ranking.length && (
              <div className="text-sm text-slate-500">Sem dados no mes</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}