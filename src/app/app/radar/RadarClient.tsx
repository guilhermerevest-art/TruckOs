'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, MessageCircle, Loader2, ShieldAlert, Radar as RadarIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL, formatPhone } from '@/lib/utils';

type Opportunity = {
  id: string;
  category: string;
  description: string;
  predicted_at: string | null;
  confidence: number;
  estimated_value: number;
  status: 'prevista' | 'contatada' | 'agendada' | 'convertida' | 'descartada';
  vehicle: { plate: string; brand: string; model: string } | null;
  customer: { name: string; contacts: { phone_e164: string; whatsapp: boolean }[] } | null;
};

type RecallMatch = {
  vehicle_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  customer_name: string;
  recall_id: string;
  title: string;
  description: string | null;
  campaign_ref: string | null;
};

const COLUMNS: { key: Opportunity['status']; label: string }[] = [
  { key: 'prevista', label: 'Previstas' },
  { key: 'contatada', label: 'Contatadas' },
  { key: 'agendada', label: 'Agendadas' },
  { key: 'convertida', label: 'Convertidas' },
];

export function RadarClient({
  tenantId,
  initialOpportunities,
  recallMatches,
}: {
  tenantId: string;
  initialOpportunities: Opportunity[];
  recallMatches: RecallMatch[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<'radar' | 'recalls'>('radar');
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const map: Record<string, Opportunity[]> = { prevista: [], contatada: [], agendada: [], convertida: [] };
    for (const o of opportunities) {
      if (map[o.status]) map[o.status].push(o);
    }
    return map;
  }, [opportunities]);

  const revenueConverted = byColumn.convertida.reduce((a, o) => a + Number(o.estimated_value), 0);

  async function atualizarRadar() {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('compute_repurchase_radar', { p_tenant_id: tenantId });
      if (error) throw error;
      toast.show({ type: 'success', title: `Radar atualizado`, description: `${data} nova(s) oportunidade(s).` });
      router.refresh();
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao atualizar radar', description: err?.message });
    } finally {
      setRefreshing(false);
    }
  }

  async function moveStatus(o: Opportunity, status: Opportunity['status']) {
    const { error } = await supabase
      .from('repurchase_opportunities')
      .update({ status, ...(status === 'contatada' ? { contacted_at: new Date().toISOString() } : {}) })
      .eq('id', o.id);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao mover', description: error.message });
      return;
    }
    setOpportunities(prev => prev.map(x => (x.id === o.id ? { ...x, status } : x)));
  }

  async function sendWhatsapp(o: Opportunity) {
    const phone = o.customer?.contacts?.find(c => c.whatsapp)?.phone_e164;
    if (!phone) {
      toast.show({ type: 'warning', title: 'Sem WhatsApp cadastrado para este cliente' });
      return;
    }
    setSendingId(o.id);
    try {
      let { data: conv } = await supabase
        .from('wa_conversations')
        .select('id')
        .eq('contact_phone', phone)
        .maybeSingle();

      if (!conv) {
        const { data: created, error: convErr } = await supabase
          .from('wa_conversations')
          .insert({ contact_phone: phone, contact_name: o.customer?.name, customer_id: null })
          .select()
          .single();
        if (convErr) throw convErr;
        conv = created;
      }
      if (!conv) throw new Error('Nao foi possivel abrir a conversa');

      const msg = `Olá! Notamos que o ${o.vehicle?.plate ?? 'seu veículo'} está próximo da manutenção de ${o.category} (${o.description}). Quer agendar?`;

      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conv.id, phone, body: msg }),
      });
      if (!res.ok) throw new Error('Falha ao enviar');

      await moveStatus(o, 'contatada');
      toast.show({ type: 'success', title: 'Mensagem enviada' });
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao enviar', description: err?.message });
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Radar de Recompra</h1>
          <p className="text-sm text-slate-500">Manutenção preditiva por histórico — receita que a assinatura paga sozinha</p>
        </div>
        <button onClick={atualizarRadar} disabled={refreshing} className="btn-primary">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? 'Atualizando…' : 'Atualizar radar'}
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        <button
          onClick={() => setTab('radar')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === 'radar' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
          }`}
        >
          <RadarIcon className="h-4 w-4" /> Radar
        </button>
        <button
          onClick={() => setTab('recalls')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === 'recalls' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
          }`}
        >
          <ShieldAlert className="h-4 w-4" /> Recalls & campanhas ({recallMatches.length})
        </button>
      </div>

      {tab === 'radar' && (
        <>
          <div className="mb-4 card-base p-4">
            <div className="text-sm text-slate-500">Receita atribuída ao Radar (convertidas)</div>
            <div className="text-2xl font-bold text-green-600">{formatBRL(revenueConverted)}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {COLUMNS.map(col => {
              const items = byColumn[col.key] ?? [];
              const total = items.reduce((a, o) => a + Number(o.estimated_value), 0);
              return (
                <div key={col.key} className="rounded-xl border bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">{col.label}</span>
                    <span className="text-xs text-slate-500">{items.length}</span>
                  </div>
                  <div className="mb-2 text-xs font-semibold text-slate-500">{formatBRL(total)}</div>
                  <div className="space-y-2">
                    {items.map(o => (
                      <div key={o.id} className="rounded-lg border bg-white p-3 shadow-sm">
                        <div className="text-sm font-bold text-slate-900">{o.vehicle?.plate}</div>
                        <div className="text-xs text-slate-500">{o.customer?.name}</div>
                        <div className="mt-1 text-xs capitalize text-slate-700">{o.category}</div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="text-slate-500">
                            {o.predicted_at ? new Date(o.predicted_at).toLocaleDateString('pt-BR') : '—'}
                          </span>
                          <span className="font-semibold text-slate-700">{o.confidence}%</span>
                        </div>
                        <div className="mt-1 text-sm font-bold text-sky-700">{formatBRL(o.estimated_value)}</div>

                        {col.key === 'prevista' && (
                          <button
                            onClick={() => sendWhatsapp(o)}
                            disabled={sendingId === o.id}
                            className="btn-secondary mt-2 w-full py-1.5 text-xs"
                          >
                            {sendingId === o.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <MessageCircle className="h-3 w-3" />
                            )}
                            WhatsApp
                          </button>
                        )}
                        {col.key === 'contatada' && (
                          <button onClick={() => moveStatus(o, 'agendada')} className="btn-secondary mt-2 w-full py-1.5 text-xs">
                            Marcar agendada
                          </button>
                        )}
                        {col.key === 'agendada' && (
                          <button onClick={() => moveStatus(o, 'convertida')} className="btn-primary mt-2 w-full py-1.5 text-xs">
                            Marcar convertida
                          </button>
                        )}
                      </div>
                    ))}
                    {!items.length && <div className="text-center text-xs text-slate-400">Vazio</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'recalls' && (
        <div className="space-y-2">
          {recallMatches.map((m, i) => (
            <div key={i} className="card-base flex items-center justify-between p-4">
              <div>
                <div className="font-bold text-slate-900">
                  {m.plate} — {m.brand} {m.model} {m.year}
                </div>
                <div className="text-sm text-slate-600">{m.title}</div>
                <div className="text-xs text-slate-500">{m.customer_name}</div>
              </div>
              <span className="badge badge-warning">{m.campaign_ref ?? 'Campanha ativa'}</span>
            </div>
          ))}
          {!recallMatches.length && (
            <div className="empty-state">Nenhum recall/campanha cadastrada bate com a frota ainda.</div>
          )}
        </div>
      )}
    </div>
  );
}
