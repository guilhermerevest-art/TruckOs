// Pagina publica de acompanhamento (sem login, sem Supabase client)
// Chama funcoes SECURITY DEFINER do banco que retornam dados filtrados
import { createClient } from '@/lib/supabase/client';
import { Clock, CheckCircle2, Truck, MessageCircle } from 'lucide-react';
import { InspecaoPublica } from './InspecaoPublica';

type StatusData = {
  number: number;
  plate: string;
  status: string;
  promised_at: string | null;
  phase_entered_at: string;
  created_at: string;
  customer_name: string;
  vehicle_summary: string;
  brand_color: string;
  tenant_name: string;
};

type TimelineItem = { status: string; at: string };

const PHASES = [
  { key: 'recepcao', label: 'Recepcao' },
  { key: 'diagnostico', label: 'Diagnostico' },
  { key: 'orcamento', label: 'Orcamento' },
  { key: 'aguardando_aprovacao', label: 'Aguard. Aprovacao' },
  { key: 'aguardando_peca', label: 'Aguard. Peca' },
  { key: 'em_execucao', label: 'Em Execucao' },
  { key: 'controle_qualidade', label: 'Qualidade' },
  { key: 'pronto', label: 'Pronto' },
  { key: 'entregue', label: 'Entregue' },
];

export default async function AcompanhamentoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient();

  const { data: status } = await supabase.rpc('public_work_order_status', {
    p_token: token,
  });
  const { data: timeline } = await supabase.rpc('public_work_order_timeline', {
    p_token: token,
  });
  const { data: inspection } = await supabase.rpc('public_work_order_inspection', {
    p_token: token,
  });

  if (!status?.[0]) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Link invalido</h1>
          <p className="mt-2 text-slate-600">
            Este link de acompanhamento nao existe ou expirou.
          </p>
        </div>
      </main>
    );
  }

  const wo = status[0] as StatusData;
  const tl = (timeline ?? []) as TimelineItem[];
  const completedKeys = new Set(tl.map(t => t.status));
  const currentIndex = PHASES.findIndex(p => p.key === wo.status);

  return (
    <main className="min-h-screen bg-slate-50">
      <header
        className="border-b bg-white"
        style={{ borderColor: wo.brand_color }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Truck className="h-6 w-6" style={{ color: wo.brand_color }} />
          <div>
            <div className="font-bold text-slate-900">{wo.tenant_name}</div>
            <div className="text-xs text-slate-500">Acompanhamento da OS #{wo.number}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        {/* Card principal */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Voce</div>
          <div className="text-xl font-bold text-slate-900">{wo.customer_name}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Placa</div>
              <div className="font-bold text-slate-900">{wo.plate}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Veiculo</div>
              <div className="font-semibold text-slate-900">{wo.vehicle_summary}</div>
            </div>
          </div>
          {wo.promised_at && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-slate-700">
                Previsao:{' '}
                <strong>
                  {new Date(wo.promised_at).toLocaleDateString('pt-BR')}
                </strong>
              </span>
            </div>
          )}
        </section>

        {/* Linha do tempo */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Como esta o servico</h2>
          <ol className="mt-4 space-y-3">
            {PHASES.map((phase, idx) => {
              const done = completedKeys.has(phase.key);
              const current = phase.key === wo.status;
              return (
                <li key={phase.key} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? 'bg-green-500 text-white'
                        : current
                        ? 'bg-blue-500 text-white ring-4 ring-blue-100'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {done && !current ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                  </div>
                  <div className="flex-1 pb-1">
                    <div
                      className={`font-semibold ${
                        current ? 'text-blue-600' : done ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {phase.label}
                    </div>
                    {tl.find(t => t.status === phase.key) && (
                      <div className="text-xs text-slate-500">
                        {new Date(
                          tl.find(t => t.status === phase.key)!.at,
                        ).toLocaleString('pt-BR')}
                      </div>
                    )}
                    {current && (
                      <div className="mt-0.5 text-xs font-semibold text-blue-600">
                        FASE ATUAL
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {currentIndex === PHASES.length - 1 && (
            <div className="mt-6 rounded-lg bg-green-50 p-4 text-center text-green-700">
              <CheckCircle2 className="mx-auto h-8 w-8" />
              <div className="mt-2 font-bold">Veiculo entregue!</div>
              <div className="text-sm">Obrigado pela confianca.</div>
            </div>
          )}
        </section>

        {/* Inspecao (DVI) */}
        {!!inspection?.length && <InspecaoPublica token={token} items={inspection} />}

        {/* Acao */}
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
        Atualiza ao vivo · sem precisar recarregar
      </footer>
    </main>
  );
}