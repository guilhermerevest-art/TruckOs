'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

// Tour guiado + Helper flutuante (placeholder de UI; IA entra quando ANTHROPIC_API_KEY estiver setada)
type Props = {
  module: string;
};

export function HelperWidget({ module }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: `Oi! Sou o assistente do modulo ${module}. Posso responder duvidas e sugerir proximos passos.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/helper/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, message: userMsg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: 'Desculpe, nao consegui responder agora.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg transition hover:scale-105 hover:bg-sky-700"
        aria-label="Abrir assistente"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[550px] w-96 flex-col rounded-2xl border bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b bg-sky-600 px-4 py-3 text-white">
        <div>
          <div className="font-bold">Assistente TruckOS</div>
          <div className="text-xs opacity-90">Modulo: {module}</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-500">digitando...</div>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Pergunte alguma coisa..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          <button
            onClick={send}
            disabled={loading}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}