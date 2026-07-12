import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Send, Check, X, Clock } from 'lucide-react';
import { formatBRL } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-700', icon: Clock },
  sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Send },
  viewed: { label: 'Visualizado', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: Check },
  partial: { label: 'Aprov. Parcial', color: 'bg-amber-100 text-amber-700', icon: Check },
  rejected: { label: 'Recusado', color: 'bg-red-100 text-red-700', icon: X },
  expired: { label: 'Expirado', color: 'bg-slate-100 text-slate-500', icon: Clock },
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('quotes')
    .select(
      'id, status, total, valid_until, sent_at, approved_at, created_at, work_order:work_orders(number, customer:customers(name), vehicle:vehicles(plate))',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data: quotes } = await query;

  // Contadores por status
  const { count: pendingCount } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent');
  const { count: approvedCount } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orcamentos</h1>
          <p className="text-sm text-slate-500">
            {pendingCount ?? 0} aguardando resposta · {approvedCount ?? 0} aprovados
          </p>
        </div>
      </div>

      {/* Filtros por status */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { v: 'all', label: 'Todos' },
          { v: 'sent', label: 'Aguardando' },
          { v: 'approved', label: 'Aprovados' },
          { v: 'rejected', label: 'Recusados' },
          { v: 'draft', label: 'Rascunhos' },
        ].map(f => (
          <Link
            key={f.v}
            href={`/app/orcamentos?status=${f.v}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              (params.status ?? 'all') === f.v
                ? 'bg-sky-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {quotes?.map(q => {
          const meta = STATUS_LABELS[q.status] ?? STATUS_LABELS.draft;
          const Icon = meta.icon;
          const wo = q.work_order as any;
          return (
            <Link
              key={q.id}
              href={`/app/orcamentos/${q.id}`}
              className="block rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-xs uppercase text-slate-500">OS #{wo?.number}</div>
                    <div className="font-bold text-slate-900">{wo?.customer?.name}</div>
                    <div className="text-xs text-slate-500">
                      {wo?.vehicle?.plate} · {new Date(q.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-slate-900">{formatBRL(Number(q.total))}</div>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>
              </div>
              {q.valid_until && (
                <div className="mt-2 text-xs text-slate-500">
                  Valido ate {new Date(q.valid_until).toLocaleDateString('pt-BR')}
                </div>
              )}
            </Link>
          );
        })}

        {!quotes?.length && (
          <div className="rounded-xl border-2 border-dashed bg-white p-12 text-center">
            <div className="text-slate-400">Nenhum orcamento encontrado</div>
            <p className="mt-2 text-sm text-slate-500">
              Crie uma OS primeiro — o orcamento vem dela.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}