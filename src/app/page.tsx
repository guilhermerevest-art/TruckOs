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
} from 'lucide-react';
import { Logo } from '@/components/Logo';

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
              Modulos
            </a>
            <a href="#preços" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              Precos
            </a>
            <a href="#faq" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="btn-ghost hidden md:inline-flex"
            >
              Entrar
            </Link>
            <Link href="/signup" className="btn-primary">
              Comecar gratis
            </Link>
          </div>
        </div>
      </header>
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-sky-50 via-white to-slate-50">
        <div className="container py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-xs font-medium text-sky-700 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Feito para oficina de linha pesada no Brasil
              </span>
              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Sua oficina de <span className="text-sky-600">caminhoes</span> no controle.
                <br />
                Do patio ao caixa.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-600">
                OS digital, aprovacao por WhatsApp, estoque sem furo e relatorios de verdade —
                no celular do seu mecanico e no seu. Comece gratis por 30 dias, sem cartao.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-600 px-6 text-base font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700"
                >
                  Comece gratis — 30 dias, sem cartao
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/acompanhamento/demo"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Ver demonstracao
                </Link>
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Sem cartao de credito. Cancele quando quiser.
              </p>
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
                    { fase: 'Aguard. Peca', qtd: 3, cor: 'bg-orange-500' },
                    { fase: 'Em Execucao', qtd: 4, cor: 'bg-blue-500' },
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
            Voce ainda controla sua oficina assim?
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Boxes,
                title: 'Peca que some do estoque',
                desc: 'Compra de emergencia, custo alto, e o cliente esperando. Sem rastreio, sem responsabilizacao.',
              },
              {
                icon: ClipboardList,
                title: 'Servico feito e nao cobrado',
                desc: 'Mecanico executou, mas o consultor esqueceu de orcar. Receita perdida, e voce nao percebe.',
              },
              {
                icon: Phone,
                title: 'Cliente ligando pra saber do caminhao',
                desc: 'Cada hora parada e dinheiro que sai do bolso do cliente. Ele quer resposta, voce nao tem como dar.',
              },
            ].map((d, i) => (
              <div
                key={i}
                className="rounded-xl border border-red-100 bg-white p-6 shadow-sm"
              >
                <d.icon className="h-8 w-8 text-red-500" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{d.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ COMO FUNCIONA ============ */}
      <section className="py-20">
        <div className="container">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Como funciona em 4 passos
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Da entrada do caminhao a fatura paga, sem planilha paralela.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: '1',
                icon: Truck,
                titulo: 'Check-in pelo celular',
                desc: 'No patio, em 3 minutos: placa, hodometro, fotos, checklist e assinatura.',
              },
              {
                n: '2',
                icon: MessageCircle,
                titulo: 'Orcamento no WhatsApp',
                desc: 'Cliente aprova item a item, com trilha de auditoria. Sem "aceito por audio".',
              },
              {
                n: '3',
                icon: Wrench,
                titulo: 'Execucao com apontamento',
                desc: 'Mecanico inicia/pausa pelo celular, requisita peca direto da OS, tira fotos.',
              },
              {
                n: '4',
                icon: Receipt,
                titulo: 'Fatura + NF em 1 clique',
                desc: 'Pagamento PIX/cartao no WhatsApp, NFS-e automatica, NPS no dia seguinte.',
              },
            ].map((p, i) => (
              <div
                key={i}
                className="relative rounded-xl border bg-white p-6 shadow-sm transition hover:shadow-md"
              >
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
      <section className="border-t bg-slate-50 py-20">
        <div className="container">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Tudo que sua oficina precisa
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ClipboardList, t: 'OS + Kanban', d: 'Tempo real, 9 fases configuraveis' },
              { icon: MessageCircle, t: 'WhatsApp nativo', d: 'Aprovacao, NPS, cobranca' },
              { icon: Boxes, t: 'Estoque + Compras', d: 'Curva ABC, compra puxada' },
              { icon: FileText, t: 'Preventiva + Frota', d: 'Planos por km/tempo/horas' },
              { icon: Receipt, t: 'Financeiro', d: 'Receber, pagar, DRE, caixa' },
              { icon: FileText, t: 'Fiscal', d: 'NFS-e e NF-e em 1 clique' },
              { icon: Truck, t: 'Portal da Frota', d: 'Cliente ve status ao vivo' },
              { icon: Sparkles, t: 'Helpers IA', d: 'Assistente em cada tela' },
            ].map((m, i) => (
              <div
                key={i}
                className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-sky-300"
              >
                <m.icon className="h-6 w-6 text-sky-600" />
                <h3 className="mt-3 font-bold text-slate-900">{m.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{m.d}</p>
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
                De um portal com sua marca para o gestor de frota.
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Cliente transportadora enxerga cada veiculo, aprova orcamento pelo celular,
                baixa NF, acompanha preventiva. Sem ligar pra oficina.
              </p>
              <ul className="mt-6 space-y-3 text-slate-700">
                {[
                  'Status em tempo real de cada placa',
                  'Aprovacao de orcamento item a item',
                  'Custo por veiculo e custo/km automatico',
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
                  { placa: 'ABC-1234', modelo: 'Scania R450', status: 'Em Execucao', cor: 'bg-blue-500' },
                  { placa: 'DEF-5678', modelo: 'Volvo FH 540', status: 'Aguard. Peca', cor: 'bg-orange-500' },
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
      <section className="border-t bg-slate-50 py-20">
        <div className="container">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Planos simples, sem surpresa
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              30 dias gratis em qualquer plano. Sem cartao pra comecar.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                plano: 'Starter',
                preco: '197',
                destaque: false,
                features: [
                  'Ate 3 usuarios',
                  '80 OS por mes',
                  'WhatsApp transacional',
                  'Estoque basico',
                  'Helper IA basico',
                ],
              },
              {
                plano: 'Pro',
                preco: '397',
                destaque: true,
                features: [
                  'Ate 10 usuarios',
                  '300 OS por mes',
                  'Portal do cliente (frota)',
                  'Contratos e preventiva',
                  'Fiscal (NFS-e + NF-e)',
                  'Relatorios avancados',
                  'Helper IA completo',
                ],
              },
              {
                plano: 'Frota',
                preco: '797',
                destaque: false,
                features: [
                  'Usuarios ilimitados',
                  'OS ilimitadas',
                  'Multi-almoxarifado',
                  'Tudo do Pro +',
                  'BI e API',
                  'Suporte prioritario',
                ],
              },
            ].map(p => (
              <div
                key={p.plano}
                className={`relative rounded-2xl border p-8 shadow-sm ${
                  p.destaque
                    ? 'border-sky-500 bg-white ring-2 ring-sky-500'
                    : 'border-slate-200 bg-white'
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
                  <span className="text-sm text-slate-500">/mes</span>
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
                  Comecar gratis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="py-20">
        <div className="container max-w-3xl">
          <h2 className="text-center text-3xl font-bold text-slate-900">Perguntas frequentes</h2>
          <div className="mt-10 space-y-4">
            {[
              {
                q: 'Preciso de cartao de credito pra comecar?',
                a: 'Nao. Voce cria sua oficina agora, usa por 30 dias e decide se quer continuar. Pedimos o cartao so no D-23.',
              },
              {
                q: 'Funciona no celular do mecanico?',
                a: 'Sim. O TruckOS e PWA instalavel: aparece na tela do celular como app, funciona offline no patio, sincroniza quando voltar a conexao.',
              },
              {
                q: 'E se eu cancelar?',
                a: 'Seus dados ficam disponiveis para exportacao por 90 dias. Depois disso, removemos conforme LGPD. Nao sequestramos seus dados.',
              },
              {
                q: 'Funciona pra oficina de implementos agricolas?',
                a: 'Sim — caminhoes, carretas, onibus, maquinas agricolas, implementos. O cadastro de veiculo aceita qualquer tipo.',
              },
              {
                q: 'Como funciona o WhatsApp?',
                a: 'Voce conecta o numero da oficina (QR Code, leva 1 minuto). O TruckOS envia e recebe mensagens por esse numero, com caixa de entrada compartilhada pela equipe.',
              },
            ].map((f, i) => (
              <details
                key={i}
                className="group rounded-lg border bg-white p-5 shadow-sm"
              >
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
            30 dias gratis, sem cartao. Cancele quando quiser.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-14 items-center gap-2 rounded-lg bg-sky-500 px-8 text-lg font-semibold text-white shadow-lg transition hover:bg-sky-400"
          >
            Comecar agora
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