import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatBRL } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Wallet, AlertCircle, FileArchive, CreditCard } from 'lucide-react';

export default async function FinanceiroPage() {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    { data: invoicesOpen },
    { data: invoicesPaidMonth },
    { data: payablesOpen },
    { data: payablesOverdue },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, amount, due_date, status, customer:customers(name)')
      .in('status', ['aberta', 'parcial', 'vencida'])
      .order('due_date', { ascending: true })
      .limit(20),
    supabase
      .from('invoices')
      .select('amount, paid_at')
      .eq('status', 'paga')
      .gte('paid_at', startOfMonth.toISOString()),
    supabase
      .from('payables')
      .select('id, amount, due_date, status, description')
      .in('status', ['aberta', 'parcial', 'vencida'])
      .order('due_date', { ascending: true })
      .limit(20),
    supabase
      .from('payables')
      .select('amount')
      .eq('status', 'vencida'),
  ]);

  const { data: financingRequests } = await supabase
    .from('financing_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  const totalReceber =
    (invoicesOpen ?? []).reduce((acc, i) => acc + Number(i.amount), 0);
  const totalRecebidoMes = (invoicesPaidMonth ?? []).reduce(
    (acc, i) => acc + Number(i.amount),
    0,
  );
  const totalPagar = (payablesOpen ?? []).reduce((acc, p) => acc + Number(p.amount), 0);
  const totalVencido = (payablesOverdue ?? []).reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-500">Contas a receber, pagar e fluxo de caixa</p>
        </div>
        <Link href="/app/financeiro/exportacao" className="btn-secondary">
          <FileArchive className="h-4 w-4" /> Exportar pro contador
        </Link>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">A receber</span>
            <ArrowDownRight className="h-5 w-5 text-green-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-green-600">{formatBRL(totalReceber)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Recebido no mes</span>
            <Wallet className="h-5 w-5 text-sky-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(totalRecebidoMes)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">A pagar</span>
            <ArrowUpRight className="h-5 w-5 text-red-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600">{formatBRL(totalPagar)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Em atraso</span>
            <AlertCircle className="h-5 w-5 text-orange-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-orange-600">{formatBRL(totalVencido)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* A receber */}
        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Contas a receber</h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoicesOpen?.map(i => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{(i.customer as any)?.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {i.due_date ? new Date(i.due_date).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatBRL(Number(i.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          i.status === 'vencida'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {i.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!invoicesOpen?.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Nenhuma fatura em aberto
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* A pagar */}
        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Contas a pagar</h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Descricao</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payablesOpen?.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{p.description}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(p.due_date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatBRL(Number(p.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.status === 'vencida'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!payablesOpen?.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Nenhuma conta em aberto
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* TruckOS Financia */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
            <CreditCard className="h-5 w-5 text-sky-600" /> TruckOS Financia — solicitações
          </h2>
          <p className="mb-2 text-xs text-amber-700">
            Simulador de parcelamento (pendente de integração com parceiro de crédito regulado) —
            valores abaixo são pedidos de interesse do cliente, ainda não são crédito aprovado.
          </p>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Parcelas</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {financingRequests?.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{f.customer_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatBRL(Number(f.amount))}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {f.installments}x {formatBRL(Number(f.simulated_installment_value))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge badge-neutral">{f.status}</span>
                    </td>
                  </tr>
                ))}
                {!financingRequests?.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Nenhuma solicitação ainda
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}