import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

type Section = { category: string; std_hours: number | null; labor_rate: number | null };
type Part = { qty: number; unit_cost: number | null; unit_price: number };
type LaborLog = { mechanic_id: string; minutes: number | null };
type ThirdParty = { cost: number | null; price: number | null };

type WoRow = {
  id: string;
  number: number;
  delivered_at: string;
  customer: { name: string } | null;
  vehicle: { plate: string } | null;
  sections: Section[];
  parts: Part[];
  labor_logs: LaborLog[];
  third_party: ThirdParty[];
};

export default async function MargemPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { dias } = await searchParams;
  const days = Number(dias) || 90;
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [{ data: wos }, { data: members }] = await Promise.all([
    supabase
      .from('work_orders')
      .select(
        `id, number, delivered_at,
         customer:customers(name),
         vehicle:vehicles(plate),
         sections:wo_sections(category, std_hours, labor_rate),
         parts:wo_parts(qty, unit_cost, unit_price),
         labor_logs:wo_labor_logs(mechanic_id, minutes),
         third_party:wo_third_party_services(cost, price)`,
      )
      .eq('status', 'entregue')
      .gte('delivered_at', since.toISOString())
      .order('delivered_at', { ascending: false })
      .limit(300),
    supabase.from('tenant_members').select('user_id, hourly_cost'),
  ]);

  const hourlyCostByUser = new Map<string, number>(
    (members ?? []).map(m => [m.user_id, Number(m.hourly_cost ?? 0)]),
  );

  type Computed = {
    id: string;
    number: number;
    label: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPct: number;
    categories: string[];
  };

  const computed: Computed[] = ((wos ?? []) as unknown as WoRow[]).map(wo => {
    const partsRevenue = (wo.parts ?? []).reduce((a, p) => a + Number(p.qty) * Number(p.unit_price), 0);
    const partsCost = (wo.parts ?? []).reduce((a, p) => a + Number(p.qty) * Number(p.unit_cost ?? 0), 0);
    const laborRevenue = (wo.sections ?? []).reduce(
      (a, s) => a + Number(s.std_hours ?? 0) * Number(s.labor_rate ?? 0),
      0,
    );
    const laborCost = (wo.labor_logs ?? []).reduce((a, l) => {
      const rate = hourlyCostByUser.get(l.mechanic_id) ?? 0;
      return a + (Number(l.minutes ?? 0) / 60) * rate;
    }, 0);
    const thirdRevenue = (wo.third_party ?? []).reduce((a, t) => a + Number(t.price ?? 0), 0);
    const thirdCost = (wo.third_party ?? []).reduce((a, t) => a + Number(t.cost ?? 0), 0);

    const revenue = partsRevenue + laborRevenue + thirdRevenue;
    const cost = partsCost + laborCost + thirdCost;
    const margin = revenue - cost;

    return {
      id: wo.id,
      number: wo.number,
      label: `${wo.vehicle?.plate ?? '—'} · ${wo.customer?.name ?? '—'}`,
      revenue,
      cost,
      margin,
      marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
      categories: (wo.sections ?? []).map(s => s.category).filter(Boolean),
    };
  });

  const totalRevenue = computed.reduce((a, c) => a + c.revenue, 0);
  const totalCost = computed.reduce((a, c) => a + c.cost, 0);
  const totalMargin = totalRevenue - totalCost;
  const avgMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  const negativeCount = computed.filter(c => c.margin < 0).length;

  const worst = [...computed].sort((a, b) => a.margin - b.margin).slice(0, 10);
  const best = [...computed].sort((a, b) => b.margin - a.margin).slice(0, 10);

  // Margem media por categoria de servico
  const byCategory = new Map<string, { revenue: number; cost: number; count: number }>();
  ((wos ?? []) as unknown as WoRow[]).forEach(wo => {
    const partsCost = (wo.parts ?? []).reduce((a, p) => a + Number(p.qty) * Number(p.unit_cost ?? 0), 0);
    const partsRevenue = (wo.parts ?? []).reduce((a, p) => a + Number(p.qty) * Number(p.unit_price), 0);
    const laborCost = (wo.labor_logs ?? []).reduce((a, l) => {
      const rate = hourlyCostByUser.get(l.mechanic_id) ?? 0;
      return a + (Number(l.minutes ?? 0) / 60) * rate;
    }, 0);
    const nSections = (wo.sections ?? []).length || 1;
    (wo.sections ?? []).forEach(s => {
      const cat = s.category || 'outros';
      const entry = byCategory.get(cat) ?? { revenue: 0, cost: 0, count: 0 };
      entry.revenue += Number(s.std_hours ?? 0) * Number(s.labor_rate ?? 0) + partsRevenue / nSections;
      entry.cost += partsCost / nSections + laborCost / nSections;
      entry.count += 1;
      byCategory.set(cat, entry);
    });
  });
  const categoryRows = Array.from(byCategory.entries())
    .map(([cat, v]) => ({
      cat,
      count: v.count,
      margin: v.revenue - v.cost,
      marginPct: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0,
    }))
    .sort((a, b) => a.marginPct - b.marginPct);

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/relatorios"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar a relatorios
      </Link>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Custo real da OS</h1>
          <p className="text-sm text-slate-500">
            Receita − peças (custo médio) − horas apontadas × custo/hora do mecânico − terceiros. Últimos{' '}
            {days} dias, OS entregues.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {[30, 90, 180].map(d => (
            <Link
              key={d}
              href={`/app/relatorios/margem?dias=${d}`}
              className={`rounded-lg border px-2.5 py-1.5 font-semibold ${
                days === d ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-300 text-slate-600'
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="card-base p-4">
          <div className="text-sm text-slate-500">Receita total</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{formatBRL(totalRevenue)}</div>
        </div>
        <div className="card-base p-4">
          <div className="text-sm text-slate-500">Custo real total</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{formatBRL(totalCost)}</div>
        </div>
        <div className="card-base p-4">
          <div className="text-sm text-slate-500">Margem</div>
          <div className={`mt-1 text-2xl font-bold ${totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatBRL(totalMargin)}{' '}
            <span className="text-sm font-semibold text-slate-400">({avgMarginPct.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="card-base p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <AlertTriangle className="h-4 w-4 text-red-500" /> OS com prejuízo
          </div>
          <div className="mt-1 text-2xl font-bold text-red-600">{negativeCount}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-base p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
            <TrendingDown className="h-5 w-5 text-red-500" /> Piores margens
          </h2>
          <RankTable rows={worst} />
        </div>
        <div className="card-base p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
            <TrendingUp className="h-5 w-5 text-green-500" /> Melhores margens
          </h2>
          <RankTable rows={best} />
        </div>
      </div>

      <div className="card-base mt-6 p-5">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Margem média por tipo de serviço</h2>
        <p className="mb-3 text-xs text-slate-500">
          Categorias no fim da lista podem estar dando prejuízo sem o dono saber.
        </p>
        <div className="space-y-2">
          {categoryRows.map(row => (
            <div key={row.cat}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium capitalize text-slate-700">
                  {row.cat} <span className="text-slate-400">({row.count})</span>
                </span>
                <span className={`font-bold ${row.marginPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {row.marginPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${row.marginPct >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(Math.abs(row.marginPct), 100)}%` }}
                />
              </div>
            </div>
          ))}
          {!categoryRows.length && <div className="text-sm text-slate-500">Sem dados no período.</div>}
        </div>
      </div>
    </div>
  );
}

function RankTable({
  rows,
}: {
  rows: { id: string; number: number; label: string; margin: number; marginPct: number }[];
}) {
  return (
    <div className="space-y-1">
      {rows.map(r => (
        <Link
          key={r.id}
          href={`/app/os/${r.id}`}
          className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50"
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">OS #{r.number}</div>
            <div className="text-xs text-slate-500">{r.label}</div>
          </div>
          <div className={`text-right font-bold ${r.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatBRL(r.margin)}
            <div className="text-xs font-normal text-slate-400">{r.marginPct.toFixed(1)}%</div>
          </div>
        </Link>
      ))}
      {!rows.length && <div className="text-sm text-slate-500">Sem dados no período.</div>}
    </div>
  );
}
