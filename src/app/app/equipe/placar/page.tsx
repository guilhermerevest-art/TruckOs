import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { ExportPlacarButton } from './ExportPlacarButton';

const METAS = { eficiencia: 85, qualidade: 95, pontualidade: 90 };

export default async function PlacarPage() {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: mechanics }, { data: logs }, { data: returns }, { data: requests }] = await Promise.all([
    supabase.from('tenant_members').select('user_id, display_name').eq('role', 'mechanic').eq('active', true),
    supabase
      .from('wo_labor_logs')
      .select('mechanic_id, minutes, ended_at, pause_reason, section:wo_sections(id, std_hours, work_order_id)')
      .gte('started_at', startOfMonth.toISOString()),
    supabase.from('work_orders').select('origin_wo_id').not('origin_wo_id', 'is', null),
    supabase
      .from('part_requests')
      .select('requested_by, status')
      .gte('created_at', startOfMonth.toISOString()),
  ]);

  const originSet = new Set((returns ?? []).map(r => r.origin_wo_id));

  const rows = (mechanics ?? []).map(m => {
    const mine = (logs ?? []).filter(l => l.mechanic_id === m.user_id);
    const actualHours = mine.reduce((a, l) => a + Number(l.minutes ?? 0), 0) / 60;

    const seenSections = new Set<string>();
    let stdHours = 0;
    const woTouched = new Set<string>();
    mine.forEach(l => {
      const s = l.section as any;
      if (s && !seenSections.has(s.id)) {
        seenSections.add(s.id);
        stdHours += Number(s.std_hours ?? 0);
      }
      if (s?.work_order_id) woTouched.add(s.work_order_id);
    });

    const returnedCount = Array.from(woTouched).filter(id => originSet.has(id)).length;
    const quality = woTouched.size > 0 ? 100 - (returnedCount / woTouched.size) * 100 : 100;

    const punctuality = mine.length > 0 ? (mine.filter(l => l.ended_at).length / mine.length) * 100 : 100;

    const myRequests = (requests ?? []).filter(r => r.requested_by === m.user_id);
    const correctRequests = myRequests.filter(r => !['sem_estoque', 'cancelado'].includes(r.status)).length;
    const requestsPct = myRequests.length > 0 ? (correctRequests / myRequests.length) * 100 : 100;

    const efficiency = actualHours > 0 ? (stdHours / actualHours) * 100 : 0;
    const score =
      (Math.min(100, efficiency) + quality + punctuality + requestsPct) / 4;

    return {
      id: m.user_id,
      name: m.display_name ?? `Mecânico ${m.user_id.slice(0, 4)}`,
      efficiency,
      quality,
      punctuality,
      requestsPct,
      score,
      hoursWorked: actualHours,
    };
  });

  rows.sort((a, b) => b.score - a.score);

  return (
    <div className="p-6 lg:p-8">
      <Link href="/app/equipe" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Placar de Produtivos</h1>
          <p className="text-sm text-slate-500">
            Metas: eficiência {METAS.eficiencia}% · qualidade {METAS.qualidade}% · pontualidade {METAS.pontualidade}%
          </p>
        </div>
        <ExportPlacarButton rows={rows} />
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id} className="card-base p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {i === 0 && <Trophy className="h-5 w-5 text-amber-500" />}
                {i === 1 && <Trophy className="h-5 w-5 text-slate-400" />}
                {i === 2 && <Trophy className="h-5 w-5 text-orange-700" />}
                <span className="font-bold text-slate-900">{i + 1}. {r.name}</span>
                <span className="text-xs text-slate-400">{r.hoursWorked.toFixed(1)}h apontadas</span>
              </div>
              <span className="text-xl font-extrabold text-sky-700">{r.score.toFixed(0)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Metric label="Eficiência" value={r.efficiency} meta={METAS.eficiencia} />
              <Metric label="Qualidade" value={r.quality} meta={METAS.qualidade} />
              <Metric label="Pontualidade" value={r.punctuality} meta={METAS.pontualidade} />
              <Metric label="Requisições" value={r.requestsPct} meta={90} />
            </div>
          </div>
        ))}
        {!rows.length && <div className="empty-state">Nenhum mecânico ativo cadastrado ainda.</div>}
      </div>
    </div>
  );
}

function Metric({ label, value, meta }: { label: string; value: number; meta: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const ok = value >= meta;
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold ${ok ? 'text-green-600' : 'text-amber-600'}`}>{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${ok ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
