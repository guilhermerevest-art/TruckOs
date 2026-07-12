import { createClient } from '@/lib/supabase/server';
import { KANBAN_PHASES } from '@/lib/utils';
import { KanbanBoard } from './KanbanBoard';

export default async function KanbanPage() {
  const supabase = await createClient();
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(
      `
      id, number, status, phase_entered_at, promised_at, priority,
      customer:customers(name),
      vehicle:vehicles(plate, brand, model)
    `,
    )
    .neq('status', 'entregue')
    .order('phase_entered_at', { ascending: true });

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ordens de servico</h1>
          <p className="text-sm text-slate-500">
            Tempo real · arrastar pra mudar fase · Ctrl+K pra buscar · N pra nova OS
          </p>
        </div>
      </div>

      <KanbanBoard initial={workOrders ?? []} />
    </div>
  );
}