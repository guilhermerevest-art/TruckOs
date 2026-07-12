import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Search, Phone, Mail, FileText } from 'lucide-react';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('customers')
    .select(
      'id, name, trade_name, document, type, email, tags, blocked, created_at, vehicles(id, plate, brand, model)',
    )
    .order('name', { ascending: true })
    .limit(100);

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,trade_name.ilike.%${params.q}%,document.ilike.%${params.q}%`);
  }
  if (params.type && params.type !== 'all') {
    query = query.eq('type', params.type);
  }

  const { data: customers } = await query;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes & Frotas</h1>
          <p className="text-sm text-slate-500">
            {customers?.length ?? 0} cliente{customers?.length === 1 ? '' : 's'} cadastrado
            {customers?.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/app/clientes/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" /> Novo cliente
        </Link>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <form className="flex flex-1 items-center gap-2" action="/app/clientes">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Buscar por nome, fantasia ou documento..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <select
            name="type"
            defaultValue={params.type ?? 'all'}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            <option value="all">Todos</option>
            <option value="pf">Pessoa Física</option>
            <option value="pj">Pessoa Jurídica</option>
          </select>
          <button className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300">
            Buscar
          </button>
        </form>
      </div>

      {/* Lista */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {customers?.map(c => (
          <Link
            key={c.id}
            href={`/app/clientes/${c.id}`}
            className="block rounded-xl border bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-slate-900">{c.name}</div>
                {c.trade_name && (
                  <div className="text-xs text-slate-500">{c.trade_name}</div>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  c.type === 'pj'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {c.type === 'pj' ? 'PJ' : 'PF'}
              </span>
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-600">
              {c.document && (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  {c.document}
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" />
                  {c.email}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <div className="flex gap-1">
                {(c.tags ?? []).slice(0, 2).map((t: string) => (
                  <span
                    key={t}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-xs text-slate-500">
                {(c.vehicles as any[])?.length ?? 0} veículo
                {((c.vehicles as any[])?.length ?? 0) === 1 ? '' : 's'}
              </div>
            </div>

            {c.blocked && (
              <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                Bloqueado
              </div>
            )}
          </Link>
        ))}

        {!customers?.length && (
          <div className="col-span-full rounded-xl border-2 border-dashed bg-white p-12 text-center">
            <div className="text-slate-400">Nenhum cliente encontrado</div>
            <Link
              href="/app/clientes/novo"
              className="mt-4 inline-block text-sm font-semibold text-sky-600 hover:underline"
            >
              + Cadastrar primeiro cliente
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}