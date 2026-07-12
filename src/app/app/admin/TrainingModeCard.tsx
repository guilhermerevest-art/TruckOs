'use client';

import { useState } from 'react';
import { GraduationCap, Trash2, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

export function TrainingModeCard({ isSandbox }: { isSandbox: boolean }) {
  const supabase = createClient();
  const toast = useToast();
  const [loading, setLoading] = useState<'enter' | 'exit' | 'reset' | null>(null);

  async function enter() {
    setLoading('enter');
    try {
      const { error } = await supabase.rpc('enter_training_mode');
      if (error) throw error;
      await supabase.auth.refreshSession();
      window.location.href = '/app';
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao entrar no treino', description: err?.message });
      setLoading(null);
    }
  }

  async function exit() {
    setLoading('exit');
    try {
      const { error } = await supabase.rpc('exit_training_mode');
      if (error) throw error;
      await supabase.auth.refreshSession();
      window.location.href = '/app';
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao sair do treino', description: err?.message });
      setLoading(null);
    }
  }

  async function reset() {
    setLoading('reset');
    try {
      const { error } = await supabase.rpc('reset_training_mode');
      if (error) throw error;
      toast.show({ type: 'success', title: 'Dados de treino apagados', description: 'A próxima entrada recria do zero.' });
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao apagar', description: err?.message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-purple-600" />
        <h2 className="text-lg font-bold text-slate-900">Modo Treinamento</h2>
      </div>

      {isSandbox ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Você está dentro do ambiente de treinamento agora — tudo aqui é fictício e não afeta a
            oficina real.
          </p>
          <button onClick={exit} disabled={loading !== null} className="btn-primary">
            <LogIn className="h-4 w-4" /> {loading === 'exit' ? 'Saindo…' : 'Sair do modo treinamento'}
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            Ambiente separado com dados fictícios para treinar funcionário novo sem sujar a base real.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={enter} disabled={loading !== null} className="btn-primary">
              <GraduationCap className="h-4 w-4" />
              {loading === 'enter' ? 'Entrando…' : 'Entrar no modo treinamento'}
            </button>
            <button onClick={reset} disabled={loading !== null} className="btn-secondary">
              <Trash2 className="h-4 w-4" /> {loading === 'reset' ? 'Apagando…' : 'Apagar dados de treino'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
