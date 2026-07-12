'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle, Send, ArrowLeft, WifiOff } from 'lucide-react';
import { formatPhone } from '@/lib/utils';

type Conv = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  status: string;
  last_message_at: string;
  unread_count: number;
  customer: { name: string } | null;
};

type Msg = {
  id: string;
  direction: 'in' | 'out';
  kind: string;
  body: string | null;
  created_at: string;
  status: string;
};

export function WhatsAppInbox({
  initialConversations,
  instance,
}: {
  initialConversations: Conv[];
  instance: any;
}) {
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conv[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Realtime: novas conversas
  useEffect(() => {
    const channel = supabase
      .channel('wa_conv_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wa_conversations' },
        () => {
          supabase
            .from('wa_conversations')
            .select('id, contact_phone, contact_name, status, last_message_at, unread_count, customer:customers(name)')
            .order('last_message_at', { ascending: false })
            .limit(50)
            .then(({ data }) => data && setConversations(data as any));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Carrega mensagens quando muda conversa ativa
  useEffect(() => {
    if (!activeId) return;
    supabase
      .from('wa_messages')
      .select('id, direction, kind, body, created_at, status')
      .eq('conversation_id', activeId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages((data as any) ?? []));
  }, [activeId, supabase]);

  const active = conversations.find(c => c.id === activeId);

  async function send() {
    if (!active || !text.trim()) return;
    setSending(true);

    // Grava local primeiro (UI otimista)
    const tmpId = 'tmp-' + Date.now();
    const optimistic: Msg = {
      id: tmpId,
      direction: 'out',
      kind: 'text',
      body: text,
      created_at: new Date().toISOString(),
      status: 'queued',
    };
    setMessages(prev => [...prev, optimistic]);
    setText('');

    // Tenta enviar (se a Evolution estiver configurada)
    try {
      await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: active.id,
          phone: active.contact_phone,
          body: optimistic.body,
        }),
      });
    } catch {
      // silencioso — mensagem fica gravada como 'queued'
    }

    setSending(false);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Lista de conversas */}
      <aside className="w-80 flex-shrink-0 border-r bg-white">
        <div className="border-b p-3 text-xs font-semibold uppercase text-slate-500">
          Conversas ({conversations.length})
        </div>
        <div className="overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              Nenhuma conversa ainda.
              <br />
              <span className="text-xs">
                Conecte o WhatsApp para comecar a receber mensagens.
              </span>
            </div>
          )}
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex w-full items-start gap-3 border-b p-3 text-left hover:bg-slate-50 ${
                activeId === c.id ? 'bg-sky-50' : ''
              }`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                {(c.customer?.name ?? c.contact_name ?? c.contact_phone).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="truncate font-semibold text-slate-900">
                    {c.customer?.name ?? c.contact_name ?? formatPhone(c.contact_phone)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(c.last_message_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="truncate text-xs text-slate-500">
                    {formatPhone(c.contact_phone)}
                  </div>
                  {c.unread_count > 0 && (
                    <span className="rounded-full bg-green-600 px-1.5 text-xs font-bold text-white">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Painel de mensagens */}
      <section className="flex flex-1 flex-col bg-slate-100">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageCircle className="mx-auto h-12 w-12" />
              <div className="mt-3 text-sm">Selecione uma conversa</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">
                {(active.customer?.name ?? active.contact_name ?? active.contact_phone)
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-slate-900">
                  {active.customer?.name ?? active.contact_name ?? 'Sem nome'}
                </div>
                <div className="text-xs text-slate-500">{formatPhone(active.contact_phone)}</div>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {!instance && (
                <div className="mx-auto max-w-md rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
                  <WifiOff className="mx-auto h-6 w-6" />
                  <div className="mt-2 font-semibold">WhatsApp nao conectado</div>
                  <div className="mt-1 text-xs">
                    Mensagens serao gravadas mas nao enviadas ate configurar a integracao.
                  </div>
                </div>
              )}
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === 'out'
                        ? 'bg-green-500 text-white'
                        : 'bg-white text-slate-800 shadow-sm'
                    }`}
                  >
                    {m.body}
                    <div
                      className={`mt-0.5 text-[10px] ${
                        m.direction === 'out' ? 'text-green-100' : 'text-slate-400'
                      }`}
                    >
                      {new Date(m.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t bg-white p-3">
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <button
                  onClick={send}
                  disabled={sending || !text.trim()}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}