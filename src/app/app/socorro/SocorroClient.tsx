'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, MapPin, Sparkles, Loader2, Copy, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type Call = {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  reported_issue: string;
  status: string;
  location_link: string | null;
  dispatched_vehicle: string | null;
  suggested_checklist: { tools: string[]; parts: string[]; risk_note: string } | null;
  distance_km: number | null;
  travel_fee: number | null;
  customer: { name: string } | null;
  vehicle: { plate: string } | null;
  created_at: string;
};

const COLUMNS = [
  { key: 'aberto', label: 'Aberto' },
  { key: 'despachado', label: 'Despachado' },
  { key: 'em_atendimento', label: 'Em atendimento' },
  { key: 'concluido', label: 'Concluído' },
];

export function SocorroClient({ tenantSlug, initialCalls }: { tenantSlug: string; initialCalls: Call[] }) {
  const supabase = createClient();
  const toast = useToast();
  const [calls, setCalls] = useState(initialCalls);
  const [triagingId, setTriagingId] = useState<string | null>(null);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/socorro/${tenantSlug}` : '';

  async function copiarLink() {
    await navigator.clipboard.writeText(publicUrl);
    toast.show({ type: 'success', title: 'Link copiado', description: 'Compartilhe no portal/WhatsApp da frota.' });
  }

  async function avancar(call: Call, novoStatus: string) {
    const patch: any = { status: novoStatus };
    if (novoStatus === 'despachado') patch.dispatched_at = new Date().toISOString();
    if (novoStatus === 'em_atendimento') patch.arrived_at = new Date().toISOString();
    if (novoStatus === 'concluido') patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from('roadside_calls').update(patch).eq('id', call.id);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao mover', description: error.message });
      return;
    }
    setCalls(prev => prev.map(c => (c.id === call.id ? { ...c, ...patch } : c)));
  }

  async function despacharVeiculo(call: Call, veiculo: string) {
    await supabase.from('roadside_calls').update({ dispatched_vehicle: veiculo }).eq('id', call.id);
    setCalls(prev => prev.map(c => (c.id === call.id ? { ...c, dispatched_vehicle: veiculo } : c)));
  }

  async function taxaDeslocamento(call: Call, valor: number) {
    await supabase.from('roadside_calls').update({ travel_fee: valor }).eq('id', call.id);
    setCalls(prev => prev.map(c => (c.id === call.id ? { ...c, travel_fee: valor } : c)));
  }

  async function sugerirChecklist(call: Call) {
    setTriagingId(call.id);
    try {
      const res = await fetch('/api/ai/socorro-triagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id }),
      });
      const data = await res.json();
      if (data.checklist) {
        setCalls(prev => prev.map(c => (c.id === call.id ? { ...c, suggested_checklist: data.checklist } : c)));
      }
    } finally {
      setTriagingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <AlertTriangle className="h-6 w-6 text-red-600" /> Socorro & Oficina Móvel
          </h1>
          <p className="text-sm text-slate-500">Serviço de maior margem e maior fidelidade de frota</p>
        </div>
        <button onClick={copiarLink} className="btn-secondary">
          <Copy className="h-4 w-4" /> Copiar link público de chamado
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {COLUMNS.map(col => {
          const items = calls.filter(c => c.status === col.key);
          return (
            <div key={col.key} className="rounded-xl border bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">{col.label}</span>
                <span className="text-xs text-slate-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(c => (
                  <div key={c.id} className="rounded-lg border bg-white p-3 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">{c.contact_name ?? c.contact_phone}</div>
                    <div className="text-xs text-slate-500">{c.vehicle?.plate ?? c.customer?.name ?? 'Não identificado'}</div>
                    <div className="mt-1 text-xs text-slate-700">{c.reported_issue}</div>
                    {c.location_link && (
                      <a href={c.location_link} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-sky-600 hover:underline">
                        <MapPin className="h-3 w-3" /> Ver localização
                      </a>
                    )}

                    {!c.suggested_checklist && (
                      <button
                        onClick={() => sugerirChecklist(c)}
                        disabled={triagingId === c.id}
                        className="btn-secondary mt-2 w-full py-1 text-xs"
                      >
                        {triagingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Sugerir ferramentas/peças
                      </button>
                    )}
                    {c.suggested_checklist && (
                      <div className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-900">
                        {c.suggested_checklist.risk_note && <div className="mb-1 font-bold">⚠ {c.suggested_checklist.risk_note}</div>}
                        <div><strong>Ferramentas:</strong> {c.suggested_checklist.tools.join(', ') || '—'}</div>
                        <div><strong>Peças:</strong> {c.suggested_checklist.parts.join(', ') || '—'}</div>
                      </div>
                    )}

                    {col.key === 'aberto' && (
                      <div className="mt-2 flex gap-1">
                        <input
                          placeholder="Veículo/placa socorro"
                          onBlur={e => e.target.value && despacharVeiculo(c, e.target.value)}
                          className="input-base flex-1 py-1 text-xs"
                        />
                        <button onClick={() => avancar(c, 'despachado')} className="btn-primary py-1 text-xs">Despachar</button>
                      </div>
                    )}
                    {col.key === 'despachado' && (
                      <button onClick={() => avancar(c, 'em_atendimento')} className="btn-primary mt-2 w-full py-1 text-xs">
                        Marcar chegada
                      </button>
                    )}
                    {col.key === 'em_atendimento' && (
                      <div className="mt-2 space-y-1">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Taxa de deslocamento (R$)"
                          onBlur={e => taxaDeslocamento(c, parseFloat(e.target.value) || 0)}
                          className="input-base w-full py-1 text-xs"
                        />
                        <button onClick={() => avancar(c, 'concluido')} className="btn-primary w-full py-1 text-xs">
                          Concluir atendimento
                        </button>
                        <Link href="/app/os/nova" className="btn-secondary w-full py-1 text-xs">
                          <Plus className="h-3 w-3" /> Criar OS de campo
                        </Link>
                      </div>
                    )}
                    {col.key === 'concluido' && c.travel_fee != null && (
                      <div className="mt-1 text-xs font-semibold text-green-700">
                        Deslocamento: {formatBRL(c.travel_fee)}
                      </div>
                    )}
                  </div>
                ))}
                {!items.length && <div className="text-center text-xs text-slate-400">Vazio</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
