# TruckOS

**SaaS completo de gestao para oficinas de caminhoes** — multi-tenant, mobile-first, com WhatsApp nativo (Evolution API), portal de frota e IA contextual em cada tela.

## ✨ Diferenciais

- ✅ **WhatsApp nativo** — aprovacao por link, NPS, cobranca, sem o cliente instalar nada
- ✅ **Mobile-first** — PWA instalavel, funciona offline, feito pro mecanico no patio
- ✅ **Portal da frota** sem login — link publico de acompanhamento da OS em tempo real
- ✅ **Helper IA** em cada tela (Claude Opus 4) — onboarding guiado + assistente contextual
- ✅ **Design system padronizado** — Logo, cores e componentes consistentes

---

## 📦 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 + React 19 + Tailwind 3 + shadcn-style components |
| Backend | Supabase (Postgres + Auth + RLS + Realtime + Storage + Edge Functions) |
| IA | Anthropic Claude (Opus 4.8) |
| WhatsApp | Evolution API (self-hosted) |
| Billing | Stripe (planejado) |
| Logos | SVG custom (caminhao estilizado + gradiente sky/amber) |

---

## 🗂️ Estrutura

```
.
├── MD/
│   └── TruckOS-Especificacao-Completa.md   # Spec original do produto
├── public/
│   ├── logo.svg          # Logo principal 256x256
│   ├── favicon.svg       # Favicon 32x32
│   ├── og-image.svg      # Open Graph 1200x630
│   ├── sw.js             # Service Worker PWA
│   └── manifest.json     # PWA manifest
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Landing page
│   │   ├── login/, signup/                   # Auth
│   │   ├── app/                              # App autenticado
│   │   │   ├── page.tsx                      # Dashboard (visao geral)
│   │   │   ├── os/                           # Kanban OS + detalhe
│   │   │   ├── clientes/                     # CRM clientes + frotas
│   │   │   ├── orcamentos/                   # Orcamentos + envio
│   │   │   ├── estoque/                      # Pecas + alertas
│   │   │   ├── pm/                           # Manutencao preventiva
│   │   │   ├── whatsapp/                     # Caixa de entrada
│   │   │   ├── financeiro/                   # Receber + pagar
│   │   │   ├── relatorios/                   # KPIs + rankings
│   │   │   └── admin/                        # Configuracoes
│   │   ├── acompanhamento/[token]/           # Pagina publica OS (sem login)
│   │   ├── aprovar/[token]/                  # Pagina publica orcamento
│   │   ├── print/os/[id]/                    # Impressao A4 OS
│   │   ├── print/etiqueta/[id]/              # Etiquetas de patio
│   │   └── api/
│   │       ├── signup/                       # Cria tenant + member
│   │       ├── quotes/[id]/send|approve/     # Enviar / aprovar orcamento
│   │       ├── public/quote/approve/         # Aprovacao sem login
│   │       ├── wa/send/                      # Envio WhatsApp
│   │       ├── helper/ask/                   # Helper IA (Claude)
│   │       └── followup/quotes/              # Cron follow-up
│   ├── components/
│   │   ├── Logo.tsx                          # Logo SVG reutilizavel
│   │   ├── SearchPalette.tsx                 # Busca global Ctrl+K
│   │   ├── KanbanFilters.tsx                 # Filtros Kanban
│   │   ├── PhotoCapture.tsx                  # Upload foto da camera
│   │   ├── MobileBottomNav.tsx               # SOS, botoes mobile
│   │   ├── useKeyboardShortcuts.ts           # Atalhos globais
│   │   ├── Helper/Tour.tsx                   # Widget IA
│   │   ├── SWRegister.tsx                    # Service Worker
│   │   └── ui/Toast.tsx                      # Notificacoes
│   └── lib/
│       ├── supabase/{client,server,admin}.ts # Wrappers Supabase
│       ├── ai/helper.ts                      # Claude integration
│       └── utils.ts                          # Formatadores, KANBAN_PHASES
├── supabase/
│   ├── migrations/                           # 15 migrations SQL (1853 linhas)
│   ├── functions/
│   │   ├── stripe-webhook/                   # Billing idempotente
│   │   └── wa-webhook/                       # Evolution inbound
│   └── config.toml
├── scripts/
│   ├── SETUP-COMPLETO.sql                    # Tudo consolidado (rodar no SQL Editor)
│   ├── seed-completo.sql                     # Demo data
│   └── config-backend-remoto.sql             # RLS + Auth Hook + Realtime
└── .env.example
```

---

## 🚀 Setup local (10 minutos)

### 1. Variaveis de ambiente
```bash
cp .env.example .env.local
# Preencha: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
```

### 2. Banco no Supabase
1. Crie projeto em https://supabase.com (regiao Sao Paulo)
2. SQL Editor → cole `scripts/SETUP-COMPLETO.sql` → Run
3. SQL Editor → cole `scripts/config-backend-remoto.sql` → Run
4. SQL Editor → cole `scripts/seed-completo.sql` → Run (opcional, dados demo)
5. **Auth Hook**: Settings → Hooks → Custom Access Token → Enable
   URI: `pg-functions://postgres/public/custom_access_token_hook`

### 3. Aplicacao
```bash
npm install
npm run dev
# http://localhost:3000
```

### 4. Stripe (opcional, F1 funciona sem)
```bash
supabase functions deploy stripe-webhook --no-verify-jwt
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5. WhatsApp (opcional, F1 funciona sem)
```bash
supabase functions deploy wa-webhook --no-verify-jwt
# Configure Evolution API (self-hosted) e preencha EVOLUTION_* no .env
```

---

## 🎨 Design System

### Cores (CSS vars em `globals.css`)
```
--primary: sky-500   #0EA5E9   acao principal, links, CTAs
--accent:  amber-500 #F59E0B   destaque (caminhao, faixas)
--destructive: red-500         erros, SOS
--success:   green-500         confirmacoes
```

### Componentes reutilizaveis
- `<Logo size="sm|md|lg" />` — SVG nativo, nao depende de imagens externas
- `<Button variant="default|outline|ghost|destructive" />`
- `<Card />`, `<CardHeader />`, `<CardTitle />`, `<CardContent />`
- `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`
- `.input-base` — input com focus ring padrao
- `.badge-primary|success|warning|danger|neutral`
- `.phase-chip` — chip de fase do Kanban
- `.empty-state` — estado vazio
- `<ToastProvider />` + `useToast()` — notificacoes globais

### Iconografia (lucide-react)
Truck, Boxes, MessageCircle, ClipboardList, BarChart3, Users, Wrench, Wallet, Settings, etc.

---

## ⚡ Funcionalidades-chave

### Busca global (Ctrl+K ou Cmd+K)
Abre palette, busca OS por numero/issue, clientes por nome/doc, pecas por SKU/descricao. Acessivel de qualquer pagina.

### Atalhos de teclado
- `N` — Nova OS
- `Ctrl/Cmd+K` — Busca global
- `1-9` — Move primeira OS visivel pra fase X (no Kanban)
- `Esc` — Fecha modais

### Pagina publica de acompanhamento
`/acompanhamento/[token]` — sem login, atualiza ao vivo via Supabase Realtime, mostra timeline visual das fases, fotos publicas, previsao de entrega.

### Pagina publica de aprovacao de orcamento
`/aprovar/[token]` — cliente marca item a item, registra IP/user_agent, auditavel juridicamente.

### Impressao de OS
`/print/os/[id]` — A4 com header profissional, totais, garantia, espaco pra assinatura. Botao "Salvar PDF" via dialog do navegador.

### Etiquetas de patio
`/print/etiqueta/[id]` — 12 etiquetas por pagina A4 (ou 1 por folha em termica 80mm), com OS#, placa, cliente, box, fase.

### SOS / Emergencia
Botao flutuante vermelho com ligacao direta pra PM (190), Bombeiros (193), SAMU (192), Disque Denuncia (197).

### PWA Offline
Service Worker (`/sw.js`) cacheia assets estaticos e paginas. Funciona no patio sem sinal.

### Follow-up automatico
`/api/followup/quotes` — agenda follow-up de orcamentos enviados ha mais de 24h. Configure cron (Supabase Edge Function scheduled) ou chame manualmente.

### Helper IA contextual
Widget flutuante em todas as paginas. Contexto automatico (modulo, role, registro). Backend em `/api/helper/ask` → Claude Opus 4 com system prompt TruckOS.

---

## 🔐 Seguranca

- **RLS em 100% das tabelas** — cada query checa `tenant_id in (select current_tenants())`
- **JWT custom claim** — Auth Hook injeta `tenant_id` e `role` no token
- **service_role** — usada so em API routes server-side, nunca no client
- **Storage particionado** — bucket `wo-media` com path `tenant_id/...`
- **SECURITY DEFINER** — funcoes publicas (`public_quote_view`, `public_work_order_status`) expostas so pra `anon`
- **LGPD** — `opt_out` em contatos, retencao audit 5 anos, exportacao sob demanda

---

## 📊 Schema do banco (resumo)

### Tenancy & Auth (5 tabelas)
`tenants`, `tenant_members` (RBAC), `tenant_integrations`, `subscription_events`, `usage_counters`

### CRM (3 tabelas)
`customers`, `customer_contacts`, `vehicles`

### OS nucleo (7 tabelas)
`work_orders`, `wo_status_history`, `wo_sections`, `wo_parts`, `wo_labor_logs`, `wo_media`, `wo_third_party_services`

### Orcamentos (3 tabelas)
`quotes`, `quote_items`, `quote_followups`

### Estoque (6 tabelas)
`parts`, `warehouses`, `stock_balances`, `stock_moves` (com trigger de atualizacao de saldo), `part_requests`, `suppliers`, `purchases`, `purchase_items`

### PM & Contratos (3 tabelas)
`pm_plans`, `contracts`, `contract_usage`

### Financeiro (4 tabelas)
`invoices`, `payables`, `commissions`, `cash_sessions`

### Fiscal (1 tabela)
`fiscal_documents`

### WhatsApp (5 tabelas)
`wa_instances`, `wa_conversations`, `wa_messages`, `campaigns`, `nps_responses`

### Suporte (5 tabelas)
`audit_logs`, `knowledge_base`, `helper_sessions`, `onboarding_progress`, `message_templates`

**Total: 38 tabelas + 11 templates semeados + 5 views + 8 funcoes SECURITY DEFINER/RPC**

---

## 🧪 Roteiro de teste E2E

1. **Signup**: `http://localhost:3000/signup` → cria oficina + member
2. **Seed demo** (opcional): rode `seed-completo.sql` no SQL Editor
3. **Kanban**: `/app/os` → arraste cards entre colunas, atualiza em tempo real
4. **Criar OS**: `/app/os/nova` → 3 passos (placa, defeito, confirmar)
5. **Detalhe OS**: `/app/os/[id]` → ver secoes, pecas, fotos, totais
6. **Orcamento**: `/app/orcamentos/novo?wo_id=...` → adicionar itens
7. **Aprovar pelo cliente**: copiar link `/aprovar/[token]` → abrir em aba anonima
8. **Acompanhar pelo cliente**: copiar link `/acompanhamento/[token]`
9. **Imprimir**: `/print/os/[id]` → Ctrl+P → PDF
10. **Etiqueta patio**: `/print/etiqueta/[id]` → imprimir 12 unidades
11. **Estoque**: cadastrar peca, ver alerta de estoque minimo
12. **PM**: criar plano por km, ver alerta "vencido"
13. **Financeiro**: ver faturas, marcar como paga
14. **WhatsApp**: caixa de entrada (mensagens demo do seed)
15. **Relatorios**: dashboard gestor com KPIs do mes
16. **Helper IA**: clicar no botao "?" e perguntar

---

## 📝 Roadmap (F2+)

- Apontamento de tempo com leitura de codigo de barras
- Requisicao de peca mobile (push notification pro almoxarife)
- Compra com importacao XML NF-e
- Fiscal: NFS-e + NF-e via Focus NFe
- Portal do cliente (gestor de frota)
- Stripe Connect (oficina receber dos clientes finais)
- App nativo React Native (se PWA nao bastar)

---

## 📄 Licenca

Proprietary. (c) 2026 TruckOS.