import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, PackageSearch, Clock } from 'lucide-react';
import { generateShiftIntro } from '@/lib/ai/turno';
import { CopyButton } from './CopyButton';

export default async function TurnoPage() {
  const supabase = await createClient();

  const { data: tenant } = await supabase.from('tenants').select('name').single();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(startOfDay);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const [{ data: openWOs }, { data: pendingParts }, { data: promised }] = await Promise.all([
    supabase
      .from('work_orders')
      .select('number, phase_entered_at, status, vehicle:vehicles(plate)')
      .neq('status', 'entregue')
      .lt('phase_entered_at', startOfDay.toISOString()),
    supabase
      .from('part_requests')
      .select('created_at, description, work_order:work_orders(number)')
      .eq('status', 'pendente'),
    supabase
      .from('work_orders')
      .select('number, promised_at, customer:customers(name), vehicle:vehicles(plate)')
      .neq('status', 'entregue')
      .gte('promised_at', tomorrowStart.toISOString())
      .lt('promised_at', tomorrowEnd.toISOString()),
  ]);

  const now = Date.now();
  const openOverdue = (openWOs ?? []).map(wo => ({
    number: wo.number,
    plate: (wo.vehicle as any)?.plate ?? '—',
    phase: wo.status,
    hoursInPhase: Math.round((now - new Date(wo.phase_entered_at).getTime()) / 3600000),
  }));

  const pendingPartsList = (pendingParts ?? []).map(p => ({
    wo_number: (p.work_order as any)?.number ?? 0,
    description: p.description ?? 'Peça',
    hoursWaiting: Math.round((now - new Date(p.created_at).getTime()) / 3600000),
  }));

  const promisedTomorrow = (promised ?? []).map(wo => ({
    number: wo.number,
    plate: (wo.vehicle as any)?.plate ?? '—',
    customer: (wo.customer as any)?.name ?? '—',
  }));

  const intro = await generateShiftIntro({
    tenantName: tenant?.name ?? 'oficina',
    openOverdue,
    pendingParts: pendingPartsList,
    promisedTomorrow,
  });

  const fullText = [
    `*Passagem de turno — ${tenant?.name ?? ''} — ${new Date().toLocaleDateString('pt-BR')}*`,
    '',
    intro,
    '',
    `*OS paradas (${openOverdue.length})*`,
    ...openOverdue.map(o => `• #${o.number} ${o.plate} — ${o.phase} há ${o.hoursInPhase}h`),
    openOverdue.length === 0 ? '• Nenhuma 🎉' : '',
    '',
    `*Peças pendentes (${pendingPartsList.length})*`,
    ...pendingPartsList.map(p => `• OS #${p.wo_number} — ${p.description} (aguardando ${p.hoursWaiting}h)`),
    pendingPartsList.length === 0 ? '• Nenhuma 🎉' : '',
    '',
    `*Prometidos para amanhã (${promisedTomorrow.length})*`,
    ...promisedTomorrow.map(w => `• #${w.number} ${w.plate} — ${w.customer}`),
    promisedTomorrow.length === 0 ? '• Nenhuma entrega prometida' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/equipe"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Passagem de turno</h1>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        </div>
        <CopyButton text={fullText} />
      </div>

      <div className="card-base mb-4 p-5">
        <p className="text-slate-800">{intro}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-base p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-red-500" /> OS paradas ({openOverdue.length})
          </h2>
          <div className="space-y-2">
            {openOverdue.map(o => (
              <div key={o.number} className="rounded-lg bg-slate-50 p-2 text-sm">
                <div className="font-semibold">#{o.number} · {o.plate}</div>
                <div className="text-xs text-slate-500">{o.phase} há {o.hoursInPhase}h</div>
              </div>
            ))}
            {!openOverdue.length && <div className="text-sm text-slate-500">Nenhuma 🎉</div>}
          </div>
        </div>

        <div className="card-base p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <PackageSearch className="h-4 w-4 text-orange-500" /> Peças pendentes ({pendingPartsList.length})
          </h2>
          <div className="space-y-2">
            {pendingPartsList.map((p, i) => (
              <div key={i} className="rounded-lg bg-slate-50 p-2 text-sm">
                <div className="font-semibold">OS #{p.wo_number}</div>
                <div className="text-xs text-slate-500">{p.description} · {p.hoursWaiting}h esperando</div>
              </div>
            ))}
            {!pendingPartsList.length && <div className="text-sm text-slate-500">Nenhuma 🎉</div>}
          </div>
        </div>

        <div className="card-base p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <Clock className="h-4 w-4 text-amber-500" /> Prometidos amanhã ({promisedTomorrow.length})
          </h2>
          <div className="space-y-2">
            {promisedTomorrow.map(w => (
              <div key={w.number} className="rounded-lg bg-slate-50 p-2 text-sm">
                <div className="font-semibold">#{w.number} · {w.plate}</div>
                <div className="text-xs text-slate-500">{w.customer}</div>
              </div>
            ))}
            {!promisedTomorrow.length && <div className="text-sm text-slate-500">Nenhuma entrega prometida</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
