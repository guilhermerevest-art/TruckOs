import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Plus,
  Send,
  Package,
  Wrench,
} from 'lucide-react';
import { formatBRL } from '@/lib/utils';

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

function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 1000 / 60 / 60;
}

function formatRelative(iso: string) {
  const h = hoursSince(iso);
  if (h < 1) return `${Math.round(h * 60)}min atrás`;
  if (h < 24) return `${h.toFixed(0)}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const STATUS_LABELS: Record<string, string> = {
  recepcao: 'Recepção',
  diagnostico: 'Diagnóstico',
  orcamento: 'Orçamento',
  aguardando_aprovacao: 'Aguard. Aprovação',
  aguardando_peca: 'Aguard. Peça',
  em_execucao: 'Em Execução',
  controle_qualidade: 'Qualidade',
  pronto: 'Pronto',
  entregue: 'Entregue',
};

export default async function AppHome() {
  const supabase = await createClient();

  // 1. OS agrupadas por fase (limitado pra não poluir)
  const { data: openWO } = await supabase
    .from('work_orders')
    .select(
      'id,number,status,phase_entered_at,promised_at,priority,customer:customers(name),vehicle:vehicles(plate,brand,model)',
    )
    .neq('status', 'entregue')
    .order('priority', { ascending: false })
    .order('phase_entered_at', { ascending: true })
    .limit(80);

  // 2. Orçamentos enviados há > 48h sem resposta
  const { data: lateQuotes } = await supabase
    .from('quotes')
    .select(
      'id,total,status,sent_at,work_order:work_orders(number,customer:customers(name),vehicle:vehicles(plate))',
    )
    .eq('status', 'sent')
    .order('sent_at', { ascending: true })
    .limit(20);

  // 3. Itens abaixo do mínimo
  const { data: lowStock } = await supabase
    .from('parts')
    .select('id, description, sku, min_qty, stock_balances(qty)')
    .eq('active', true)
    .limit(50);

  const lowStockItems = (lowStock ?? [])
    .map(p => {
      const qty = (p.stock_balances as any[])?.[0]?.qty ?? 0;
      return { ...p, qty, low: p.min_qty && qty < p.min_qty };
    })
    .filter(p => p.low)
    .slice(0, 5);

  const items = (openWO ?? []) as unknown as WO[];

  // KPIs resumidos
  const kpis = {
    andamento: items.length,
    aguardandoAprovacao: items.filter(w => w.status === 'aguardando_aprovacao').length,
    aguardandoPeca: items.filter(w => w.status === 'aguardando_peca').length,
    pronto: items.filter(w => w.status === 'pronto').length,
    atrasadas: items.filter(w => hoursSince(w.phase_entered_at) > 24).length,
  };

  // Próximas ações — priorizadas pelo que faz o caixa/faturamento andar
  const nextActions = [
    {
      label: 'Atender clientes aguardando aprovação',
      count: kpis.aguardandoAprovacao,
      href: '/app/orcamentos?status=sent',
      icon: Send,
      tone: 'amber',
      hint: 'Ligar ou mandar mensagem para destravar',
    },
    {
      label: 'Pedir peças que estão em falta',
      count: kpis.aguardandoPeca,
      href: '/app/os?status=aguardando_peca',
      icon: Package,
      tone: 'orange',
      hint: 'OS parada por peça — acelerar reposição',
    },
    {
      label: 'Aguardando qualidade / liberar para entrega',
      count: items.filter(w => w.status === 'controle_qualidade').length,
      href: '/app/os?status=controle_qualidade',
      icon: CheckCircle2,
      tone: 'cyan',
      hint: 'Última checagem antes de avisar o cliente',
    },
    {
      label: 'Prontos para avisar o cliente',
      count: kpis.pronto,
      href: '/app/os?status=pronto',
      icon: CheckCircle2,
      tone: 'green',
      hint: 'Avisar cliente + agendar retirada/entrega',
    },
  ].filter(a => a.count > 0);

  // OS atrasadas (>24h paradas numa fase) — top 5
  const overdue = [...items]
    .filter(w => hoursSince(w.phase_entered_at) > 24)
    .sort((a, b) => hoursSince(b.phase_entered_at) - hoursSince(a.phase_entered_at))
    .slice(0, 5);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Olá, bom dia 👋</h1>
          <p className="text-sm text-slate-500">
            O que precisa da sua atenção agora.
          </p>
        </div>
        <Link href="/app/os/nova" className="btn-primary py-2.5">
          <Plus className="h-4 w-4" /> Nova OS
        </Link>
      </div>

      {/* KPIs resumidos em 1 linha */}
      <div className="mb-6 grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiTile
          label="Em andamento"
          value={kpis.andamento}
          icon={ClipboardList}
          color="text-slate-700"
        />
        <KpiTile
          label="Aguard. aprovação"
          value={kpis.aguardandoAprovacao}
          icon={Clock}
          color="text-amber-600"
        />
        <KpiTile
          label="Aguard. peça"
          value={kpis.aguardandoPeca}
          icon={Package}
          color="text-orange-600"
        />
        <KpiTile
          label="Prontos p/ entrega"
          value={kpis.pronto}
          icon={CheckCircle2}
          color="text-green-600"
        />
        <KpiTile
          label="Atrasadas"
          value={kpis.atrasadas}
          icon={AlertTriangle}
          color="text-red-600"
        />
      </div>

      {/* Próximas ações — o que o funcionário faz hoje */}
      {nextActions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Wrench className="h-5 w-5 text-sky-600" /> O que fazer agora
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {nextActions.map((a, i) => {
              const Icon = a.icon;
              const toneClasses: Record<string, string> = {
                amber: 'border-amber-200 bg-amber-50 text-amber-900',
                orange: 'border-orange-200 bg-orange-50 text-orange-900',
                cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900',
                green: 'border-green-200 bg-green-50 text-green-900',
              };
              return (
                <Link
                  key={i}
                  href={a.href}
                  className="group flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border ${toneClasses[a.tone]}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">
                        {a.count} {a.count === 1 ? 'item' : 'itens'}
                      </div>
                      <div className="font-bold text-slate-900">{a.label}</div>
                      <div className="text-xs text-slate-500">{a.hint}</div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 flex-shrink-0 text-slate-300 group-hover:text-sky-500" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* OS atrasadas — atenção especial */}
        <section className="lg:col-span-2">
          <div className="card-base p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-slate-900">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                OS paradas há mais de 1 dia
              </h2>
              <Link href="/app/os" className="text-xs font-semibold text-sky-600 hover:underline">
                Ver todas →
              </Link>
            </div>

            {overdue.length === 0 ? (
              <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
                🎉 Nenhuma OS atrasada! Continue assim.
              </div>
            ) : (
              <div className="divide-y">
                {overdue.map(wo => {
                  const h = hoursSince(wo.phase_entered_at);
                  const d = Math.floor(h / 24);
                  return (
                    <Link
                      key={wo.id}
                      href={`/app/os/${wo.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">OS #{wo.number}</span>
                          {wo.priority === 'urgente' && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              URGENTE
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-600">
                          {wo.customer?.name} · {wo.vehicle?.plate}
                        </div>
                      </div>
                      <div className="ml-3 text-right">
                        <div className="text-sm font-semibold text-red-600">
                          {d}d {Math.round(h % 24)}h
                        </div>
                        <div className="text-xs text-slate-500">
                          {STATUS_LABELS[wo.status] ?? wo.status}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Orçamentos sem resposta há + tempo */}
          <div className="card-base mt-4 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-slate-900">
                <Send className="h-5 w-5 text-amber-500" />
                Orçamentos enviados (mais antigos primeiro)
              </h2>
              <Link
                href="/app/orcamentos?status=sent"
                className="text-xs font-semibold text-sky-600 hover:underline"
              >
                Ver todos →
              </Link>
            </div>

            {(lateQuotes ?? []).length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
                Sem orçamentos pendentes.
              </div>
            ) : (
              <div className="divide-y">
                {lateQuotes?.slice(0, 5).map(q => {
                  const wo = q.work_order as any;
                  return (
                    <Link
                      key={q.id}
                      href={`/app/orcamentos/${q.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900">
                          OS #{wo?.number} · {wo?.customer?.name}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {wo?.vehicle?.plate} · enviado {q.sent_at ? formatRelative(q.sent_at) : 'recentemente'}
                        </div>
                      </div>
                      <div className="text-right text-sm font-bold text-slate-900">
                        {formatBRL(Number(q.total))}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Direita — atalhos e alertas de estoque */}
        <aside className="space-y-4">
          <div className="card-base p-4">
            <h3 className="mb-3 font-bold text-slate-900">Atalhos rápidos</h3>
            <div className="space-y-2">
              <Link
                href="/app/os/nova"
                className="flex items-center gap-3 rounded-lg bg-sky-50 p-3 transition hover:bg-sky-100"
              >
                <Plus className="h-5 w-5 text-sky-600" />
                <div>
                  <div className="font-semibold text-slate-900">Nova OS</div>
                  <div className="text-xs text-slate-500">Check-in rápido</div>
                </div>
              </Link>
              <Link
                href="/app/clientes/novo"
                className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <Plus className="h-5 w-5 text-slate-600" />
                <div>
                  <div className="font-semibold text-slate-900">Novo cliente</div>
                  <div className="text-xs text-slate-500">PF ou PJ/frota</div>
                </div>
              </Link>
              <Link
                href="/app/os"
                className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <ClipboardList className="h-5 w-5 text-slate-600" />
                <div>
                  <div className="font-semibold text-slate-900">Kanban</div>
                  <div className="text-xs text-slate-500">{kpis.andamento} OS em andamento</div>
                </div>
              </Link>
            </div>
          </div>

          {lowStockItems.length > 0 && (
            <div className="card-base border-orange-200 bg-orange-50/40 p-4">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-orange-900">
                <AlertTriangle className="h-5 w-5" />
                Estoque baixo ({lowStockItems.length})
              </h3>
              <div className="space-y-1.5 text-sm">
                {lowStockItems.map(p => (
                  <Link
                    key={p.id}
                    href={`/app/estoque?q=${encodeURIComponent(p.sku ?? p.description)}`}
                    className="block rounded-md px-2 py-1 hover:bg-orange-100"
                  >
                    <div className="font-semibold text-slate-900">{p.description}</div>
                    <div className="text-xs text-slate-600">
                      {p.qty} un. · mín. {p.min_qty}
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Link
                  href="/app/estoque?low=1"
                  className="text-xs font-semibold text-orange-700 hover:underline"
                >
                  Ver tudo →
                </Link>
                <Link
                  href="/app/compras/nova"
                  className="text-xs font-semibold text-sky-700 hover:underline"
                >
                  Fazer compra →
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="card-base p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
