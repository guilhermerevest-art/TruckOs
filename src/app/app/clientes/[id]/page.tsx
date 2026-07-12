import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatBRL, formatPhone } from '@/lib/utils';
import { Phone, Mail, FileText, Truck, Plus, ArrowLeft } from 'lucide-react';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from('customers')
    .select('*, contacts:customer_contacts(*), vehicles(*)')
    .eq('id', id)
    .single();

  if (!customer) notFound();

  // OS recentes desse cliente
  const { data: recentWO } = await supabase
    .from('work_orders')
    .select('id, number, status, created_at, totals, vehicle:vehicles(plate)')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  const totalGasto = (recentWO ?? []).reduce(
    (acc, wo) => acc + ((wo.totals as any)?.total ?? 0),
    0,
  );

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/clientes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                customer.type === 'pj'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {customer.type === 'pj' ? 'PJ' : 'PF'}
            </span>
          </div>
          {customer.trade_name && <div className="text-sm text-slate-500">{customer.trade_name}</div>}
        </div>
        <Link
          href={`/app/os/nova?customer_id=${customer.id}`}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" /> Nova OS
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Esquerda */}
        <div className="space-y-4 lg:col-span-2">
          {/* Info */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">Informacoes</h2>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              {customer.document && (
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-500">Documento</div>
                    <div className="font-medium">{customer.document}</div>
                  </div>
                </div>
              )}
              {customer.email && (
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-500">Email</div>
                    <div className="font-medium">{customer.email}</div>
                  </div>
                </div>
              )}
              {customer.contacts?.[0]?.phone_e164 && (
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-500">WhatsApp</div>
                    <div className="font-medium">{formatPhone(customer.contacts[0].phone_e164)}</div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-slate-500">Prazo de pagamento</div>
                <div className="font-medium">
                  {customer.payment_terms === 0 ? 'A vista' : `${customer.payment_terms} dias`}
                </div>
              </div>
            </div>

            {customer.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1 border-t pt-3">
                {customer.tags.map((t: string) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Veiculos */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">
                Frota ({customer.vehicles?.length ?? 0})
              </h2>
              <Link
                href={`/app/clientes/${customer.id}/veiculo/novo`}
                className="text-sm font-semibold text-sky-600 hover:underline"
              >
                + Adicionar
              </Link>
            </div>
            <div className="space-y-2">
              {customer.vehicles?.map((v: any) => (
                <Link
                  key={v.id}
                  href={`/app/veiculos/${v.id}`}
                  className="flex items-center justify-between rounded-lg border bg-slate-50 p-3 hover:bg-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <Truck className="h-5 w-5 text-slate-500" />
                    <div>
                      <div className="font-bold text-slate-900">{v.plate}</div>
                      <div className="text-xs text-slate-500">
                        {v.brand} {v.model} {v.year} · {v.vehicle_type}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-500">Hodometro</div>
                    <div className="font-semibold">{(v.odometer_km ?? 0).toLocaleString('pt-BR')} km</div>
                  </div>
                </Link>
              ))}
              {!customer.vehicles?.length && (
                <div className="rounded-lg border-2 border-dashed p-6 text-center text-sm text-slate-500">
                  Nenhum veiculo cadastrado
                </div>
              )}
            </div>
          </div>

          {/* Historico de OS */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">Historico de OS</h2>
            <div className="divide-y">
              {recentWO?.map(wo => (
                <Link
                  key={wo.id}
                  href={`/app/os/${wo.id}`}
                  className="flex items-center justify-between py-2.5 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-bold text-slate-900">OS #{wo.number}</div>
                    <div className="text-xs text-slate-500">
                      {(wo.vehicle as any)?.plate} ·{' '}
                      {new Date(wo.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {formatBRL((wo.totals as any)?.total)}
                    </div>
                    <div className="text-xs text-slate-500">{wo.status}</div>
                  </div>
                </Link>
              ))}
              {!recentWO?.length && (
                <div className="py-6 text-center text-sm text-slate-500">Sem OS ainda</div>
              )}
            </div>
          </div>
        </div>

        {/* Direita — resumo */}
        <div>
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Total faturado
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{formatBRL(totalGasto)}</div>
            <div className="mt-1 text-xs text-slate-500">
              Em {recentWO?.length ?? 0} OS
            </div>
          </div>

          <div className="mt-4 rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-bold text-slate-900">Contatos</h3>
            <div className="space-y-2">
              {customer.contacts?.map((ct: any) => (
                <div key={ct.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                  <div className="font-semibold">{ct.name}</div>
                  <div className="text-xs text-slate-500">{ct.role}</div>
                  {ct.phone_e164 && (
                    <div className="mt-1 text-xs">{formatPhone(ct.phone_e164)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}