'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

const WORK_START_H = 8;
const WORK_END_H = 18;
const LUNCH_START_H = 12;
const LUNCH_END_H = 13;

type Mechanic = { id: string; name: string };
type Appt = {
  id: string;
  mechanic_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  std_hours: number;
  service_description: string;
  status: string;
  overbooked: boolean;
  customer: { name: string } | null;
  vehicle: { plate: string } | null;
};

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // segunda como inicio
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtDay(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function suggestSlots(mechanics: Mechanic[], appts: Appt[], stdHours: number, from: Date, count = 3) {
  const slots: { mechanic: Mechanic; start: Date; end: Date }[] = [];
  const durationMs = stdHours * 3600000;

  for (let dayOffset = 0; dayOffset < 12 && slots.length < count; dayOffset++) {
    const day = addDays(from, dayOffset);
    if (day.getDay() === 0) continue; // domingo fechado

    for (const mech of mechanics) {
      const dayBusy = appts
        .filter(a => a.mechanic_id === mech.id && sameDay(new Date(a.scheduled_start), day))
        .map(a => ({ start: new Date(a.scheduled_start), end: new Date(a.scheduled_end) }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const windows: [Date, Date][] = [
        [new Date(day.setHours(WORK_START_H, 0, 0, 0)), new Date(day.setHours(LUNCH_START_H, 0, 0, 0))],
        [new Date(day.setHours(LUNCH_END_H, 0, 0, 0)), new Date(day.setHours(WORK_END_H, 0, 0, 0))],
      ];

      for (const [wStart, wEnd] of windows) {
        let cursor = wStart;
        const now = new Date();
        if (cursor < now && sameDay(cursor, now)) cursor = now;

        const relevant = dayBusy.filter(b => b.end > wStart && b.start < wEnd);
        for (const b of relevant) {
          if (b.start.getTime() - cursor.getTime() >= durationMs) {
            slots.push({ mechanic: mech, start: new Date(cursor), end: new Date(cursor.getTime() + durationMs) });
          }
          if (b.end > cursor) cursor = b.end;
        }
        if (wEnd.getTime() - cursor.getTime() >= durationMs) {
          slots.push({ mechanic: mech, start: new Date(cursor), end: new Date(cursor.getTime() + durationMs) });
        }
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, count);
}

export function AgendaClient({ tenantId, mechanics }: { tenantId: string; mechanics: Mechanic[] }) {
  const supabase = createClient();
  const toast = useToast();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    supabase
      .from('appointments')
      .select('id, mechanic_id, scheduled_start, scheduled_end, std_hours, service_description, status, overbooked, customer:customers(name), vehicle:vehicles(plate)')
      .gte('scheduled_start', weekStart.toISOString())
      .lt('scheduled_start', weekEnd.toISOString())
      .neq('status', 'cancelado')
      .order('scheduled_start')
      .then(({ data }) => {
        setAppts((data as any) ?? []);
        setLoading(false);
      });
  }, [weekStart, supabase]);

  const todayCapacity = useMemo(() => {
    const today = new Date();
    const todayAppts = appts.filter(a => sameDay(new Date(a.scheduled_start), today));
    const committed = todayAppts.reduce((acc, a) => acc + Number(a.std_hours), 0);
    const available = mechanics.length * (WORK_END_H - WORK_START_H - 1);
    return { committed, available, pct: available > 0 ? Math.min(100, (committed / available) * 100) : 0 };
  }, [appts, mechanics]);

  function apptsFor(mechanicId: string, day: Date) {
    return appts.filter(a => a.mechanic_id === mechanicId && sameDay(new Date(a.scheduled_start), day));
  }

  function occupancyColor(hours: number) {
    const pct = (hours / (WORK_END_H - WORK_START_H - 1)) * 100;
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 60) return 'bg-amber-500';
    if (pct > 0) return 'bg-green-500';
    return 'bg-slate-100';
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda Inteligente</h1>
          <p className="text-sm text-slate-500">Capacidade real por mecânico — não prometa o que não cabe</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Novo agendamento
        </button>
      </div>

      <div className="mb-4 card-base p-4">
        <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
          <span>Capacidade comprometida hoje</span>
          <span>{todayCapacity.committed.toFixed(1)}h / {todayCapacity.available}h</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${todayCapacity.pct >= 90 ? 'bg-red-500' : todayCapacity.pct >= 60 ? 'bg-amber-500' : 'bg-green-500'}`}
            style={{ width: `${todayCapacity.pct}%` }}
          />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn-secondary">
          <ChevronLeft className="h-4 w-4" /> Semana anterior
        </button>
        <div className="text-sm font-semibold text-slate-700">
          {fmtDay(weekStart)} — {fmtDay(addDays(weekStart, 5))}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn-secondary">
          Próxima semana <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b p-2 text-left text-xs text-slate-500">Mecânico</th>
                {days.map(d => (
                  <th key={d.toISOString()} className="border-b p-2 text-left text-xs text-slate-500">{fmtDay(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mechanics.map(mech => (
                <tr key={mech.id} className="align-top">
                  <td className="border-b p-2 text-xs font-semibold text-slate-700">{mech.name}</td>
                  {days.map(day => {
                    const dayAppts = apptsFor(mech.id, day);
                    const hours = dayAppts.reduce((a, x) => a + Number(x.std_hours), 0);
                    return (
                      <td key={day.toISOString()} className="min-w-[160px] border-b p-2 align-top">
                        <div className={`mb-1 h-1.5 rounded-full ${occupancyColor(hours)}`} />
                        <div className="space-y-1">
                          {dayAppts.map(a => (
                            <div key={a.id} className="rounded bg-sky-50 p-1.5 text-xs">
                              <div className="font-semibold text-sky-900">
                                {new Date(a.scheduled_start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                {' '}· {a.vehicle?.plate ?? ''}
                              </div>
                              <div className="truncate text-sky-700">{a.customer?.name}</div>
                              {a.overbooked && <div className="text-[10px] font-bold text-orange-600">OVERBOOKING</div>}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!mechanics.length && (
                <tr><td colSpan={7} className="p-6 text-center text-sm text-slate-500">Cadastre mecânicos ativos em Configurações → Equipe.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NewAppointmentModal
          tenantId={tenantId}
          mechanics={mechanics}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            setWeekStart(w => new Date(w));
            const weekEnd = addDays(weekStart, 7);
            supabase
              .from('appointments')
              .select('id, mechanic_id, scheduled_start, scheduled_end, std_hours, service_description, status, overbooked, customer:customers(name), vehicle:vehicles(plate)')
              .gte('scheduled_start', weekStart.toISOString())
              .lt('scheduled_start', weekEnd.toISOString())
              .neq('status', 'cancelado')
              .order('scheduled_start')
              .then(({ data }) => setAppts((data as any) ?? []));
          }}
        />
      )}
    </div>
  );
}

function NewAppointmentModal({
  tenantId,
  mechanics,
  onClose,
  onCreated,
}: {
  tenantId: string;
  mechanics: Mechanic[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [stdHours, setStdHours] = useState(2);
  const [suggesting, setSuggesting] = useState(false);
  const [slots, setSlots] = useState<{ mechanic: Mechanic; start: Date; end: Date }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setCustomers([]);
      return;
    }
    const t = setTimeout(() => {
      supabase
        .from('customers')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .limit(6)
        .then(({ data }) => setCustomers(data ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [query, supabase]);

  function pickCustomer(c: any) {
    setCustomer(c);
    setCustomers([]);
    setQuery(c.name);
    supabase.from('vehicles').select('id, plate, brand, model').eq('customer_id', c.id).then(({ data }) => setVehicles(data ?? []));
  }

  async function sugerir() {
    if (!description.trim()) {
      toast.show({ type: 'warning', title: 'Descreva o serviço primeiro' });
      return;
    }
    setSuggesting(true);
    const from = new Date();
    const to = addDays(from, 14);
    const { data } = await supabase
      .from('appointments')
      .select('mechanic_id, scheduled_start, scheduled_end')
      .gte('scheduled_start', from.toISOString())
      .lt('scheduled_start', to.toISOString())
      .neq('status', 'cancelado');
    const found = suggestSlots(mechanics, (data as any) ?? [], stdHours, from);
    setSlots(found);
    setSuggesting(false);
    if (!found.length) toast.show({ type: 'warning', title: 'Sem horário livre nos próximos 12 dias' });
  }

  async function confirmarSlot(slot: { mechanic: Mechanic; start: Date; end: Date }) {
    if (!customer) {
      toast.show({ type: 'warning', title: 'Selecione o cliente' });
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from('appointments').insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      vehicle_id: vehicleId,
      mechanic_id: slot.mechanic.id,
      service_description: description,
      std_hours: stdHours,
      scheduled_start: slot.start.toISOString(),
      scheduled_end: slot.end.toISOString(),
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao agendar', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Agendado!' });
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Novo agendamento</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="relative mb-3">
          <label className="text-xs font-medium text-slate-500">Cliente</label>
          <input
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setCustomer(null);
            }}
            placeholder="Buscar cliente…"
            className="input-base mt-1 w-full"
          />
          {customers.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg">
              {customers.map(c => (
                <button key={c.id} onClick={() => pickCustomer(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50">
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {vehicles.length > 0 && (
          <div className="mb-3">
            <label className="text-xs font-medium text-slate-500">Veículo</label>
            <select value={vehicleId ?? ''} onChange={e => setVehicleId(e.target.value || null)} className="input-base mt-1 w-full">
              <option value="">—</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3">
          <label className="text-xs font-medium text-slate-500">Serviço</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: troca de lona dianteira" className="input-base mt-1 w-full" />
        </div>

        <div className="mb-3">
          <label className="text-xs font-medium text-slate-500">Tempo padrão (horas)</label>
          <input type="number" step="0.5" value={stdHours} onChange={e => setStdHours(parseFloat(e.target.value) || 1)} className="input-base mt-1 w-28" />
        </div>

        <button onClick={sugerir} disabled={suggesting} className="btn-primary w-full">
          {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Sugerir melhores horários
        </button>

        {slots.length > 0 && (
          <div className="mt-3 space-y-2">
            {slots.map((s, i) => (
              <button
                key={i}
                onClick={() => confirmarSlot(s)}
                disabled={saving}
                className="flex w-full items-center justify-between rounded-lg border bg-slate-50 p-3 text-left hover:border-sky-400 hover:bg-sky-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {s.start.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — {s.mechanic.name}
                  </div>
                </div>
                <span className="text-xs font-semibold text-sky-600">Escolher →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
