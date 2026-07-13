import Link from 'next/link';
import {
  Wrench,
  CheckCircle2,
  MessageCircle,
  Boxes,
  ClipboardList,
  Receipt,
  FileText,
  ArrowRight,
  Phone,
  Truck,
  Sparkles,
  Calendar,
  ShieldCheck,
  Disc3,
  ShoppingBag,
  Users,
  Contact,
  LifeBuoy,
  Tv,
  BarChart3,
  Store,
  Radar,
  Settings,
  Zap,
} from 'lucide-react';
import { Logo } from '@/components/Logo';

const MODULOS = [
  {
    categoria: 'Operação da oficina',
    itens: [
      { icon: ClipboardList, t: 'OS + Kanban', d: 'Tempo real, 9 fases configuráveis, do check-in à entrega' },
      { icon: Wrench, t: 'Apontamento do mecânico', d: 'Inicia/pausa pelo celular, requisita peça direto da OS' },
      { icon: FileText, t: 'Preventiva & PM', d: 'Planos por km, tempo ou horas, alerta automático' },
      { icon: Disc3, t: 'Gestão de pneus', d: 'Vida útil, rodízio, sulco e custo por pneu' },
      { icon: ShieldCheck, t: 'Central de garantias', d: 'Peça e serviço com prazo, sem perder prazo de troca' },
      { icon: LifeBuoy, t: 'Socorro 24h', d: 'Acionamento de guincho e atendimento de emergência na estrada' },
    ],
  },
  {
    categoria: 'Comercial & relacionamento',
    itens: [
      { icon: MessageCircle, t: 'WhatsApp nativo', d: 'Orçamento, aprovação item a item, cobrança e NPS' },
      { icon: Store, t: 'Vendas balcão', d: 'PDV rápido para peça avulsa, sem passar por OS' },
      { icon: ShoppingBag, t: 'Marketplace de peças', d: 'Cotação com fornecedores direto pela plataforma' },
      { icon: Calendar, t: 'Agenda inteligente', d: 'Encaixe de horário por box, mecânico e disponibilidade' },
      { icon: Radar, t: 'Radar de recompra', d: 'Alerta de cliente parado, revisão vencida e reativação' },
      { icon: Contact, t: 'Clientes & frotas', d: 'Cadastro único de cliente, veículos e histórico completo' },
    ],
  },
  {
    categoria: 'Gestão & retaguarda',
    itens: [
      { icon: Receipt, t: 'Financeiro', d: 'Contas a pagar/receber, fluxo de caixa e DRE' },
      { icon: FileText, t: 'Fiscal', d: 'NFS-e e NF-e em 1 clique', emBreve: true },
      { icon: Boxes, t: 'Estoque + compras', d: 'Curva ABC, ponto de pedido e compra puxada' },
      { icon: Users, t: 'Equipe', d: 'Produtividade, comissão e permissões por cargo' },
      { icon: BarChart3, t: 'Relatórios & BI', d: 'Indicadores de verdade pra decisão, não só planilha' },
      { icon: Settings, t: 'Admin & permissões', d: 'Controle fino de acesso por usuário e módulo' },
    ],
  },
  {
    categoria: 'Experiência do cliente final',
    itens: [
      { icon: Truck, t: 'Portal da frota', d: 'Cliente acompanha status de cada veículo ao vivo' },
      { icon: Tv, t: 'Painel de TV do pátio', d: 'Kanban em tela grande pra equipe e cliente acompanharem' },
      { icon: Sparkles, t: 'Helper IA', d: 'Assistente contextual em cada tela do sistema' },
    ],
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ============ HEADER ============ */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Logo size="md" href="/" />
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#como-funciona" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              Como funciona
            </a>
            <a href="#modulos" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              Módulos
            </a>
            <a href="#precos" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              Preços
            </a>
            <a href="#faq" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost hidden md:inline-flex">
              Entrar
            </Link>
            <Link href="/signup" className="btn-primary">
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-sky-50 via-white to-amber-50">
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="container relative py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-xs font-medium text-sky-700 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Sistema completo para oficina de linha pesada no Brasil
              </span>
              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Sua oficina de <span className="text-sky-600">caminhões</span> no controle.
                <br />
                Do pátio ao caixa.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-600">
                OS digital, WhatsApp nativo, estoque sem furo, pneus, garantias, frota do cliente e
                financeiro — tudo em um único sistema, no celular do mecânico e no seu.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-600 px-6 text-base font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700"
                >
                  Comece grátis — 30 dias, sem cartão
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/acompanhamento/demo"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Ver demonstração
                </Link>
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Sem cartão de crédito. Cancele quando quiser.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> PWA instalável, funciona offline
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> WhatsApp com número próprio
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Fatura com PIX e cartão pelo WhatsApp
                </span>
              </div>
            </div>

            {/* Mockup do Kanban */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-sky-200/40 to-amber-100/40 blur-2xl" />
              <div className="relative rounded-2xl border bg-white p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Kanban da oficina</span>
                  <span>Hoje, 14:32</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { fase: 'Aguard. Peça', qtd: 3, cor: 'bg-orange-500' },
                    { fase: 'Em Execução', qtd: 4, cor: 'bg-blue-500' },
                    { fase: 'Pronto', qtd: 2, cor: 'bg-green-500' },
                  ].map(c => (
                    <div key={c.fase} className="rounded-lg bg-slate-50 p-2">
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${c.cor}`} />
                        {c.fase}
                      </div>
                      {Array.from({ length: c.qtd }).map((_, i) => (
                        <div
                          key={i}
                          className="mb-1.5 rounded border border-slate-200 bg-white p-2 text-[10px] shadow-sm"
                        >
                          <div className="font-bold text-slate-800">ABC-123{i}</div>
                          <div className="text-slate-500">Scania R450</div>
                          <div className="mt-1 text-slate-700">R$ 2.450,00</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ DORES ============ */}
      <section className="border-b bg-slate-50 py-16">
        <div className="container">
          <h2 className="text-center text-3xl font-bold text-slate-900">
            Você ainda controla sua oficina assim?
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Boxes,
                title: 'Peça que some do estoque',
                desc: 'Compra de emergência, custo alto, e o cliente esperando. Sem rastreio, sem responsabilização.',
              },
              {
                icon: ClipboardList,
                title: 'Serviço feito e não cobrado',
                desc: 'Mecânico executou, mas o consultor esqueceu de orçar. Receita perdida, e você não percebe.',
              },
              {
                icon: ShieldCheck,
                title: 'Garantia perdida no prazo',
                desc: 'Peça com defeito depois do prazo por falta de registro. Prejuízo que poderia ser troca.',
              },
              {
                icon: Phone,
                title: 'Cliente ligando pra saber do caminhão',
                desc: 'Cada hora parada é dinheiro que sai do bolso do cliente. Ele quer resposta, você não tem como dar.',
              },
            ].map((d, i) => (
              <div key={i} className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
                <d.icon className="h-8 w-8 text-red-500" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{d.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ COMO FUNCIONA ============ */}
      <section id="como-funciona" className="py-20">
        <div className="container">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Como funciona em 4 passos
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Da entrada do caminhão à fatura paga, sem planilha paralela.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: '1',
                icon: Truck,
                titulo: 'Check-in pelo celular',
                desc: 'No pátio, em 3 minutos: placa, hodômetro, fotos, checklist e assinatura.',
              },
              {
                n: '2',
                icon: MessageCircle,
                titulo: 'Orçamento no WhatsApp',
                desc: 'Cliente aprova item a item, com trilha de auditoria. Sem "aceito por áudio".',
              },
              {
                n: '3',
                icon: Wrench,
                titulo: 'Execução com apontamento',
                desc: 'Mecânico inicia/pausa pelo celular, requisita peça direto da OS, tira fotos.',
              },
              {
                n: '4',
                icon: Receipt,
                titulo: 'Fatura em 1 clique',
                desc: 'Pagamento PIX/cartão no WhatsApp e pesquisa de NPS no dia seguinte.',
              },
            ].map((p, i) => (
              <div key={i} className="relative rounded-xl border bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="absolute -top-3 -left-3 flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white shadow">
                  {p.n}
                </div>
                <p.icon className="mt-2 h-7 w-7 text-sky-600" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{p.titulo}</h3>
                <p className="mt-2 text-sm text-slate-600">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MODULOS ============ */}
      <section id="modulos" className="border-t bg-slate-50 py-20">
        <div className="container">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-medium text-sky-700">
              <Zap className="h-3.5 w-3.5" />
              18 módulos, um único sistema
            </span>
            <h2 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">
              Tudo que sua oficina precisa
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Nada de sistema pra OS, planilha pra estoque e caderno pra pneu. É tudo aqui.
            </p>
          </div>

          <div className="mt-12 space-y-12">
            {MODULOS.map(grupo => (
              <div key={grupo.categoria}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-sky-600">
                  {grupo.categoria}
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {grupo.itens.map((m, i) => (
                    <div
                      key={i}
                      className="relative rounded-xl border bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md"
                    >
                      {'emBreve' in m && m.emBreve && (
                        <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Em breve
                        </span>
                      )}
                      <m.icon className="h-6 w-6 text-sky-600" />
                      <h4 className="mt-3 font-bold text-slate-900">{m.t}</h4>
                      <p className="mt-1 text-sm text-slate-600">{m.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FROTA ============ */}
      <section className="py-20">
        <div className="container">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="text-sm font-bold uppercase tracking-wider text-sky-600">
                Para quem atende frota
              </span>
              <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
                Um portal com sua marca para o gestor de frota.
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Cliente transportadora enxerga cada veículo, aprova orçamento pelo celular,
                baixa NF, acompanha preventiva e pneus. Sem ligar pra oficina.
              </p>
              <ul className="mt-6 space-y-3 text-slate-700">
                {[
                  'Status em tempo real de cada placa',
                  'Aprovação de orçamento item a item',
                  'Custo por veículo e custo/km automático',
                  'Histórico de preventiva, pneus e garantias por veículo',
                  'Resumo executivo mensal em PDF no WhatsApp',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-gradient-to-br from-sky-50 to-white p-8 shadow-lg">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Portal da Frota
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { placa: 'ABC-1234', modelo: 'Scania R450', status: 'Em Execução', cor: 'bg-blue-500' },
                  { placa: 'DEF-5678', modelo: 'Volvo FH 540', status: 'Aguard. Peça', cor: 'bg-orange-500' },
                  { placa: 'GHI-9012', modelo: 'Mercedes Actros', status: 'Pronto', cor: 'bg-green-500' },
                ].map(v => (
                  <div key={v.placa} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{v.placa}</div>
                        <div className="text-sm text-slate-500">{v.modelo}</div>
                      </div>
                      <span className={`rounded-full ${v.cor} px-3 py-1 text-xs font-semibold text-white`}>
                        {v.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="precos" className="border-t bg-slate-50 py-20">
        <div className="container">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Planos simples, sem surpresa
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              30 dias grátis em qualquer plano. Sem cartão pra começar.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                plano: 'Starter',
                preco: '197',
                destaque: false,
                features: [
                  'Até 3 usuários',
                  '80 OS por mês',
                  'WhatsApp transacional',
                  'Estoque básico',
                  'Agenda e clientes',
                  'Helper IA básico',
                ],
              },
              {
                plano: 'Pro',
                preco: '397',
                destaque: true,
                features: [
                  'Até 10 usuários',
                  '300 OS por mês',
                  'Portal do cliente (frota)',
                  'Contratos e preventiva',
                  'Pneus e garantias',
                  'Fiscal (NFS-e + NF-e) — em breve',
                  'Relatórios avançados',
                  'Helper IA completo',
                ],
              },
              {
                plano: 'Frota',
                preco: '797',
                destaque: false,
                features: [
                  'Usuários ilimitados',
                  'OS ilimitadas',
                  'Multi-almoxarifado',
                  'Marketplace de peças',
                  'Tudo do Pro +',
                  'BI e API',
                  'Suporte prioritário',
                ],
              },
            ].map(p => (
              <div
                key={p.plano}
                className={`relative rounded-2xl border p-8 shadow-sm ${
                  p.destaque ? 'border-sky-500 bg-white ring-2 ring-sky-500' : 'border-slate-200 bg-white'
                }`}
              >
                {p.destaque && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-600 px-3 py-1 text-xs font-bold text-white">
                    Mais escolhido
                  </span>
                )}
                <h3 className="text-lg font-bold text-slate-900">{p.plano}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-sm text-slate-500">R$</span>
                  <span className="text-4xl font-extrabold text-slate-900">{p.preco}</span>
                  <span className="text-sm text-slate-500">/mês</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-8 block rounded-lg px-4 py-3 text-center font-semibold transition ${
                    p.destaque
                      ? 'bg-sky-600 text-white hover:bg-sky-700'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Começar grátis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="py-20">
        <div className="container max-w-3xl">
          <h2 className="text-center text-3xl font-bold text-slate-900">Perguntas frequentes</h2>
          <div className="mt-10 space-y-4">
            {[
              {
                q: 'Preciso de cartão de crédito pra começar?',
                a: 'Não. Você cria sua oficina agora, usa por 30 dias e decide se quer continuar. Pedimos o cartão só no D-23.',
              },
              {
                q: 'Funciona no celular do mecânico?',
                a: 'Sim. O TruckOS é PWA instalável: aparece na tela do celular como app, funciona offline no pátio, sincroniza quando voltar a conexão.',
              },
              {
                q: 'O sistema cobre pneus e garantias, ou preciso de outra ferramenta?',
                a: 'Cobre. Gestão de pneus (vida útil, rodízio, custo) e central de garantias (peça e serviço, com prazo) já vêm no plano Pro, sem precisar de sistema separado.',
              },
              {
                q: 'E se eu cancelar?',
                a: 'Seus dados ficam disponíveis para exportação por 90 dias. Depois disso, removemos conforme LGPD. Não sequestramos seus dados.',
              },
              {
                q: 'Funciona pra oficina de implementos agrícolas?',
                a: 'Sim — caminhões, carretas, ônibus, máquinas agrícolas, implementos. O cadastro de veículo aceita qualquer tipo.',
              },
              {
                q: 'Como funciona o WhatsApp?',
                a: 'Você conecta o número da oficina (QR Code, leva 1 minuto). O TruckOS envia e recebe mensagens por esse número, com caixa de entrada compartilhada pela equipe.',
              },
            ].map((f, i) => (
              <details key={i} className="group rounded-lg border bg-white p-5 shadow-sm">
                <summary className="cursor-pointer text-lg font-semibold text-slate-900 marker:hidden">
                  {f.q}
                </summary>
                <p className="mt-3 text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA FINAL ============ */}
      <section className="bg-slate-900 py-20 text-white">
        <div className="container text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Sua oficina no controle em 30 minutos.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            30 dias grátis, sem cartão. Cancele quando quiser.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-14 items-center gap-2 rounded-lg bg-sky-500 px-8 text-lg font-semibold text-white shadow-lg transition hover:bg-sky-400"
          >
            Começar agora
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t bg-white py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-slate-500 sm:flex-row">
          <div>© 2026 TruckOS. Todos os direitos reservados.</div>
          <div className="flex gap-6">
            <Link href="/privacidade" className="hover:text-slate-700">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-slate-700">
              Termos
            </Link>
            <Link href="/contato" className="hover:text-slate-700">
              Contato
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
