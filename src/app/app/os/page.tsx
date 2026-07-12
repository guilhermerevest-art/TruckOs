import { createClient } from '@/lib/supabase/server';
import { KANBAN_PHASES } from '@/lib/utils';
import { KanbanBoard } from './KanbanBoard';

export default async function KanbanPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
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

  // Supabase infere relacoes embutidas como array sem tipos gerados do banco;
  // em N:1 (work_order -> customer/vehicle) o retorno em runtime e um objeto unico.
  const workOrders = (rows ?? []).map((r: any) => ({
    ...r,
    customer: Array.isArray(r.customer) ? (r.customer[0] ?? null) : r.customer,
    vehicle: Array.isArray(r.vehicle) ? (r.vehicle[0] ?? null) : r.vehicle,
  }));

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