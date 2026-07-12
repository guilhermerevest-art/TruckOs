'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KANBAN_PHASES, type KanbanPhaseKey, formatBRL } from '@/lib/utils';
import { Clock, AlertCircle, Truck, Plus, Search, ChevronRight, X } from 'lucide-react';
import { KanbanFilters } from '@/components/KanbanFilters';
import { useToast } from '@/components/ui/Toast';

type WO = {
  id: string;
  number: number;
  status: string;
  phase_entered_at: string;
  promised_at: string | null;
  priority: string;
  customer: { name: string } | null;
  vehicle: { plate: string; brand: string; model: string } | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  urgente: 'border-l-red-500',
  alta: 'border-l-orange-500',
  normal: 'border-l-slate-300',
  baixa: 'border-l-slate-200',
};

export function KanbanBoard({ initial }: { initial: WO[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [items, setItems] = useState<WO[]>(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ priority?: string; customer?: string; search?: string }>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('work_orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setItems(prev => [...prev, payload.new as WO]);
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev =>
              prev.map(it => (it.id === payload.new.id ? { ...it, ...(payload.new as WO) } : it)),
            );
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(it => it.id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Atalho: N = nova OS, / = foca busca, Enter = abre OS selecionada
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (typing) return;

      if (e.key === 'n') {
        e.preventDefault();
        router.push('/app/os/nova');
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if (e.key === 'Enter' && selectedId) {
        e.preventDefault();
        router.push(`/app/os/${selectedId}`);
        return;
      }
      // j/k = navegar entre cards; setas = mesma coisa
      if ((e.key === 'j' || e.key === 'ArrowDown') && filtered.length > 0) {
        e.preventDefault();
        const idx = filtered.findIndex(it => it.id === selectedId);
        const next = filtered[Math.min(idx + 1, filtered.length - 1)];
        setSelectedId(next.id);
        return;
      }
      if ((e.key === 'k' || e.key === 'ArrowUp') && filtered.length > 0) {
        e.preventDefault();
        const idx = filtered.findIndex(it => it.id === selectedId);
        const next = filtered[Math.max(idx - 1, 0)];
        setSelectedId(next.id);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, filter]);

  // Aplica filtros
  const filtered = useMemo(() => items.filter(it => {
    if (filter.priority && it.priority !== filter.priority) return false;
    if (filter.customer && (it as any).customer_id !== filter.customer) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (
        !(it.number && String(it.number).includes(q)) &&
        !(it.customer?.name?.toLowerCase().includes(q)) &&
        !(it.vehicle?.plate?.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  }), [items, filter]);

  function itemsInPhase(phase: KanbanPhaseKey) {
    return filtered.filter(i => i.status === phase);
  }

  // Auto-seleciona primeiro card se nada selecionado
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
    if (selectedId && !filtered.find(it => it.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  async function moveTo(id: string, newStatus: KanbanPhaseKey) {
    const wo = items.find(i => i.id === id);
    if (!wo) return;
    if (wo.status === newStatus) return;
    const oldStatus = wo.status;

    // otimista
    setItems(prev => prev.map(i => (i.id === id ? { ...i, status: newStatus, phase_entered_at: new Date().toISOString() } : i)));

    const { error } = await supabase.rpc('move_work_order', {
      p_work_order_id: id,
      p_new_status: newStatus,
    });

    if (error) {
      setItems(prev => prev.map(i => (i.id === id ? { ...i, status: oldStatus } : i)));
      toast.show({
        type: 'error',
        title: 'Não consegui mover a OS',
        description: error.message,
      });
    } else {
      const phaseLabel = KANBAN_PHASES.find(p => p.key === newStatus)?.label;
      const nextIdx = KANBAN_PHASES.findIndex(p => p.key === newStatus);
      const nextPhase = KANBAN_PHASES[nextIdx + 1];
      toast.show({
        type: 'success',
        title: `OS #${wo.number} → ${phaseLabel}`,
        description: nextPhase ? `Próxima fase: ${nextPhase.label}` : 'Última fase do fluxo.',
      });
    }
  }

  // Avança 1 fase com 1 toque (botão grande na coluna)
  async function advanceFirstInColumn(phase: KanbanPhaseKey) {
    const list = itemsInPhase(phase);
    if (!list.length) return;
    const idx = KANBAN_PHASES.findIndex(p => p.key === phase);
    const next = KANBAN_PHASES[idx + 1];
    if (!next) return;
    await moveTo(list[0].id, next.key);
  }

  function hoursInPhase(enteredAt: string) {
    const hours = (Date.now() - new Date(enteredAt).getTime()) / 1000 / 60 / 60;
    return hours;
  }

  function formatHours(h: number) {
    if (h < 1) return `${Math.round(h * 60)}min`;
    if (h < 24) return `${h.toFixed(1)}h`;
    const d = Math.floor(h / 24);
    const r = Math.round(h % 24);
    return r ? `${d}d ${r}h` : `${d}d`;
  }

  // Total em OS visiveis (sinal de carga de trabalho)
  const totalCards = filtered.length;
  const overdueCount = filtered.filter(it => hoursInPhase(it.phase_entered_at) > 24).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            value={filter.search ?? ''}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            placeholder="Buscar por placa, cliente ou nº da OS (aperte / )"
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <KanbanFilters value={filter} onChange={setFilter} />
        {filter.search && (
          <button
            onClick={() => setFilter(f => ({ ...f, search: '' }))}
            className="btn-ghost text-xs"
          >
            <X className="h-3 w-3" /> Limpar busca
          </button>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span><strong className="text-slate-900">{totalCards}</strong> OS visíveis</span>
          {overdueCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
              {overdueCount} atrasada{overdueCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="hidden md:inline">atalhos: <kbd className="kbd">/</kbd> busca <kbd className="kbd">N</kbd> nova <kbd className="kbd">J</kbd>/<kbd className="kbd">K</kbd> navega</span>
        </div>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto bg-slate-100 p-4 scrollbar-thin">
        {KANBAN_PHASES.map((col, idx) => {
          const list = itemsInPhase(col.key);
          const isLastPhase = idx === KANBAN_PHASES.length - 1;
          return (
            <div
              key={col.key}
              className="flex w-72 flex-shrink-0 flex-col rounded-xl bg-slate-200/50"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveTo(id, col.key);
                setDraggingId(null);
              }}
            >
              <div className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <h3 className="font-semibold text-slate-800">{col.label}</h3>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {list.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 scrollbar-thin">
                {list.map(wo => {
                  const hours = hoursInPhase(wo.phase_entered_at);
                  const overdue = hours > 24;
                  const isSelected = selectedId === wo.id;
                  return (
                    <a
                      key={wo.id}
                      href={`/app/os/${wo.id}`}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', wo.id);
                        setDraggingId(wo.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setSelectedId(wo.id)}
                      className={`block cursor-grab rounded-lg border-l-4 ${PRIORITY_COLORS[wo.priority] ?? 'border-l-slate-300'} border bg-white p-3 shadow-sm transition hover:shadow-md ${
                        draggingId === wo.id ? 'opacity-50' : ''
                      } ${
                        isSelected ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-500">
                            OS #{wo.number}
                          </div>
                          <div className="mt-0.5 truncate text-lg font-bold text-slate-900">
                            {wo.vehicle?.plate ?? 'sem placa'}
                          </div>
                          <div className="truncate text-xs text-slate-600">
                            {wo.vehicle?.brand} {wo.vehicle?.model}
                          </div>
                        </div>
                        {wo.priority === 'urgente' && (
                          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 truncate text-xs text-slate-700">
                        <Truck className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{wo.customer?.name}</span>
                      </div>

                      <div
                        className={`mt-2 flex items-center gap-1 text-xs ${
                          overdue ? 'font-semibold text-red-600' : 'text-slate-500'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {formatHours(hours)} {overdue ? 'atrasada' : 'nesta fase'}
                        {wo.promised_at && (
                          <span className="ml-auto">
                            Prev: {new Date(wo.promised_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </a>
                  );
                })}

                {list.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-2 text-center text-xs text-slate-400">
                    Nenhuma OS por aqui
                  </div>
                )}
              </div>

              {/* Atalho "avançar tudo" da coluna: 1 toque */}
              {list.length > 0 && !isLastPhase && (
                <button
                  onClick={() => advanceFirstInColumn(col.key)}
                  className="mx-2 mb-2 flex items-center justify-center gap-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-sky-50 hover:text-sky-700"
                  title={`Avança a primeira OS de "${col.label}" para a próxima fase`}
                >
                  <ChevronRight className="h-3 w-3" />
                  Avançar 1ª OS
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => router.push('/app/os/nova')}
        className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg transition hover:bg-sky-700"
        aria-label="Nova OS"
        title="Nova OS (N)"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
