'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function SandboxBanner() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function exit() {
    setLoading(true);
    await supabase.rpc('exit_training_mode');
    await supabase.auth.refreshSession();
    window.location.href = '/app';
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-purple-600 px-4 py-2 text-sm font-semibold text-white">
      <GraduationCap className="h-4 w-4" />
      Modo Treinamento — dados fictícios, nada aqui afeta a oficina real
      <button
        onClick={exit}
        disabled={loading}
        className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30"
      >
        {loading ? 'Saindo…' : 'Sair'}
      </button>
    </div>
  );
}
