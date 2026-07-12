'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Check, Copy, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function QuoteActions({
  quoteId,
  status,
  approvalToken,
  publicUrl,
}: {
  quoteId: string;
  status: string;
  approvalToken: string;
  publicUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function sendToClient() {
    setLoading(true);
    const res = await fetch(`/api/quotes/${quoteId}/send`, { method: 'POST' });
    setLoading(false);
    if (res.ok) {
      toast.show({ type: 'success', title: 'Orçamento enviado ao cliente' });
      router.refresh();
    } else {
      const txt = await res.text().catch(() => '');
      toast.show({ type: 'error', title: 'Erro ao enviar', description: txt });
    }
  }

  async function approveAsOffice() {
    setLoading(true);
    const res = await fetch(`/api/quotes/${quoteId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setLoading(false);
    if (res.ok) {
      toast.show({ type: 'success', title: 'Orçamento aprovado' });
      router.refresh();
    } else {
      const txt = await res.text().catch(() => '');
      toast.show({ type: 'error', title: 'Erro ao aprovar', description: txt });
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.show({ type: 'info', title: 'Link copiado' });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        onClick={copy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Copy className="h-4 w-4" />
        {copied ? 'Copiado!' : 'Copiar link'}
      </button>

      {status === 'draft' && (
        <button
          onClick={sendToClient}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar ao cliente
        </button>
      )}

      {(status === 'sent' || status === 'viewed') && (
        <button
          onClick={approveAsOffice}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aprovar pela oficina
        </button>
      )}
    </div>
  );
}
