import { createClient } from '@/lib/supabase/server';
import { AlertTriangle, Clock, CheckCircle2, Plus } from 'lucide-react';
import Link from 'next/link';

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  vencido: { label: 'Vencido', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  proximo: { label: 'Proximo', color: 'bg-amber-100 text-amber-700', icon: Clock },
  ok: { label: 'Em dia', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default async function PMPage() {
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from('pm_plans')
    .select('id, name, next_due_km, next_due_at, status, vehicle:vehicles(plate, brand, model, customer:customers(name))')
    .eq('active', true)
    .order('next_due_at', { ascending: true });

  const vencidos = (plans ?? []).filter(p => p.status === 'vencido');
  const proximos = (plans ?? []).filter(p => p.status === 'proximo');
  const ok = (plans ?? []).filter(p => p.status === 'ok');

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manutencao Preventiva</h1>
          <p className="text-sm text-slate-500">
            Alertas de revisao por km, tempo ou horimetro
          </p>
        </div>
        <Link
          href="/app/pm/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" /> Novo plano
        </Link>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-red-700">Vencidos</span>
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-red-700">{vencidos.length}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-amber-700">Proximos</span>
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{proximos.length}</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-green-700">Em dia</span>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-green-700">{ok.length}</div>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {(vencidos.length > 0 || proximos.length > 0) && (
          <>
            <h2 className="mt-4 text-sm font-bold uppercase tracking-wider text-slate-700">
              Atencao necessaria
            </h2>
            {[...vencidos, ...proximos].map(p => {
              const meta = STATUS_META[p.status];
              const Icon = meta.icon;
              const v = p.vehicle as any;
              return (
                <Link
                  key={p.id}
                  href={`/app/clientes/${v?.customer?.id}`}
                  className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className={`rounded-full p-2 ${meta.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{p.name}</div>
                      <div className="text-sm text-slate-600">
                        {v?.plate} · {v?.brand} {v?.model} · {v?.customer?.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {p.next_due_km && (
                      <div className="text-sm font-semibold">{p.next_due_km.toLocaleString('pt-BR')} km</div>
                    )}
                    {p.next_due_at && (
                      <div className="text-xs text-slate-500">
                        {new Date(p.next_due_at).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </>
        )}

        {ok.length > 0 && (
          <>
            <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-slate-700">
              Em dia
            </h2>
            {ok.map(p => {
              const v = p.vehicle as any;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border bg-white p-4 opacity-70 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="text-sm text-slate-600">
                        {v?.plate} · {v?.brand} {v?.model}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.next_due_at
                      ? new Date(p.next_due_at).toLocaleDateString('pt-BR')
                      : '-'}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {!plans?.length && (
          <div className="rounded-xl border-2 border-dashed bg-white p-12 text-center text-slate-500">
            Nenhum plano de PM cadastrado. Crie um plano para comecar.
          </div>
        )}
      </div>
    </div>
  );
}