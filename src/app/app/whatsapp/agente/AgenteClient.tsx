'use client';

import { useState } from 'react';
import { Save, Loader2, Send, Bot, User, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

type Config = {
  enabled: boolean;
  intents: { status: boolean; agendamento: boolean; triagem: boolean; garantia: boolean; negociacao: boolean };
  active_hours: { mode: 'fora_comercial' | 'sempre'; start: string; end: string };
  tone: 'formal' | 'proximo';
  forbidden_replies: string[];
};

const DEFAULT_CONFIG: Config = {
  enabled: false,
  intents: { status: true, agendamento: true, triagem: true, garantia: true, negociacao: false },
  active_hours: { mode: 'fora_comercial', start: '18:00', end: '08:00' },
  tone: 'proximo',
  forbidden_replies: [],
};

const INTENT_LABELS: Record<keyof Config['intents'], string> = {
  status: 'Consulta de status por placa',
  agendamento: 'Pré-agendamento',
  triagem: 'Triagem de defeito',
  garantia: 'Perguntas sobre garantia',
  negociacao: 'Negociação de preço / reclamação',
};

type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string };

export function AgenteClient({
  tenantId,
  initialConfig,
  handoffs,
  metrics,
}: {
  tenantId: string;
  initialConfig: Config | null;
  handoffs: any[];
  metrics: { resolvedCount: number; handoffCount: number; resolvedPct: number };
}) {
  const supabase = createClient();
  const toast = useToast();
  const [config, setConfig] = useState<Config>(initialConfig ?? DEFAULT_CONFIG);
  const [forbiddenText, setForbiddenText] = useState((initialConfig?.forbidden_replies ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [testing, setTesting] = useState(false);

  async function salvar() {
    setSaving(true);
    const payload = { ...config, forbidden_replies: forbiddenText.split('\n').map(s => s.trim()).filter(Boolean) };
    const { error } = await supabase.from('wa_agent_configs').upsert({ tenant_id: tenantId, ...payload });
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao salvar', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Configuração salva' });
  }

  async function enviarTeste() {
    if (!input.trim()) return;
    const userMsg = input;
    setChat(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setTesting(true);
    try {
      const res = await fetch('/api/ai/wa-agent-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: chat.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
          config: { ...config, forbidden_replies: forbiddenText.split('\n').filter(Boolean) },
        }),
      });
      const data = await res.json();
      if (data.error) {
        setChat(prev => [...prev, { role: 'system', content: `Erro: ${data.message ?? data.error}` }]);
        return;
      }
      const d = data.decision;
      if (d.action === 'reply') {
        setChat(prev => [...prev, { role: 'assistant', content: d.reply }]);
      } else {
        setChat(prev => [...prev, { role: 'system', content: `🔀 Transbordo (${d.reason}): ${d.summary}` }]);
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Config */}
      <div className="space-y-4">
        <div className="card-base p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Configuração</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} />
              Ativo
            </label>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Intents permitidos</div>
            <div className="space-y-1.5">
              {(Object.keys(INTENT_LABELS) as (keyof Config['intents'])[]).map(key => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.intents[key]}
                    onChange={e => setConfig(c => ({ ...c, intents: { ...c.intents, [key]: e.target.checked } }))}
                  />
                  {INTENT_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Horário de atuação</label>
              <select
                value={config.active_hours.mode}
                onChange={e => setConfig(c => ({ ...c, active_hours: { ...c.active_hours, mode: e.target.value as any } }))}
                className="input-base mt-1 w-full"
              >
                <option value="fora_comercial">Só fora do comercial</option>
                <option value="sempre">Sempre</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Tom de voz</label>
              <select
                value={config.tone}
                onChange={e => setConfig(c => ({ ...c, tone: e.target.value as any }))}
                className="input-base mt-1 w-full"
              >
                <option value="proximo">Próximo</option>
                <option value="formal">Formal</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-xs font-medium text-slate-500">Respostas proibidas (uma por linha)</label>
            <textarea
              value={forbiddenText}
              onChange={e => setForbiddenText(e.target.value)}
              rows={2}
              placeholder="Ex: garantir desconto sem autorização"
              className="input-base mt-1 w-full"
            />
          </div>

          <button onClick={salvar} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configuração
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="card-base p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{metrics.resolvedPct}%</div>
            <div className="text-xs text-slate-500">resolvido sem humano</div>
          </div>
          <div className="card-base p-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{metrics.resolvedCount}</div>
            <div className="text-xs text-slate-500">respostas automáticas</div>
          </div>
          <div className="card-base p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{metrics.handoffCount}</div>
            <div className="text-xs text-slate-500">transbordos</div>
          </div>
        </div>

        <div className="card-base p-5">
          <h2 className="mb-3 font-bold text-slate-900">Fila de supervisão — transbordos</h2>
          <div className="space-y-2">
            {handoffs.map(h => (
              <div key={h.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-1 font-semibold text-orange-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {h.reason}
                </div>
                <div className="text-xs text-slate-500">{h.conversation?.contact_name ?? h.conversation?.contact_phone}</div>
                <div className="mt-1 text-xs text-slate-600">{h.summary}</div>
              </div>
            ))}
            {!handoffs.length && <div className="text-sm text-slate-500">Nenhum transbordo ainda.</div>}
          </div>
        </div>
      </div>

      {/* Simulador */}
      <div className="card-base flex h-[600px] flex-col p-5">
        <h2 className="mb-3 font-bold text-slate-900">Simulador — teste antes de ativar</h2>
        <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`flex max-w-[80%] items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-sky-600 text-white'
                    : m.role === 'system'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-white text-slate-800 shadow-sm'
                }`}
              >
                {m.role === 'assistant' && <Bot className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                {m.role === 'user' && <User className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                <span>{m.content}</span>
              </div>
            </div>
          ))}
          {!chat.length && (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Digite como se fosse um cliente no WhatsApp
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && enviarTeste()}
            placeholder="Ex: qual o status da minha OS?"
            className="input-base flex-1"
          />
          <button onClick={enviarTeste} disabled={testing} className="btn-primary">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
