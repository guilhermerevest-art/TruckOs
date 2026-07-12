'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KANBAN_PHASES, type KanbanPhaseKey } from '@/lib/utils';
import { ArrowRight, ArrowLeft, Loader2, ChevronDown, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function PhaseMoveButtons({
  woId,
  currentPhase,
  woNumber,
}: {
  woId: string;
  currentPhase: string;
  woNumber: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentIdx = KANBAN_PHASES.findIndex(p => p.key === currentPhase);

  async function move(phase: KanbanPhaseKey) {
    if (phase === currentPhase) return;
    setLoading(true);
    setPickerOpen(false);
    const supabase = createClient();
    const { error } = await supabase.rpc('move_work_order', {
      p_work_order_id: woId,
      p_new_status: phase,
    });
    setLoading(false);

    if (error) {
      toast.show({
        type: 'error',
        title: 'Não consegui mover a OS',
        description: error.message,
      });
      return;
    }

    const phaseLabel = KANBAN_PHASES.find(p => p.key === phase)?.label;
    const nextIdx = KANBAN_PHASES.findIndex(p => p.key === phase);
    const nextPhase = KANBAN_PHASES[nextIdx + 1];
    toast.show({
      type: 'success',
      title: `OS #${woNumber} → ${phaseLabel}`,
      description: nextPhase ? `Próxima: ${nextPhase.label}` : 'Última fase.',
    });
    router.refresh();
  }

  const next = currentIdx >= 0 ? KANBAN_PHASES[currentIdx + 1] : null;
  const prev = currentIdx > 0 ? KANBAN_PHASES[currentIdx - 1] : null;
  const currentLabel = KANBAN_PHASES[currentIdx]?.label ?? currentPhase;

  return (
    <div className="mt-4 rounded-lg bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Fase atual
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {prev && (
          <button
            onClick={() => move(prev.key)}
            disabled={loading}
            className="btn-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para {prev.label}
          </button>
        )}

        {next && (
          <button
            onClick={() => move(next.key)}
            disabled={loading}
            className="btn-primary py-2.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Avançar para {next.label}
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setPickerOpen(o => !o)}
            disabled={loading}
            className="btn-secondary"
          >
            Pular para outra fase
            <ChevronDown className="h-3 w-3" />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border bg-white p-1 shadow-lg">
                {KANBAN_PHASES.map(p => {
                  const isCurrent = p.key === currentPhase;
                  return (
                    <button
                      key={p.key}
                      onClick={() => move(p.key)}
                      disabled={isCurrent}
                      className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition ${
                        isCurrent
                          ? 'cursor-default bg-slate-100 font-semibold text-slate-500'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${p.color}`} />
                        {p.label}
                      </span>
                      {isCurrent && <Check className="h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto text-xs text-slate-500">
          {currentLabel}
        </div>
      </div>
    </div>
  );
}
