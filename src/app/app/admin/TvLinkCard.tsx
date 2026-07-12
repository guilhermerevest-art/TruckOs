'use client';

import { useState } from 'react';
import { Tv, Copy, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

export function TvLinkCard({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/tv/${token}` : '';

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.show({ type: 'success', title: 'Link copiado' });
  }

  async function regenerate() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('regenerate_tv_token');
      if (error) throw error;
      setToken(data as string);
      toast.show({ type: 'success', title: 'Novo link gerado', description: 'O link anterior parou de funcionar.' });
    } catch (err) {
      toast.show({ type: 'error', title: 'Nao foi possivel gerar novo link' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="mb-4 flex items-center gap-2">
        <Tv className="h-5 w-5 text-sky-600" />
        <h2 className="text-lg font-bold text-slate-900">Modo Patio (TV)</h2>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Abra este link em qualquer smart TV ou monitor da oficina: kanban ao vivo, requisicoes de peca e
        prometidos do dia, sem precisar logar. Atualiza sozinho.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 min-w-[240px] rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
        />
        <button onClick={copyLink} className="btn-secondary" type="button">
          <Copy className="h-4 w-4" /> Copiar
        </button>
        <button onClick={regenerate} disabled={loading} className="btn-ghost" type="button">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Gerar novo link
        </button>
      </div>
    </div>
  );
}
