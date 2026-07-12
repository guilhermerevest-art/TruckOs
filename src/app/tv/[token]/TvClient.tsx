'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { KANBAN_PHASES } from '@/lib/utils';
import { Truck, PackageSearch, Clock, Wrench } from 'lucide-react';

type WoCard = {
  id: string;
  number: number;
  plate: string;
  customer: string;
  bay: string | null;
  priority: string;
  promised_at: string | null;
  phase_entered_at: string;
  status: string;
};

type PartRequest = {
  id: string;
  description: string;
  wo_number: number;
  qty: number;
  requested_at: string;
  late: boolean;
};

type MechanicRow = {
  mechanic: string;
  wo_number: number;
  section: string;
  started_at: string;
};

export type TvSnapshot = {
  tenant_name: string;
  brand_color: string;
  generated_at: string;
  tv_config: { panels: string[]; rotate_seconds: number };
  work_orders_by_phase: WoCard[];
  part_requests_pending: PartRequest[];
  promised_today: WoCard[];
  mechanic_queue: MechanicRow[];
};

const PANEL_LABELS: Record<string, string> = {
  kanban: 'Ordens de servico',
  pecas: 'Requisicoes de peca',
  prometidos: 'Prometidos para hoje',
  equipe: 'Fila da equipe',
};

export function TvClient({ token, initial }: { token: string; initial: TvSnapshot }) {
  const [snapshot, setSnapshot] = useState<TvSnapshot>(initial);
  const [panelIndex, setPanelIndex] = useState(0);
  const [now, setNow] = useState(new Date());

  const panels = snapshot.tv_config?.panels?.length
    ? snapshot.tv_config.panels
    : ['kanban', 'pecas', 'prometidos'];
  const rotateSeconds = snapshot.tv_config?.rotate_seconds || 20;

  // Atualiza os dados a cada 15s
  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase.rpc('tv_snapshot', { p_token: token });
      if (data) setSnapshot(data as TvSnapshot);
    }, 15000);
    return () => clearInterval(interval);
  }, [token]);

  // Rotaciona o painel visivel
  useEffect(() => {
    const interval = setInterval(() => {
      setPanelIndex(i => (i + 1) % panels.length);
    }, rotateSeconds * 1000);
    return () => clearInterval(interval);
  }, [panels.length, rotateSeconds]);

  // Relogio
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activePanel = panels[panelIndex] ?? 'kanban';

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 px-8 py-5">
        <div className="flex items-center gap-3">
          <Truck className="h-8 w-8" style={{ color: snapshot.brand_color }} />
          <div>
            <div className="text-2xl font-bold">{snapshot.tenant_name}</div>
            <div className="text-sm text-slate-400">Modo Patio</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-sm text-slate-400">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        </div>
      </header>

      <div className="flex gap-2 px-8 pt-4">
        {panels.map((p, i) => (
          <div
            key={p}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i === panelIndex ? 'bg-sky-400' : 'bg-slate-800'
            }`}
          />
        ))}
      </div>

      <div className="p-8">
        {activePanel === 'kanban' && <KanbanPanel items={snapshot.work_orders_by_phase} />}
        {activePanel === 'pecas' && <PartsPanel items={snapshot.part_requests_pending} />}
        {activePanel === 'prometidos' && <PromisedPanel items={snapshot.promised_today} />}
        {activePanel === 'equipe' && <TeamPanel items={snapshot.mechanic_queue} />}
      </div>
    </main>
  );
}

function KanbanPanel({ items }: { items: WoCard[] }) {
  const byPhase = useMemo(() => {
    const map = new Map<string, WoCard[]>();
    for (const phase of KANBAN_PHASES) map.set(phase.key, []);
    for (const wo of items) {
      if (!map.has(wo.status)) map.set(wo.status, []);
      map.get(wo.status)!.push(wo);
    }
    return map;
  }, [items]);

  return (
    <div className="grid grid-cols-9 gap-3">
      {KANBAN_PHASES.filter(p => p.key !== 'entregue').map(phase => {
        const cards = byPhase.get(phase.key) ?? [];
        return (
          <div key={phase.key} className="rounded-xl bg-slate-900 p-3">
            <div className={`mb-2 rounded-lg px-2 py-1 text-center text-xs font-bold ${phase.color} text-white`}>
              {phase.label} ({cards.length})
            </div>
            <div className="space-y-2">
              {cards.slice(0, 6).map(wo => (
                <div key={wo.id} className="rounded-lg bg-slate-800 p-2 text-xs">
                  <div className="font-bold text-sky-300">#{wo.number}</div>
                  <div className="truncate font-semibold">{wo.plate}</div>
                  <div className="truncate text-slate-400">{wo.customer}</div>
                  {wo.priority === 'urgente' && (
                    <div className="mt-1 rounded bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold">
                      URGENTE
                    </div>
                  )}
                </div>
              ))}
              {cards.length > 6 && (
                <div className="text-center text-[10px] text-slate-500">+{cards.length - 6} mais</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PartsPanel({ items }: { items: PartRequest[] }) {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <PackageSearch className="h-7 w-7 text-orange-400" /> Requisicoes de peca pendentes
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl bg-slate-900 p-8 text-center text-xl text-slate-400">
          Nenhuma requisicao pendente 🎉
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {items.map(pr => (
            <div
              key={pr.id}
              className={`rounded-xl p-4 ${pr.late ? 'animate-pulse bg-red-900/60 ring-2 ring-red-500' : 'bg-slate-900'}`}
            >
              <div className="text-sm text-slate-400">OS #{pr.wo_number}</div>
              <div className="text-lg font-bold">{pr.description ?? 'Peca'}</div>
              <div className="text-sm text-slate-400">Qtd: {pr.qty}</div>
              {pr.late && <div className="mt-1 text-sm font-bold text-red-300">ATRASADA</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromisedPanel({ items }: { items: WoCard[] }) {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <Clock className="h-7 w-7 text-amber-400" /> Prometidos para hoje
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl bg-slate-900 p-8 text-center text-xl text-slate-400">
          Nenhuma entrega prometida hoje
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {items.map(wo => (
            <div key={wo.id} className="rounded-xl bg-slate-900 p-4">
              <div className="text-sm text-slate-400">OS #{wo.number}</div>
              <div className="text-lg font-bold">{wo.plate}</div>
              <div className="text-slate-300">{wo.customer}</div>
              <div className="mt-2 text-sm text-amber-300">
                {wo.promised_at &&
                  new Date(wo.promised_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamPanel({ items }: { items: MechanicRow[] }) {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <Wrench className="h-7 w-7 text-cyan-400" /> Fila da equipe
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl bg-slate-900 p-8 text-center text-xl text-slate-400">
          Ninguem apontando tempo agora
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {items.map((m, idx) => (
            <div key={idx} className="rounded-xl bg-slate-900 p-4">
              <div className="text-lg font-bold text-cyan-300">{m.mechanic}</div>
              <div className="text-slate-300">OS #{m.wo_number}</div>
              <div className="truncate text-sm text-slate-400">{m.section}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
