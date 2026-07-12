'use client';

import { useMemo, useState } from 'react';
import { Loader2, X, PackagePlus, Recycle, Trash2, ArrowLeftRight, Gauge } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type Vehicle = { id: string; plate: string; brand: string; model: string; axles: number };
type Tire = {
  id: string;
  fire_number: string;
  brand: string;
  model: string | null;
  size: string | null;
  life_number: number;
  status: 'estoque' | 'em_uso' | 'recapagem' | 'sucateado';
  purchase_cost: number;
};
type Position = {
  id: string;
  tire_id: string;
  vehicle_id: string;
  axle_number: number;
  position_code: string;
  odometer_at_mount: number | null;
};

function axlePositions(axleNum: number) {
  if (axleNum === 1) {
    return [
      { code: `${axleNum}-E`, label: 'Esquerda' },
      { code: `${axleNum}-D`, label: 'Direita' },
    ];
  }
  return [
    { code: `${axleNum}-E-ext`, label: 'Esq. externo' },
    { code: `${axleNum}-E-int`, label: 'Esq. interno' },
    { code: `${axleNum}-D-int`, label: 'Dir. interno' },
    { code: `${axleNum}-D-ext`, label: 'Dir. externo' },
  ];
}

export function PneusClient({
  tenantId,
  vehicles,
  initialTires,
  initialPositions,
  recapEvents,
}: {
  tenantId: string;
  vehicles: Vehicle[];
  initialTires: Tire[];
  initialPositions: Position[];
  recapEvents: { tire_id: string; cost: number | null }[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [tab, setTab] = useState<'diagrama' | 'estoque' | 'recapagem' | 'cpk'>('diagrama');
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [tires, setTires] = useState(initialTires);
  const [positions, setPositions] = useState(initialPositions);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [movingTireId, setMovingTireId] = useState<string | null>(null);
  const [mountModalSlot, setMountModalSlot] = useState<string | null>(null);
  const [newTireForm, setNewTireForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const vehicle = vehicles.find(v => v.id === vehicleId);
  const tireById = useMemo(() => new Map(tires.map(t => [t.id, t])), [tires]);
  const positionByCode = useMemo(() => {
    const map = new Map<string, Position>();
    positions.filter(p => p.vehicle_id === vehicleId).forEach(p => map.set(p.position_code, p));
    return map;
  }, [positions, vehicleId]);

  async function refetch() {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tires').select('*').order('fire_number'),
      supabase.from('tire_positions').select('*').is('removed_at', null),
    ]);
    setTires((t as any) ?? []);
    setPositions((p as any) ?? []);
  }

  async function handleSlotClick(code: string, axleNum: number) {
    const occupied = positionByCode.get(code);

    if (movingTireId) {
      setBusy(true);
      const { error } = await supabase.rpc('mount_tire', {
        p_tire_id: movingTireId,
        p_vehicle_id: vehicleId,
        p_position_code: code,
        p_axle_number: axleNum,
        p_kind: 'rodizio',
      });
      setBusy(false);
      setMovingTireId(null);
      if (error) {
        toast.show({ type: 'error', title: 'Erro no rodízio', description: error.message });
        return;
      }
      toast.show({ type: 'success', title: 'Rodízio feito' });
      refetch();
      return;
    }

    if (occupied) {
      setSelectedSlot(selectedSlot === code ? null : code);
    } else {
      setMountModalSlot(code);
    }
  }

  async function montarPneu(tireId: string, code: string, axleNum: number) {
    setBusy(true);
    const { error } = await supabase.rpc('mount_tire', {
      p_tire_id: tireId,
      p_vehicle_id: vehicleId,
      p_position_code: code,
      p_axle_number: axleNum,
    });
    setBusy(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao montar', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Pneu montado' });
    setMountModalSlot(null);
    refetch();
  }

  async function acao(tireId: string, novoStatus: 'estoque' | 'recapagem' | 'sucateado') {
    setBusy(true);
    const { error } = await supabase.rpc('remove_tire', { p_tire_id: tireId, p_new_status: novoStatus });
    setBusy(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro', description: error.message });
      return;
    }
    setSelectedSlot(null);
    refetch();
  }

  const cpkRows = useMemo(() => {
    const map = new Map<string, { key: string; totalCost: number; count: number }>();
    tires.forEach(t => {
      const key = `${t.brand} ${t.model ?? ''}`.trim();
      const entry = map.get(key) ?? { key, totalCost: 0, count: 0 };
      const recapCost = recapEvents.filter(e => e.tire_id === t.id).reduce((a, e) => a + Number(e.cost ?? 0), 0);
      entry.totalCost += Number(t.purchase_cost) + recapCost;
      entry.count += 1;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [tires, recapEvents]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Gestão de Pneus</h1>
        <p className="text-sm text-slate-500">2º maior custo da frota — rastreamento individual por fogo</p>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {(['diagrama', 'estoque', 'recapagem', 'cpk'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize ${
              tab === t ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            {t === 'cpk' ? 'CPK por marca' : t}
          </button>
        ))}
      </div>

      {tab === 'diagrama' && (
        <div>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="input-base mb-4 max-w-xs">
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>
            ))}
          </select>

          {movingTireId && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <span>Escolha a posição de destino para o rodízio…</span>
              <button onClick={() => setMovingTireId(null)} className="font-semibold underline">Cancelar</button>
            </div>
          )}

          {vehicle && (
            <div className="space-y-3">
              {Array.from({ length: vehicle.axles }, (_, i) => i + 1).map(axleNum => (
                <div key={axleNum} className="rounded-xl border bg-white p-3">
                  <div className="mb-2 text-xs font-bold uppercase text-slate-500">Eixo {axleNum}</div>
                  <div className="flex flex-wrap gap-2">
                    {axlePositions(axleNum).map(pos => {
                      const occupied = positionByCode.get(pos.code);
                      const tire = occupied ? tireById.get(occupied.tire_id) : null;
                      return (
                        <button
                          key={pos.code}
                          onClick={() => handleSlotClick(pos.code, axleNum)}
                          className={`w-32 rounded-lg border-2 p-3 text-left transition ${
                            selectedSlot === pos.code
                              ? 'border-sky-500 bg-sky-50'
                              : tire
                                ? 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                : 'border-dashed border-slate-300 hover:border-sky-400'
                          }`}
                        >
                          <div className="text-[10px] text-slate-500">{pos.label}</div>
                          {tire ? (
                            <>
                              <div className="text-sm font-bold text-slate-900">{tire.fire_number}</div>
                              <div className="text-[10px] text-slate-500">{tire.brand} · vida {tire.life_number}</div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-400">+ montar</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedSlot && positionByCode.get(selectedSlot) && (
            <div className="mt-4 flex flex-wrap gap-2 rounded-xl border bg-white p-4">
              <button onClick={() => setMovingTireId(positionByCode.get(selectedSlot)!.tire_id)} className="btn-secondary">
                <ArrowLeftRight className="h-4 w-4" /> Rodiziar
              </button>
              <button onClick={() => acao(positionByCode.get(selectedSlot)!.tire_id, 'estoque')} disabled={busy} className="btn-secondary">
                Remover (volta ao estoque)
              </button>
              <button onClick={() => acao(positionByCode.get(selectedSlot)!.tire_id, 'recapagem')} disabled={busy} className="btn-secondary">
                <Recycle className="h-4 w-4" /> Enviar p/ recapagem
              </button>
              <button onClick={() => acao(positionByCode.get(selectedSlot)!.tire_id, 'sucateado')} disabled={busy} className="btn-ghost text-red-600">
                <Trash2 className="h-4 w-4" /> Sucatear
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'estoque' && (
        <div>
          <button onClick={() => setNewTireForm(true)} className="btn-primary mb-4">
            <PackagePlus className="h-4 w-4" /> Cadastrar pneu
          </button>
          <div className="grid gap-2 md:grid-cols-3">
            {tires.filter(t => t.status === 'estoque').map(t => (
              <div key={t.id} className="card-base p-3">
                <div className="font-bold text-slate-900">{t.fire_number}</div>
                <div className="text-xs text-slate-500">{t.brand} {t.model} · {t.size}</div>
                <div className="text-xs text-slate-500">Vida {t.life_number} · {formatBRL(t.purchase_cost)}</div>
              </div>
            ))}
            {!tires.filter(t => t.status === 'estoque').length && (
              <div className="empty-state md:col-span-3">Nenhum pneu em estoque</div>
            )}
          </div>
        </div>
      )}

      {tab === 'recapagem' && (
        <div className="grid gap-2 md:grid-cols-3">
          {tires.filter(t => t.status === 'recapagem').map(t => (
            <RecapCard key={t.id} tire={t} onReceived={refetch} />
          ))}
          {!tires.filter(t => t.status === 'recapagem').length && (
            <div className="empty-state md:col-span-3">Nenhum pneu na recapadora</div>
          )}
        </div>
      )}

      {tab === 'cpk' && (
        <div className="card-base p-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Gauge className="h-4 w-4" /> Custo acumulado por marca/modelo (compra + recapagens)
          </div>
          <p className="mb-3 text-xs text-amber-700">
            CPK (custo por km) exige leituras periódicas de hodômetro por pneu — ainda não coletadas
            o bastante nesta base. Mostrando custo total acumulado como proxy até haver histórico de km.
          </p>
          <div className="space-y-2">
            {cpkRows.map(r => (
              <div key={r.key} className="flex items-center justify-between rounded-lg border bg-slate-50 p-3 text-sm">
                <span className="font-semibold text-slate-900">{r.key || 'Sem marca'}</span>
                <span className="text-slate-600">{r.count} pneu(s)</span>
                <span className="font-bold text-sky-700">{formatBRL(r.totalCost)}</span>
              </div>
            ))}
            {!cpkRows.length && <div className="text-sm text-slate-500">Sem pneus cadastrados ainda.</div>}
          </div>
        </div>
      )}

      {mountModalSlot && vehicle && (
        <MountModal
          slot={mountModalSlot}
          axleNum={Number(mountModalSlot.split('-')[0])}
          stockTires={tires.filter(t => t.status === 'estoque')}
          onClose={() => setMountModalSlot(null)}
          onMount={tireId => montarPneu(tireId, mountModalSlot, Number(mountModalSlot.split('-')[0]))}
          onCreateNew={() => setNewTireForm(true)}
        />
      )}

      {newTireForm && (
        <NewTireModal
          tenantId={tenantId}
          onClose={() => setNewTireForm(false)}
          onCreated={() => {
            setNewTireForm(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function RecapCard({ tire, onReceived }: { tire: Tire; onReceived: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [cost, setCost] = useState(0);
  const [saving, setSaving] = useState(false);

  async function receber() {
    setSaving(true);
    const { error } = await supabase.rpc('receive_from_recap', { p_tire_id: tire.id, p_cost: cost });
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Pneu recebido — nova vida' });
    onReceived();
  }

  return (
    <div className="card-base p-3">
      <div className="font-bold text-slate-900">{tire.fire_number}</div>
      <div className="text-xs text-slate-500">{tire.brand} · vida atual {tire.life_number}</div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          value={cost}
          onChange={e => setCost(parseFloat(e.target.value) || 0)}
          placeholder="Custo"
          className="input-base w-24 text-sm"
        />
        <button onClick={receber} disabled={saving} className="btn-primary flex-1 py-1.5 text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : `Receber (vida ${tire.life_number + 1})`}
        </button>
      </div>
    </div>
  );
}

function MountModal({
  slot,
  axleNum,
  stockTires,
  onClose,
  onMount,
  onCreateNew,
}: {
  slot: string;
  axleNum: number;
  stockTires: Tire[];
  onClose: () => void;
  onMount: (tireId: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Montar pneu — posição {slot}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-2">
          {stockTires.map(t => (
            <button
              key={t.id}
              onClick={() => onMount(t.id)}
              className="flex w-full items-center justify-between rounded-lg border bg-slate-50 p-3 text-left hover:border-sky-400"
            >
              <div>
                <div className="font-semibold text-slate-900">{t.fire_number}</div>
                <div className="text-xs text-slate-500">{t.brand} {t.model} · vida {t.life_number}</div>
              </div>
              <span className="text-xs font-semibold text-sky-600">Montar →</span>
            </button>
          ))}
          {!stockTires.length && <div className="text-sm text-slate-500">Nenhum pneu no estoque.</div>}
        </div>
        <button onClick={onCreateNew} className="btn-secondary mt-3 w-full">
          <PackagePlus className="h-4 w-4" /> Cadastrar pneu novo
        </button>
      </div>
    </div>
  );
}

function NewTireModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [fireNumber, setFireNumber] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [size, setSize] = useState('');
  const [cost, setCost] = useState(0);
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!fireNumber.trim() || !brand.trim()) {
      toast.show({ type: 'warning', title: 'Preencha fogo e marca' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('tires').insert({
      tenant_id: tenantId,
      fire_number: fireNumber,
      brand,
      model: model || null,
      size: size || null,
      purchase_cost: cost,
      purchase_date: new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao cadastrar', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Pneu cadastrado' });
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Cadastrar pneu</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <input placeholder="Número de fogo" value={fireNumber} onChange={e => setFireNumber(e.target.value)} className="input-base w-full" />
          <input placeholder="Marca" value={brand} onChange={e => setBrand(e.target.value)} className="input-base w-full" />
          <input placeholder="Modelo" value={model} onChange={e => setModel(e.target.value)} className="input-base w-full" />
          <input placeholder="Medida (ex: 295/80R22.5)" value={size} onChange={e => setSize(e.target.value)} className="input-base w-full" />
          <input type="number" step="0.01" placeholder="Custo de compra" value={cost} onChange={e => setCost(parseFloat(e.target.value) || 0)} className="input-base w-full" />
          <button onClick={salvar} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
