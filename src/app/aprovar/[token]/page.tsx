// Pagina publica de aprovacao de orcamento (sem login)
import { createClient } from '@/lib/supabase/client';
import { formatBRL } from '@/lib/utils';
import { Check, X, MessageCircle, Truck, Clock } from 'lucide-react';
import { PublicApproveForm } from './PublicApproveForm';

export default async function AprovarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient();

  const { data } = await supabase.rpc('public_quote_view', { p_token: token });

  if (!data?.[0]) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Link invalido ou expirado</h1>
          <p className="mt-2 text-slate-600">Entre em contato com a oficina.</p>
        </div>
      </main>
    );
  }

  const q = data[0];
  const items = (q.items as any[]) ?? [];
  const expired = q.valid_until && new Date(q.valid_until) < new Date();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white" style={{ borderColor: q.brand_color }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Truck className="h-6 w-6" style={{ color: q.brand_color }} />
          <div>
            <div className="font-bold text-slate-900">{q.tenant_name}</div>
            <div className="text-xs text-slate-500">Aprovacao de orcamento · OS #{q.work_order_number}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        {q.status === 'approved' && (
          <div className="rounded-xl bg-green-50 p-4 text-center">
            <Check className="mx-auto h-8 w-8 text-green-600" />
            <div className="mt-2 font-bold text-green-700">Orcamento ja aprovado!</div>
            <div className="text-sm text-green-700">Obrigado pela confianca.</div>
          </div>
        )}

        {q.status === 'rejected' && (
          <div className="rounded-xl bg-red-50 p-4 text-center">
            <X className="mx-auto h-8 w-8 text-red-600" />
            <div className="mt-2 font-bold text-red-700">Orcamento recusado</div>
          </div>
        )}

        {!expired && q.status === 'draft' && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Este orcamento ainda nao foi enviado. Aguarde o envio pela oficina.
          </div>
        )}

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Ola, {q.customer_name}!</h1>
          <p className="mt-1 text-slate-600">
            Segue abaixo o orcamento para seu veiculo. <strong>Marque os itens que deseja aprovar</strong> e envie ao final.
          </p>
          {q.valid_until && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              Valido ate {new Date(q.valid_until).toLocaleDateString('pt-BR')}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-white shadow-sm">
          <PublicApproveForm
            token={token}
            total={q.total}
            items={items}
            disabled={q.status !== 'sent' && q.status !== 'viewed'}
            expired={expired}
          />
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <a
            href="#"
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700"
          >
            <MessageCircle className="h-5 w-5" />
            Falar com a oficina
          </a>
        </section>
      </div>

      <footer className="py-6 text-center text-xs text-slate-400">
        Powered by TruckOS
      </footer>
    </main>
  );
}