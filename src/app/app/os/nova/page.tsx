'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Mic,
  CheckCircle2,
  Truck,
  UserPlus,
  ArrowRight,
  Loader2,
  Search,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PhotoCapture } from '@/components/PhotoCapture';

type Customer = { id: string; name: string; trade_name?: string | null };
type Vehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year?: number | null;
  customer_id: string;
};

// Categorias rápidas — mesmas do sistema, em portugues para a UI
const ISSUE_TEMPLATES = [
  'Revisão geral',
  'Troca de óleo e filtros',
  'Problema nos freios',
  'Supensão fazendo barulho',
  'Motor falhando / perdendo força',
  'Vazamento de óleo',
  'Elétrica / bateria',
  'Embreagem patinando',
  'Direção dura / puxando',
];

const PRIORITY_TEMPLATES = [
  { v: 'baixa', label: 'Sem pressa', color: 'bg-slate-100 text-slate-700' },
  { v: 'normal', label: 'Normal', color: 'bg-sky-100 text-sky-700' },
  { v: 'alta', label: 'Importante', color: 'bg-orange-100 text-orange-700' },
  { v: 'urgente', label: 'Urgente', color: 'bg-red-100 text-red-700' },
];

export default function NewOSPage() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const plateInputRef = useRef<HTMLInputElement>(null);

  // Estado unificado — um único formulário, sem "passos"
  const [plate, setPlate] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const [odometer, setOdometer] = useState('');
  const [issue, setIssue] = useState('');
  const [priority, setPriority] = useState('normal');
  const [promisedAt, setPromisedAt] = useState(''); // yyyy-mm-dd

  const [loading, setLoading] = useState(false);
  const [plateLoading, setPlateLoading] = useState(false);
  const [createdWoId, setCreatedWoId] = useState<string | null>(null);

  // Foca a placa ao abrir
  useEffect(() => {
    plateInputRef.current?.focus();
  }, []);

  // Busca cliente
  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const term = `%${customerSearch}%`;
      const { data } = await supabase
        .from('customers')
        .select('id, name, trade_name')
        .or(`name.ilike.${term},trade_name.${term},document.${term}`)
        .limit(8);
      setCustomerResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [customerSearch, supabase]);

  // Formata placa enquanto digita (ABC-1234 ou ABC1D23)
  function formatPlate(raw: string) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length <= 3) return clean;
    if (/^[A-Z]{3}\d{4}$/.test(clean)) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    return clean;
  }

  async function lookupPlate() {
    const cleaned = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleaned.length < 7) return;
    setPlateLoading(true);
    const { data } = await supabase
      .from('vehicles')
      .select('id,plate,brand,model,year,customer_id, customer:customers(id, name, trade_name)')
      .eq('plate', cleaned)
      .maybeSingle();

    if (data) {
      setVehicle(data as any);
      setCustomer((data as any).customer ?? null);
      toast.show({ type: 'success', title: 'Veículo encontrado', description: `${(data as any).brand} ${(data as any).model}` });
    } else {
      setVehicle(null);
      setCustomer(null);
      toast.show({
        type: 'info',
        title: 'Placa nova',
        description: 'Cadastre o veículo depois — vou abrir a OS sem cliente se precisar.',
      });
    }
    setPlateLoading(false);
  }

  async function createOS() {
    if (!plate) {
      toast.show({ type: 'error', title: 'Falta a placa' });
      plateInputRef.current?.focus();
      return;
    }
    if (!issue.trim()) {
      toast.show({ type: 'error', title: 'Conte o que está acontecendo com o caminhão' });
      return;
    }
    if (!vehicle && !customer) {
      toast.show({ type: 'error', title: 'Selecione um cliente ou cadastre o veículo' });
      return;
    }

    setLoading(true);
    try {
      const { data: tenant } = await supabase.from('tenants').select('id').single();
      if (!tenant) throw new Error('Não achei a oficina do seu usuário');

      // Descobre o próximo número (simplificado, refina com sequence no F2)
      const { data: lastWO } = await supabase
        .from('work_orders')
        .select('number')
        .order('number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const number = (lastWO?.number ?? 0) + 1;

      // Se não tem veículo cadastrado mas tem cliente, cria veículo rapidinho
      let vehicleId = vehicle?.id;
      if (!vehicleId && customer) {
        const { data: v, error: vErr } = await supabase
          .from('vehicles')
          .insert({
            tenant_id: tenant.id,
            customer_id: customer.id,
            plate: plate.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
          })
          .select()
          .single();
        if (vErr) throw vErr;
        vehicleId = v.id;
      }

      const { data: wo, error } = await supabase
        .from('work_orders')
        .insert({
          tenant_id: tenant.id,
          number,
          customer_id: customer!.id,
          vehicle_id: vehicleId!,
          odometer_km: odometer ? parseInt(odometer) : null,
          reported_issue: issue,
          priority,
          promised_at: promisedAt || null,
          status: 'recepcao',
          phase_entered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('wo_status_history').insert({
        tenant_id: tenant.id,
        work_order_id: wo.id,
        from_status: null,
        to_status: 'recepcao',
        note: 'OS criada via check-in',
      });

      toast.show({
        type: 'success',
        title: `OS #${number} criada!`,
        description: 'Abrindo a OS…',
      });
      router.push(`/app/os/${wo.id}`);
    } catch (e: any) {
      toast.show({
        type: 'error',
        title: 'Erro ao criar OS',
        description: e?.message ?? String(e),
      });
      setLoading(false);
    }
  }

  function newCustomer() {
    if (!customerSearch.trim()) {
      toast.show({ type: 'warning', title: 'Digite o nome do cliente' });
      return;
    }
    router.push(
      `/app/clientes/novo?return_to=/app/os/nova&name=${encodeURIComponent(customerSearch)}`,
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Check-in do caminhão</h1>
        <p className="text-sm text-slate-500">
          Placa → problema → criar OS. <kbd className="kbd">Enter</kbd> avança o campo.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        {/* 1. PLACA */}
        <div>
          <label className="block text-sm font-semibold text-slate-700">
            1. Placa do caminhão <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={plateInputRef}
                value={plate}
                onChange={e => setPlate(formatPlate(e.target.value))}
                onBlur={lookupPlate}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    lookupPlate();
                  }
                }}
                placeholder="ABC-1234 ou ABC1D23"
                maxLength={8}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-base font-bold uppercase tracking-wide outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {plateLoading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
          </div>

          {vehicle ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5 text-sm">
              <Truck className="h-4 w-4 flex-shrink-0 text-green-700" />
              <div className="flex-1">
                <div className="font-semibold text-green-900">
                  {vehicle.brand} {vehicle.model} {vehicle.year}
                </div>
                <div className="text-xs text-green-700">
                  Cliente: <strong>{customer?.name}</strong>
                </div>
              </div>
            </div>
          ) : plate.replace(/[^A-Z0-9]/g, '').length >= 7 ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
              Veículo não cadastrado. Selecione um cliente abaixo — o veículo será criado junto com a OS.
            </div>
          ) : null}
        </div>

        {/* 2. CLIENTE */}
        {plate && !customer && (
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              2. Cliente <span className="text-red-500">*</span>
            </label>
            <div className="relative mt-1">
              <input
                value={customerSearch}
                onChange={e => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerPicker(true);
                }}
                onFocus={() => setShowCustomerPicker(true)}
                placeholder="Buscar por nome, fantasia ou CPF/CNPJ..."
                className="input-base"
              />
              {showCustomerPicker && customerResults.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomer(c);
                        setShowCustomerPicker(false);
                        setCustomerSearch('');
                      }}
                      className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                    >
                      <div className="font-semibold">{c.name}</div>
                      {c.trade_name && (
                        <div className="text-xs text-slate-500">{c.trade_name}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={newCustomer}
              className="btn-secondary mt-2 w-full text-sm"
            >
              <UserPlus className="h-4 w-4" />
              Cadastrar novo cliente: "{customerSearch || '...'}"
            </button>
          </div>
        )}

        {/* 3. HODÔMETRO + PRIORIDADE */}
        {customer && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Hodômetro (km)</label>
                <input
                  type="number"
                  value={odometer}
                  onChange={e => setOdometer(e.target.value)}
                  placeholder="ex: 285000"
                  className="input-base mt-1"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Previsão entrega</label>
                <input
                  type="date"
                  value={promisedAt}
                  onChange={e => setPromisedAt(e.target.value)}
                  className="input-base mt-1"
                />
              </div>
            </div>

            {/* 4. PROBLEMA */}
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                3. O que está acontecendo? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={issue}
                onChange={e => setIssue(e.target.value)}
                rows={3}
                placeholder="Motorista disse / você viu / barulho estranho..."
                className="input-base mt-1"
              />

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs text-slate-500">Atalhos:</span>
                {ISSUE_TEMPLATES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setIssue(prev => (prev ? `${prev}; ${t}` : t))}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. PRIORIDADE */}
            <div>
              <label className="block text-sm font-semibold text-slate-700">4. Urgência</label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {PRIORITY_TEMPLATES.map(p => (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => setPriority(p.v)}
                    className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition ${
                      priority === p.v
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 6. FOTOS DE ENTRADA */}
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                5. Fotos (opcional)
              </label>
              <div className="mt-1">
                <PhotoCapture workOrderId={createdWoId ?? 'temp'} kind="foto_entrada" />
                {!createdWoId && (
                  <p className="mt-1 text-xs text-slate-500">
                    As fotos podem ser tiradas também depois que a OS existir.
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={createOS}
              disabled={loading}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Criando…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" /> Criar OS e abrir
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
