# TruckOS — Sistema SaaS de Gestão para Oficinas de Caminhões

**Versão:** 1.0 | **Data:** Julho/2026
**Modelo:** SaaS Multi-tenant | Mobile-first | WhatsApp nativo (Evolution API) | Billing via Stripe (30 dias grátis)

---

## 1. Visão Geral e Posicionamento

### 1.1 O problema
Oficinas de caminhões no Brasil operam majoritariamente com papel, prancheta e WhatsApp pessoal do dono. Os resultados: peças que "somem" do estoque, serviços executados e não cobrados, clientes de frota sem visibilidade do status dos veículos, orçamentos aprovados por áudio sem rastreabilidade, e zero inteligência de negócio para o gestor.

O caminhão parado custa dinheiro ao cliente **por hora** — diferente do carro de passeio, o dono de frota precisa de comunicação em tempo real e previsibilidade. É por isso que os líderes internacionais do setor (Fullbay, Shopmonkey, ShopView) são construídos em torno de **workflow visível + comunicação proativa + faturamento sem vazamento**.

### 1.2 A solução
TruckOS é um sistema completo de gestão para oficinas de veículos pesados (caminhões, carretas, implementos, ônibus, máquinas agrícolas), com três diferenciais centrais:

1. **WhatsApp como canal principal** — aprovação de orçamento, status da OS, laudo com fotos, cobrança e pesquisa de satisfação, tudo via Evolution API, sem o cliente precisar instalar nada.
2. **Mobile-first de verdade** — o mecânico aponta tempo, tira foto e requisita peça pelo celular no pátio; o gestor vê o Kanban da oficina de qualquer lugar; o cliente de frota acompanha seus veículos por um portal responsivo.
3. **Helper contextual por módulo** — cada tela tem um assistente embutido (guia passo a passo + IA) que reduz curva de aprendizado a quase zero, resolvendo a maior objeção do setor: "meu mecânico não vai saber usar".

### 1.3 Personas
| Persona | Papel | Dispositivo principal | O que precisa |
|---|---|---|---|
| **Dono/Gestor da oficina** | Admin do tenant | Celular + desktop | Visão do dia, margem, produtividade, caixa |
| **Consultor/Recepção** | Atendente | Desktop/tablet | Abrir OS rápido, orçar, comunicar cliente |
| **Mecânico (produtivo)** | Técnico | Celular | Ver suas tarefas, apontar tempo, pedir peça, fotografar |
| **Almoxarife** | Estoque | Desktop/celular | Entradas, saídas, compras, inventário |
| **Cliente de frota** | Externo (portal) | Celular | Status dos veículos, histórico, aprovar orçamento, faturas |
| **Motorista** | Externo (check-in) | Celular | Deixar veículo, relatar defeito, receber pronto-aviso |

### 1.4 Benchmarks incorporados
| Referência | O que foi absorvido no TruckOS |
|---|---|
| Fullbay | Portal do cliente de frota, controle de PM (manutenção preventiva), autorização digital de serviços |
| Shopmonkey | Workflow customizável, DVI (inspeção digital com fotos), UX simples |
| ShopView | Visão "o que está em andamento / aguardando peça / pronto para faturar" |
| Orderry | Multi-veículos por cliente, faturamento consolidado ou por veículo, lembretes automáticos |
| Certtus (BR) | Kanban de OS, apontamento de tempo do produtivo, laudo técnico com rastreabilidade de retorno, caminhão + até 3 carretas por OS |
| Oficina.app (BR) | Histórico por placa, envio de PDF via WhatsApp, mobilidade total |
| Padrão "rastreio de encomenda" (e-commerce/logística) | Página pública com linha do tempo ao vivo, sem login — aplicada à OS |
| vhsys (BR) | Checklists digitais anexados à OS, emissão fiscal, DRE gerencial |

---

## 2. Arquitetura e Stack Técnica

### 2.1 Stack recomendada
| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend Web/PWA | **Next.js 15 + React + Tailwind + shadcn/ui** | SSR para landing/SEO, PWA instalável no celular do mecânico |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage + Edge Functions + Realtime) | Multitenancy nativa via RLS, tempo real para o Kanban, storage para fotos |
| WhatsApp | **Evolution API** (self-hosted em VPS) | Instância por tenant, webhooks para mensagens recebidas |
| Billing | **Stripe** (Checkout + Billing + Customer Portal + Webhooks) | Assinatura recorrente, trial de 30 dias, PIX e cartão |
| Filas/Jobs | **Supabase Cron + Edge Functions** (ou Trigger.dev) | Lembretes de PM, follow-up de orçamento, cobranças |
| IA (Helpers) | **Anthropic API (Claude)** | Assistente contextual por módulo + geração de laudos |
| Observabilidade | Sentry + Logflare | Erros e logs por tenant |

### 2.2 Diagrama lógico

```
┌─────────────┐   ┌──────────────┐   ┌───────────────┐
│ Landing Page │   │  App PWA     │   │ Portal Cliente │
│ (Next.js)    │   │ (oficina)    │   │ (frota)        │
└──────┬──────┘   └──────┬───────┘   └───────┬───────┘
       │                 │                    │
       └────────┬────────┴────────────────────┘
                │  Supabase Client (JWT com tenant_id)
        ┌───────▼────────────────────────────┐
        │            SUPABASE                │
        │  Postgres + RLS │ Auth │ Storage   │
        │  Realtime │ Edge Functions │ Cron  │
        └──┬──────────────┬──────────────┬───┘
           │              │              │
   ┌───────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐
   │ Evolution API │ │  Stripe   │ │ Claude API │
   │ (WhatsApp)    │ │ (Billing) │ │ (Helpers)  │
   └───────────────┘ └───────────┘ └────────────┘
```

### 2.3 Estratégia de Multitenancy

**Modelo: banco único, isolamento por Row Level Security (RLS)** — mesmo padrão que você já usa na QuartzRevest, mas endurecido para SaaS:

1. Toda tabela de negócio tem coluna `tenant_id uuid NOT NULL REFERENCES tenants(id)`.
2. O `tenant_id` do usuário vai no **JWT** (custom claim via `auth.hook` do Supabase) — nunca vem do client.
3. Política RLS padrão em TODAS as tabelas:

```sql
CREATE POLICY tenant_isolation ON <tabela>
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

4. **Usuário multi-tenant** (ex.: contador que atende 3 oficinas): tabela `tenant_members` faz o vínculo N:N; ao logar, escolhe o tenant ativo e o claim é reemitido.
5. **Portal do cliente de frota**: o cliente é usuário `role = 'customer'` com política adicional restringindo a `customer_id` próprio.
6. **Storage**: buckets particionados por pasta `tenant_id/...` com política de path no Storage RLS.
7. **Evolution API**: uma instância WhatsApp por tenant (`instance_name = tenant_slug`), credenciais na tabela `tenant_integrations` criptografadas via `pgsodium`.
8. **Limites por plano** enforced no banco (triggers contam OS/mês, usuários ativos, instâncias) + verificação na Edge Function.

### 2.4 Papéis e permissões (RBAC)

| Role | Escopo |
|---|---|
| `owner` | Tudo + billing + configurações do tenant |
| `manager` | Tudo operacional + relatórios gerenciais, sem billing |
| `advisor` | OS, orçamentos, clientes, agenda, comunicação |
| `mechanic` | Suas tarefas, apontamento, requisição de peças, fotos |
| `stock` | Estoque, compras, fornecedores |
| `finance` | Contas a pagar/receber, faturamento, relatórios financeiros |
| `customer` | Portal externo: seus veículos, OS, faturas, aprovações |

---

## 3. Módulos do Sistema

Cada módulo abaixo lista: objetivo, funcionalidades, e o **Helper** específico (assistente embutido).

---

### 3.1 Módulo — Onboarding & Configuração do Tenant

**Objetivo:** oficina operando em menos de 30 minutos após o cadastro.

**Funcionalidades:**
- Wizard de 6 passos: dados da oficina → equipe → serviços padrão (catálogo pré-carregado para linha pesada) → tabela de mão de obra → conexão WhatsApp (QR Code Evolution) → primeiro cliente/OS de teste.
- Catálogo semente: +200 serviços típicos de linha pesada (suspensão, freios, motor, elétrica, embreagem, 5ª roda, carretas) com tempos-padrão editáveis.
- Importação de clientes/peças via planilha (CSV/XLSX) com de-para assistido.
- Configuração de fases do Kanban (padrão: Recepção → Diagnóstico → Orçamento → Aguardando Aprovação → Aguardando Peça → Em Execução → Controle de Qualidade → Pronto → Entregue).
- Personalização: logo, cores, dados fiscais, termos de garantia padrão.

**🤖 Helper do módulo:** "Assistente de Implantação" — acompanha o wizard, responde dúvidas ("como cadastro um mecânico?"), valida dados fiscais (CNPJ via BrasilAPI), e sugere configuração baseada no perfil ("oficina com 4 mecânicos e foco em frota? Ative o portal do cliente e o módulo de contratos").

---

### 3.2 Módulo — Clientes & Frotas (CRM)

**Objetivo:** cadastro único que suporta tanto o caminhoneiro autônomo quanto a transportadora com 80 placas.

**Funcionalidades:**
- Cliente PF/PJ com múltiplos contatos (dono, gestor de frota, motorista) e múltiplos números WhatsApp.
- **Frota:** N veículos vinculados a 1 cliente; visão consolidada da frota (status, última manutenção, próximas PMs).
- Ficha do veículo: placa, chassi (decodificação VIN), marca/modelo/ano, eixos, tipo (cavalo, truck, toco, carreta, bitrem), hodômetro/horímetro, fotos.
- Vínculo cavalo + até 3 carretas por atendimento (rastreabilidade de qual conjunto passou pela oficina).
- Histórico completo por placa: todas as OS, peças aplicadas, valores, mecânicos envolvidos.
- Condições comerciais por cliente: tabela de preço, desconto padrão, prazo de faturamento (à vista, 15, 30, 45 dias), limite de crédito.
- Segmentação e etiquetas (frota, autônomo, agro, inadimplente, VIP).
- Bloqueio automático de novos serviços para inadimplentes (configurável).

**🤖 Helper do módulo:** responde "qual o histórico dessa placa?", "quais clientes estão sem vir há mais de 90 dias?", sugere ações de reativação e redige a mensagem de WhatsApp de reaproximação.

---

### 3.3 Módulo — Recepção & Check-in Digital

**Objetivo:** entrada do veículo documentada em 3 minutos, pelo celular, no pátio.

**Funcionalidades:**
- Check-in mobile: busca por placa (se já existe, puxa tudo), leitura de hodômetro, nível de combustível, relato do defeito (texto ou **áudio transcrito**).
- Checklist de entrada configurável com fotos obrigatórias (avarias, pneus, lataria) — proteção jurídica da oficina.
- Assinatura digital do motorista na tela.
- Geração automática do número de OS e etiqueta/placa de pátio.
- Check-in remoto: motorista escaneia QR Code fixado na entrada da oficina e preenche sozinho o pré-cadastro pelo WhatsApp antes mesmo do atendente chegar.
- Agendamento: agenda por box/elevador/mecânico, com confirmação automática via WhatsApp D-1.

**🤖 Helper do módulo:** guia o atendente novo no primeiro check-in ("agora fotografe os 4 cantos do veículo"), transcreve e estrutura o áudio do defeito relatado em sintomas categorizados.

---

### 3.4 Módulo — Ordens de Serviço (núcleo do sistema)

**Objetivo:** o coração da operação — da abertura à entrega, sem vazamento de peça ou hora.

**Funcionalidades:**
- **Kanban em tempo real** (Supabase Realtime): colunas = fases configuráveis; cartão mostra placa, cliente, mecânico, alerta de atraso, valor.
- OS com múltiplas **seções de serviço** (suspensão, freio, motor, elétrica...) — cada seção com peças + mão de obra + mecânico responsável.
- Diagnóstico estruturado: sintoma → causa → solução (alimenta base de conhecimento do tenant).
- Apontamento de tempo do produtivo: iniciar/pausar/finalizar pelo celular (ou leitura de código de barras no painel do box); compara tempo padrão × tempo real.
- Requisição de peça pelo mecânico direto do celular → notifica almoxarifado → baixa vinculada à OS.
- Peças de terceiros / fornecidas pelo cliente / serviços terceirizados (torno, retífica) com controle próprio.
- Fotos e vídeos por etapa (antes/durante/depois) anexados à seção.
- Controle de qualidade: checklist de saída obrigatório antes da fase "Pronto".
- Garantia: prazo por serviço, certificado em PDF; **OS de retorno** rastreia a OS de origem, peças e mecânicos envolvidos (análise de retrabalho).
- Alertas: OS parada há X horas na mesma fase, orçamento sem resposta há 24h, peça em atraso.

**🤖 Helper do módulo:** sugere diagnóstico com base no histórico do tenant e nos sintomas ("relato de trepidação ao frear em Scania R450: nas últimas 12 OS similares, 9 foram disco empenado"), redige a descrição técnica do serviço para o orçamento, alerta gargalos ("5 OS aguardando a mesma peça — quer agrupar a compra?").

---

### 3.4-B Módulo — Acompanhamento Público da OS (rastreamento em tempo real)

**Objetivo:** matar a ligação "e aí, ficou pronto meu caminhão?". Todo cliente — mesmo o autônomo sem portal de frota — recebe um link único que mostra o status do serviço ao vivo, sem precisar instalar app nem fazer login. É a versão "rastreio de encomenda" aplicada à oficina.

**Funcionalidades:**
- Link de acompanhamento gerado automaticamente na criação de toda OS e enviado por WhatsApp já no `wo_created` (junto com a confirmação de recebimento do veículo).
- Página pública, sem autenticação, protegida por token longo e não-adivinhável (não expõe número sequencial da OS na URL).
- **Linha do tempo visual** das fases (Recepção → Diagnóstico → Orçamento → Aguardando Aprovação → Aguardando Peça → Em Execução → Qualidade → Pronto → Entregue), com a fase atual destacada e horário de entrada em cada etapa concluída.
- Atualização **ao vivo** (Supabase Realtime): o cliente não precisa dar refresh — a barra anda sozinha quando o mecânico muda a fase no Kanban.
- Card de previsão de entrega (`promised_at`), com aviso visual se o prazo está próximo ou passou.
- Fotos selecionadas para exibição pública (o consultor marca quais fotos da OS aparecem — nunca todas automaticamente, evita expor algo sensível ou de mau gosto).
- Quando há orçamento pendente, banner de destaque "Você tem um orçamento aguardando aprovação" com botão direto para `/aprovar/[token]` (reaproveita o módulo 3.5).
- Quando pronto/entregue, mostra resumo do que foi feito (categorias de serviço, sem valores detalhados se o cliente não tiver aprovado por ali) e botão de avaliação (alimenta o NPS).
- Botão "Falar com a oficina" abre WhatsApp direto (wa.me) com o número da conversa já vinculada à OS.
- Compartilhável: o dono da carreta pode mandar o link para o motorista ou para o gestor de frota acompanharem juntos, sem multiplicar contas de usuário.
- Página é a mesma para PWA e navegador comum; mobile-first, pensada para abrir dentro do WebView do WhatsApp.

**Diferença para o Portal do Cliente (3.11):** o portal é para quem tem login (gestor de frota, contas grandes, múltiplos veículos, histórico e faturas). O acompanhamento público é **zero-fricção**, para qualquer cliente, de qualquer porte, sem cadastro — é o que garante que 100% da base tenha visibilidade em tempo real, não só quem tem conta no portal.

**🤖 Helper do módulo:** não há helper de IA na página pública (ela é para o cliente final, não para o usuário do sistema). Do lado da oficina, o helper do módulo de OS (3.4) alerta o consultor quando uma OS está com o link de acompanhamento gerado mas nenhuma foto pública selecionada há mais de X horas — sugerindo aumentar a transparência com o cliente.

---

### 3.5 Módulo — Orçamentos & Aprovação Digital

**Objetivo:** orçar em minutos e aprovar pelo WhatsApp com validade jurídica.

**Funcionalidades:**
- Orçamento a partir do diagnóstico, com peças (preço/margem automáticos) e mão de obra (tempo padrão × valor/hora).
- Múltiplas opções no mesmo orçamento ("resolver agora" vs "resolver o essencial") — aumenta ticket médio.
- Envio por WhatsApp: PDF + resumo + **botões de Aprovar / Aprovar Parcial / Recusar** (aprovação item a item pelo portal, link único e expirável).
- Registro de aprovação: quem, quando, IP, itens aprovados — trilha de auditoria completa.
- Follow-up automático: sem resposta em 24h/48h, mensagem de lembrete configurável.
- Conversão automática: aprovou → itens viram seções da OS, peças são reservadas no estoque.
- Motivos de recusa rastreados (preço, prazo, fez em outro lugar) para inteligência comercial.

**🤖 Helper do módulo:** analisa taxa de conversão do atendente e sugere melhorias, redige justificativas técnicas em linguagem que o cliente entende, alerta margem abaixo do mínimo configurado.

---

### 3.6 Módulo — Estoque, Compras & Fornecedores

**Objetivo:** zero peça perdida, zero compra emergencial cara.

**Funcionalidades:**
- Cadastro de peças: código interno, códigos de fabricante/OEM equivalentes (cross-reference), aplicação por modelo de veículo, localização física (rua/prateleira), foto, código de barras.
- Multi-almoxarifado (matriz, caminhão-oficina móvel).
- Baixa automática vinculada à OS (requisição do mecânico → separação → aplicação).
- Curva ABC, estoque mínimo/máximo com alerta de reposição.
- Cotação de compra a partir da demanda de orçamentos aprovados (compra só o que já está vendido — gestão TOC de estoque, que você conhece bem).
- Pedido de compra → recebimento com conferência → entrada por XML de NF-e (importa itens, custos e atualiza preço médio).
- Devoluções a fornecedor e peças em garantia do fabricante.
- Inventário rotativo pelo celular (contagem por localização com leitura de código de barras).
- Precificação: margem por categoria, atualização de preço de venda automática quando o custo sobe.

**🤖 Helper do módulo:** "quais peças estão paradas há mais de 180 dias?", sugere pedido de compra consolidado com base nas OS em aberto, identifica divergências de inventário e prováveis causas.

---

### 3.7 Módulo — Manutenção Preventiva & Contratos de Frota

**Objetivo:** receita recorrente para a oficina; disponibilidade para a frota.

**Funcionalidades:**
- Planos de PM por veículo: gatilhos por km, horas ou tempo (o que vencer primeiro).
- Atualização de hodômetro: no check-in, pelo portal do cliente ou por mensagem WhatsApp do motorista.
- Alertas automáticos: PM vencendo → WhatsApp para o gestor da frota com botão "Agendar".
- Contratos de manutenção: valor fixo mensal por veículo ou pacote de horas; medição e faturamento automático.
- Checklists de PM padronizados por tipo de veículo (baseados em manual do fabricante, editáveis).
- Relatório de disponibilidade de frota para o cliente (uptime, custo por km).

**🤖 Helper do módulo:** monta o plano de PM sugerido a partir de marca/modelo/aplicação (rodoviário, urbano, fora de estrada), projeta receita recorrente dos contratos.

---

### 3.8 Módulo — Financeiro

**Objetivo:** do orçamento aprovado ao dinheiro no caixa, sem planilha paralela.

**Funcionalidades:**
- Contas a receber: geradas na entrega da OS conforme condição do cliente (à vista, faturado 15/30/45 dias, parcelado).
- Faturamento de frota: consolidado por período (todas as OS do mês em uma fatura) ou por veículo.
- Cobrança via WhatsApp: link de pagamento (PIX/cartão via Stripe ou gateway local), lembrete automático de vencimento, régua de cobrança de inadimplentes.
- Contas a pagar: fornecedores (integrado às compras), despesas fixas, comissões.
- Comissões: por mecânico (sobre mão de obra apontada), por consultor (sobre venda), regras configuráveis.
- Fluxo de caixa realizado e projetado; conciliação bancária (OFX).
- DRE gerencial por centro de resultado (oficina, balcão de peças, contratos).
- Fechamento de caixa diário com conferência.

**🤖 Helper do módulo:** explica o DRE em linguagem simples, aponta os 3 maiores ofensores de margem do mês, redige mensagem de cobrança adequada ao perfil do cliente (firme sem queimar o relacionamento).

---

### 3.9 Módulo — Fiscal (Brasil)

**Objetivo:** OS vira documento fiscal em um clique.

**Funcionalidades:**
- Emissão de **NFS-e** (mão de obra/serviço) e **NF-e** (peças) a partir da mesma OS, com separação automática ISS × ICMS.
- NFC-e para venda balcão de peças.
- Importação de XML de compra (entrada de estoque + escrituração).
- Cadastro tributário por peça (NCM, CEST, CST/CSOSN, origem) com validação assistida.
- Suporte a Simples Nacional, Lucro Presumido e Lucro Real (perfis de tributação por tenant).
- Integração via API de emissores (Focus NFe, PlugNotas ou similar) — abstração para não travar o produto na burocracia municipal de NFS-e.
- Exportação contábil (relatórios + XMLs em lote para o contador).

**🤖 Helper do módulo:** valida NCM/CFOP sugerido por peça, explica por que uma nota foi rejeitada pela SEFAZ e o que corrigir.

---

### 3.10 Módulo — Comunicação & WhatsApp (Evolution API)

**Objetivo:** todo o relacionamento com o cliente em um canal só, auditável, sem depender do celular pessoal de ninguém.

**Funcionalidades:**
- **Caixa de entrada compartilhada**: todas as conversas do número da oficina, com atribuição por atendente, etiquetas e vínculo automático à OS/cliente (identificação por telefone).
- Mensagens automáticas por evento do workflow (ver seção 6.3): check-in confirmado, orçamento enviado, aprovação recebida, peça chegou, veículo pronto, pesquisa de satisfação.
- Templates com variáveis (`{{cliente}}, {{placa}}, {{valor}}, {{link}}`) editáveis por tenant.
- Envio de mídia: PDF de orçamento/laudo/NF, fotos do serviço, vídeo do problema encontrado.
- **Bot de autoatendimento** (opcional por tenant): status da OS por placa, 2ª via de fatura, agendamento — com transbordo para humano.
- Campanhas segmentadas: revisão vencendo, clientes inativos, promoção de peças paradas (com controle anti-spam e opt-out).
- Pesquisa NPS pós-entrega com nota 0-10 direto no WhatsApp.

**🤖 Helper do módulo:** sugere resposta para mensagens recebidas com contexto da OS aberta, resume conversas longas, detecta cliente insatisfeito e alerta o gestor em tempo real.

---

### 3.11 Módulo — Portal do Cliente (Frotas)

**Objetivo:** o gestor de frota enxerga tudo sem ligar para a oficina — argumento de venda matador para contas grandes.

**Funcionalidades:**
- Login próprio (role `customer`), responsivo, com a marca da oficina (white-label básico).
- Dashboard da frota: veículos na oficina agora (com fase e previsão), próximas PMs, pendências de aprovação.
- Aprovação de orçamentos item a item, com histórico de quem aprovou.
- Histórico completo por veículo com custo acumulado, custo/km e comparativo entre veículos.
- Faturas em aberto, 2ª via, comprovantes.
- Solicitação de agendamento/socorro.

**🤖 Helper do módulo:** responde perguntas do gestor de frota ("qual veículo me custou mais este trimestre?") e gera o resumo executivo mensal da frota em PDF.

---

### 3.12 Módulo — Relatórios & BI

**Objetivo:** dois públicos, dois pacotes de relatório.

**Para o GESTOR da oficina:**
| Relatório | Conteúdo |
|---|---|
| Painel do dia | OS por fase, atrasos, faturamento do dia, mecânicos ocupados/ociosos |
| Produtividade | Tempo padrão × real por mecânico, eficiência %, horas vendidas × pagas |
| Vendas | Faturamento por período/seção de serviço/consultor, ticket médio, taxa de conversão de orçamentos, motivos de recusa |
| Estoque | Giro, curva ABC, itens parados, divergências de inventário, margem por categoria |
| Financeiro | DRE, fluxo de caixa, inadimplência, aging de recebíveis, comissões |
| Qualidade | Índice de retorno/retrabalho por mecânico e por tipo de serviço, NPS |
| Clientes | Ranking por faturamento, inativos, LTV, novos × recorrentes |

**Para o CLIENTE (frota):**
| Relatório | Conteúdo |
|---|---|
| Extrato de manutenção | Todas as OS do período, por veículo, com valores |
| Custo por veículo | Custo total, custo/km, peças × mão de obra |
| Disponibilidade | Dias parados por veículo, tempo médio de reparo |
| Preventivas | Cumprimento do plano de PM, próximos vencimentos |
| Resumo executivo mensal | PDF automático enviado por WhatsApp/e-mail no dia configurado |

**Recursos gerais:** filtros salvos, exportação XLSX/PDF, agendamento de envio automático, comparativos mês a mês e ano a ano.

**🤖 Helper do módulo:** o usuário pergunta em linguagem natural ("quanto faturei com freio em maio?") e o helper monta a consulta e responde com gráfico; sugere insights proativos toda segunda-feira ("sua taxa de conversão caiu 8 pontos — 60% das recusas foram por prazo").

---

### 3.13 Módulo — Administração do SaaS (back-office interno)

**Objetivo:** operação do produto pelo time TruckOS (você).

**Funcionalidades:**
- Painel de tenants: status da assinatura, plano, uso (OS/mês, usuários, storage), saúde da instância WhatsApp.
- Métricas SaaS: MRR, churn, trial→pago, LTV/CAC, NPS por tenant.
- Feature flags por plano/tenant; kill-switch de módulos.
- Suporte: impersonar tenant (com log de auditoria), central de tickets.
- Gestão de templates globais (mensagens, checklists, catálogo semente).

---

## 4. Modelo de Dados (Postgres/Supabase)

Convenções: todas as tabelas de negócio possuem `id uuid PK default gen_random_uuid()`, `tenant_id uuid NOT NULL`, `created_at`, `updated_at`, `created_by`. RLS ativa em todas. Abaixo, colunas essenciais (sem repetir as convenções).

### 4.1 Núcleo de tenancy e billing

```sql
-- Tenants (oficinas)
tenants (
  id uuid PK,
  name text, slug text UNIQUE, cnpj text,
  logo_url text, brand_color text,
  address jsonb, tax_regime text,           -- simples | presumido | real
  status text,                               -- trialing | active | past_due | canceled
  trial_ends_at timestamptz,
  stripe_customer_id text, stripe_subscription_id text,
  plan text,                                 -- starter | pro | fleet
  settings jsonb                             -- fases kanban, margens mínimas, etc.
)

tenant_members (
  tenant_id FK, user_id FK auth.users,
  role text,          -- owner|manager|advisor|mechanic|stock|finance
  hourly_cost numeric, commission_rules jsonb,
  active boolean, UNIQUE(tenant_id, user_id)
)

tenant_integrations (
  tenant_id FK, provider text,               -- evolution | stripe | focus_nfe
  credentials jsonb,                         -- criptografado (pgsodium)
  status text, meta jsonb
)

subscription_events (                        -- espelho de webhooks Stripe
  tenant_id FK, stripe_event_id text UNIQUE,
  type text, payload jsonb, processed_at timestamptz
)

usage_counters (                             -- enforcement de limites por plano
  tenant_id FK, period date,                 -- mês de referência
  work_orders_count int, messages_sent int, storage_mb numeric,
  UNIQUE(tenant_id, period)
)
```

### 4.2 Clientes, veículos e frota

```sql
customers (
  id, tenant_id,
  type text,                                 -- pf | pj
  name text, trade_name text, document text, -- CPF/CNPJ
  email text, tags text[],
  price_table_id FK, default_discount numeric,
  payment_terms int,                         -- dias de faturamento (0 = à vista)
  credit_limit numeric, blocked boolean,
  portal_enabled boolean
)

customer_contacts (
  id, tenant_id, customer_id FK,
  name text, role text,                      -- dono | gestor_frota | motorista | financeiro
  phone_e164 text, whatsapp boolean, email text,
  can_approve boolean                        -- pode aprovar orçamento
)

vehicles (
  id, tenant_id, customer_id FK,
  plate text, vin text, brand text, model text, year int,
  vehicle_type text,                         -- cavalo|truck|toco|carreta|bitrem|onibus|maquina
  axles int, odometer_km int, hourmeter numeric,
  odometer_updated_at timestamptz,
  photos jsonb, notes text,
  UNIQUE(tenant_id, plate)
)

vehicle_links (                              -- conjunto cavalo + carretas por atendimento
  id, tenant_id, work_order_id FK,
  tractor_vehicle_id FK, trailer_vehicle_id FK, position int  -- 1..3
)
```

### 4.3 Ordens de serviço

```sql
work_orders (
  id, tenant_id,
  number serial-per-tenant,                  -- via sequence/função por tenant
  customer_id FK, vehicle_id FK,
  status text,                               -- fase atual do kanban
  phase_entered_at timestamptz,              -- para alerta de OS parada
  odometer_km int, fuel_level text,
  reported_issue text, reported_issue_audio_url text,
  checkin_checklist jsonb, checkin_signature_url text,
  advisor_id FK, promised_at timestamptz,
  priority text, bay text,                   -- box/elevador
  totals jsonb,                              -- {parts, labor, third_party, discount, total}
  invoice_id FK NULL, delivered_at timestamptz,
  warranty_terms text, origin_wo_id FK NULL  -- OS de retorno → origem
)

wo_status_history (
  id, tenant_id, work_order_id FK,
  from_status text, to_status text, user_id FK, at timestamptz, note text
)

wo_sections (                                -- seções de serviço na OS
  id, tenant_id, work_order_id FK,
  category text,                             -- suspensao|freios|motor|eletrica|...
  description text, diagnosis jsonb,         -- {sintoma, causa, solucao}
  mechanic_id FK, status text,
  std_hours numeric, labor_rate numeric,
  quality_check jsonb, warranty_months int
)

wo_parts (
  id, tenant_id, work_order_id FK, section_id FK,
  part_id FK NULL,                           -- NULL = peça de terceiro/cliente
  source text,                               -- estoque|terceiro|cliente
  description text, qty numeric,
  unit_cost numeric, unit_price numeric,
  reserved boolean, applied_at timestamptz
)

wo_labor_logs (                              -- apontamento de tempo
  id, tenant_id, work_order_id FK, section_id FK,
  mechanic_id FK, started_at timestamptz, ended_at timestamptz,
  minutes int GENERATED, pause_reason text
)

wo_media (
  id, tenant_id, work_order_id FK, section_id FK NULL,
  kind text,                                 -- foto_entrada|foto_servico|video|laudo|assinatura
  storage_path text, caption text
)

wo_third_party_services (                    -- retífica, torno, borracharia externa
  id, tenant_id, work_order_id FK, section_id FK,
  supplier_id FK, description text, cost numeric, price numeric,
  sent_at timestamptz, returned_at timestamptz
)
```

### 4.4 Orçamentos e aprovações

```sql
quotes (
  id, tenant_id, work_order_id FK,
  version int, status text,                  -- draft|sent|viewed|approved|partial|rejected|expired
  valid_until date, sent_at timestamptz,
  approval_token text UNIQUE,                -- link único do cliente
  approved_by_contact_id FK, approved_at timestamptz,
  approval_meta jsonb,                       -- ip, user_agent, canal (whatsapp|portal)
  rejection_reason text
)

quote_items (
  id, tenant_id, quote_id FK,
  kind text,                                 -- part | labor | third_party
  ref_id uuid,                               -- wo_parts.id ou wo_sections.id
  description text, qty numeric, unit_price numeric,
  option_group text,                         -- "essencial" | "completo"
  status text                                -- pending|approved|rejected
)

quote_followups (
  id, tenant_id, quote_id FK,
  scheduled_at timestamptz, sent_at timestamptz, channel text, template_id FK
)
```

### 4.5 Estoque e compras

```sql
parts (
  id, tenant_id,
  sku text, barcode text, description text,
  oem_codes text[],                          -- cross-reference
  brand text, category text, unit text,
  ncm text, cest text, cst text, origin int, -- fiscal
  min_qty numeric, max_qty numeric,
  avg_cost numeric, sale_price numeric, margin_pct numeric,
  location text,                             -- rua/prateleira
  photo_url text, active boolean,
  UNIQUE(tenant_id, sku)
)

part_applications (part_id FK, brand text, model text, year_from int, year_to int)

warehouses (id, tenant_id, name text, kind text)  -- matriz | movel

stock_balances (
  tenant_id, warehouse_id FK, part_id FK,
  qty numeric, reserved_qty numeric,
  UNIQUE(warehouse_id, part_id)
)

stock_moves (
  id, tenant_id, warehouse_id FK, part_id FK,
  kind text,     -- entrada_nf|saida_os|ajuste|devolucao|transferencia|garantia
  qty numeric, unit_cost numeric,
  work_order_id FK NULL, purchase_id FK NULL,
  user_id FK, note text
)

part_requests (                              -- requisição do mecânico
  id, tenant_id, work_order_id FK, section_id FK,
  part_id FK NULL, description text, qty numeric,
  status text,                               -- pendente|separado|entregue|sem_estoque
  requested_by FK, fulfilled_by FK, fulfilled_at timestamptz
)

suppliers (id, tenant_id, name, cnpj, contacts jsonb, payment_terms, rating)

purchases (
  id, tenant_id, supplier_id FK,
  status text,   -- cotacao|pedido|recebido_parcial|recebido|cancelado
  nfe_key text, xml_url text, freight numeric, total numeric,
  expected_at date, received_at timestamptz
)

purchase_items (
  id, tenant_id, purchase_id FK, part_id FK,
  qty numeric, unit_cost numeric, received_qty numeric,
  demand_quote_item_id FK NULL               -- compra puxada por orçamento aprovado
)

inventory_counts (id, tenant_id, warehouse_id, status, started_at, finished_at)
inventory_count_items (count_id FK, part_id FK, expected_qty, counted_qty, user_id)
```

### 4.6 Manutenção preventiva e contratos

```sql
pm_plans (
  id, tenant_id, vehicle_id FK,
  name text,                                 -- "Revisão 30.000 km"
  interval_km int, interval_days int, interval_hours numeric,
  checklist_template_id FK,
  last_done_km int, last_done_at date,
  next_due_km int, next_due_at date,
  status text                                -- ok|proximo|vencido
)

contracts (
  id, tenant_id, customer_id FK,
  kind text,                                 -- valor_fixo|banco_horas
  monthly_value numeric, included_hours numeric,
  start_date date, end_date date, billing_day int,
  vehicles uuid[], status text
)

contract_usage (contract_id FK, period date, hours_used numeric, wo_ids uuid[])
```

### 4.7 Financeiro e fiscal

```sql
invoices (                                   -- fatura da oficina p/ cliente
  id, tenant_id, customer_id FK,
  kind text,                                 -- os_avulsa|consolidada_frota|contrato
  wo_ids uuid[], amount numeric, discount numeric,
  due_date date, status text,                -- aberta|paga|parcial|vencida|cancelada
  payment_link text, stripe_payment_intent text,
  paid_at timestamptz, paid_amount numeric, method text  -- pix|cartao|boleto|dinheiro
)

receivables (id, tenant_id, invoice_id FK, installment int, due_date, amount, status, paid_at)

payables (
  id, tenant_id, supplier_id FK NULL,
  category text, description text, amount numeric,
  due_date date, status text, paid_at timestamptz,
  purchase_id FK NULL, recurring jsonb
)

commissions (
  id, tenant_id, member_id FK, period date,
  base text,                                 -- mao_de_obra|venda
  amount numeric, details jsonb, status text -- aberta|paga
)

cash_sessions (id, tenant_id, opened_by, opened_at, closed_at, opening_amount, closing_amount, diff)

fiscal_documents (
  id, tenant_id, work_order_id FK NULL, invoice_id FK NULL,
  kind text,                                 -- nfse|nfe|nfce
  provider_ref text, number text, series text,
  status text,                               -- processando|autorizada|rejeitada|cancelada
  rejection_reason text, xml_url text, pdf_url text, issued_at timestamptz
)
```

### 4.8 Comunicação (WhatsApp)

```sql
wa_instances (
  id, tenant_id,
  instance_name text UNIQUE,                 -- slug do tenant na Evolution
  phone_e164 text, status text,              -- connected|disconnected|qr_pending
  webhook_secret text, last_seen_at timestamptz
)

wa_conversations (
  id, tenant_id, contact_phone text,
  customer_id FK NULL, contact_id FK NULL,
  assigned_to FK NULL, status text,          -- aberta|pendente|resolvida
  last_message_at timestamptz, unread int, tags text[]
)

wa_messages (
  id, tenant_id, conversation_id FK,
  direction text,                            -- in | out
  kind text,                                 -- text|image|audio|document|button_reply
  body text, media_url text,
  evolution_message_id text, status text,    -- sent|delivered|read|failed
  work_order_id FK NULL, quote_id FK NULL,   -- vínculo de contexto
  sent_by FK NULL, is_automated boolean
)

message_templates (
  id, tenant_id NULL,                        -- NULL = template global do sistema
  event text,        -- checkin|quote_sent|quote_reminder|approved|part_arrived|ready|nps|billing_due
  channel text, body text,                   -- com {{variaveis}}
  active boolean, delay_minutes int
)

campaigns (
  id, tenant_id, name text, segment_filter jsonb,
  template_id FK, scheduled_at timestamptz,
  status text, stats jsonb                   -- enviadas, lidas, respondidas, optout
)

nps_responses (id, tenant_id, work_order_id FK, customer_id FK, score int, comment text)
```

### 4.9 Helpers e auditoria

```sql
helper_sessions (
  id, tenant_id, user_id FK,
  module text,                               -- os|estoque|financeiro|...
  messages jsonb,                            -- histórico da conversa com o helper
  context jsonb                              -- tela, registro aberto, filtros
)

helper_feedback (session_id FK, helpful boolean, comment text)

onboarding_progress (
  tenant_id, user_id FK, module text,
  steps_completed text[], tour_dismissed boolean
)

audit_logs (
  id, tenant_id, user_id FK,
  action text, entity text, entity_id uuid,
  before jsonb, after jsonb, ip text, at timestamptz
)

knowledge_base (                             -- diagnósticos aprendidos por tenant
  id, tenant_id, vehicle_brand text, vehicle_model text,
  symptom text, cause text, solution text,
  source_wo_id FK, occurrences int
)
```

---

## 5. Processos-Chave (fluxos operacionais)

### 5.1 Fluxo master da OS (o processo espinha dorsal)

```
1. CHECK-IN (mobile, no pátio)
   Motorista chega → busca placa → hodômetro + fotos + checklist
   → relato do defeito (áudio transcrito) → assinatura
   → OS criada na fase "Recepção"
   → WhatsApp automático ao cliente: "Recebemos o veículo ABC-1234, OS #1042"

2. DIAGNÓSTICO
   Mecânico designado → inspeciona → registra sintoma/causa/solução por seção
   → fotos/vídeos do problema → requisita peças p/ cotação

3. ORÇAMENTO
   Consultor monta orçamento (peças + MO + terceiros)
   → Helper valida margem → envia por WhatsApp (PDF + link de aprovação)
   → fase "Aguardando Aprovação"

4. APROVAÇÃO (cliente, pelo celular)
   Cliente abre link → aprova total/parcial item a item
   → registro auditável → peças aprovadas são RESERVADAS no estoque
   → sem estoque? gera demanda de compra automaticamente
   → fase "Aguardando Peça" ou "Em Execução"

5. EXECUÇÃO
   Mecânico vê tarefa no celular → inicia apontamento de tempo
   → retira peça (requisição → baixa vinculada) → fotos do serviço
   → finaliza seção → tempo real × padrão gravado

6. QUALIDADE
   Checklist de saída obrigatório → aprovado → fase "Pronto"
   → WhatsApp automático: "Seu veículo está pronto! Valor: R$ X. Pague por aqui: {link}"

7. ENTREGA & FATURAMENTO
   Pagamento à vista (PIX/cartão) OU fatura no prazo do cliente
   → emissão NFS-e + NF-e → certificado de garantia em PDF
   → baixa da OS → WhatsApp: NF + garantia + pesquisa NPS (D+1)

8. PÓS-VENDA (automático)
   D+1: NPS │ D+30: "como está o veículo?" │ PM: alertas por km/tempo
```

### 5.2 Fluxo de compra puxada (TOC)

```
Orçamento aprovado com peça sem estoque
→ demanda entra na fila de compras (agrupada por fornecedor)
→ cotação → pedido → recebimento (XML NF-e importado)
→ peça recebida → vínculo automático à OS que a esperava
→ notificação ao mecânico + WhatsApp ao cliente ("peça chegou, iniciando serviço")
→ fase da OS muda sozinha de "Aguardando Peça" → "Em Execução"
```

### 5.3 Fluxo de faturamento de frota

```
Dia de fechamento do cliente (ex.: todo dia 25)
→ job noturno agrupa OS entregues no período
→ gera fatura consolidada + relatório de extrato por veículo
→ envia por WhatsApp/e-mail ao contato financeiro
→ D-3 do vencimento: lembrete │ D+1 vencida: régua de cobrança
→ pagamento identificado → baixa automática
```

### 5.4 Fluxo de retorno/garantia (qualidade)

```
Veículo retorna com reclamação
→ atendente abre "OS de Retorno" apontando a OS de origem
→ sistema exibe: serviços feitos, peças aplicadas, mecânicos, tempos
→ análise: falha de peça (aciona garantia do fornecedor) ou de execução
→ indicador de retrabalho alimenta relatório de qualidade por mecânico
```

---

## 6. Integração WhatsApp — Evolution API (detalhamento técnico)

### 6.1 Provisionamento por tenant
1. No onboarding, tenant clica "Conectar WhatsApp".
2. Edge Function chama `POST /instance/create` na Evolution API com `instanceName = tenant_slug`, define webhook `https://<projeto>.supabase.co/functions/v1/wa-webhook?tenant=<id>` com secret próprio.
3. Front exibe o QR Code (`GET /instance/connect/{instance}`) via polling/websocket até `state = open`.
4. Status persistido em `wa_instances`; monitor de saúde (cron 5 min) alerta o tenant se a instância cair.

### 6.2 Envio (Edge Function `wa-send`)
- Fila de saída em tabela `wa_outbox` com retry exponencial e rate-limit por instância (evita ban).
- Tipos: `sendText`, `sendMedia` (PDF orçamento/NF/laudo), `sendButtons`/lista (aprovação, agendamento).
- Toda mensagem gravada em `wa_messages` com vínculo a OS/quote quando houver.

### 6.3 Recebimento (webhook)
- Evolution → Edge Function `wa-webhook`: valida secret → identifica tenant → normaliza payload.
- Match do telefone com `customer_contacts` → abre/atualiza `wa_conversations`.
- Regras: resposta a botão de aprovação → atualiza quote; texto livre com OS aberta → notifica atendente responsável; opt-out ("PARAR") → flag no contato.
- Bot de autoatendimento (opcional): intents simples (status por placa, 2ª via, agendar) com transbordo humano.

### 6.4 Eventos automáticos (templates padrão)
| Evento gatilho | Mensagem (resumo) | Timing |
|---|---|---|
| OS criada | "Recebemos seu veículo {{placa}}... Acompanhe ao vivo: {{link_acompanhamento}}" | Imediato |
| Orçamento enviado | PDF + link de aprovação | Imediato |
| Orçamento sem resposta | Lembrete | 24h / 48h |
| Aprovado | Confirmação + previsão | Imediato |
| Peça chegou | "Peça chegou, serviço iniciando" | Imediato |
| Veículo pronto | "Pronto! Total R$ {{valor}} {{link_pgto}}" | Imediato |
| Entregue | NF + certificado de garantia | Imediato |
| NPS | "De 0 a 10..." | D+1 |
| PM vencendo | "Revisão dos {{km}} km próxima. Agendar?" | Configurável |
| Fatura vencendo | Lembrete + link | D-3 |
| Cliente inativo | Campanha de reativação | 90 dias |

### 6.5 Boas práticas anti-bloqueio
- Warm-up de número novo (volume crescente).
- Janela de envio configurável (ex.: 8h–19h), jitter entre mensagens.
- Opt-out honrado globalmente; campanhas com limite diário.
- Mensagens transacionais sempre vinculadas a relacionamento real (cliente com OS).

---

## 7. Billing — Stripe com 30 dias grátis

### 7.1 Planos (sugestão inicial)
| | **Starter** | **Pro** | **Frota** |
|---|---|---|---|
| Preço/mês | R$ 197 | R$ 397 | R$ 797 |
| Usuários | 3 | 10 | Ilimitado |
| OS/mês | 80 | 300 | Ilimitado |
| WhatsApp (Evolution) | ✔ | ✔ | ✔ |
| Portal do cliente | — | ✔ | ✔ |
| Contratos & PM | — | ✔ | ✔ |
| Fiscal (NFS-e/NF-e) | Add-on | ✔ | ✔ |
| Multi-almoxarifado | — | — | ✔ |
| Relatórios avançados + BI | — | ✔ | ✔ + API |
| Helpers IA | Básico | Completo | Completo |

Anual com 2 meses grátis. Add-ons: instância WhatsApp extra, armazenamento, emissões fiscais em volume.

### 7.2 Fluxo de assinatura
1. Cadastro na landing → cria tenant com `status = trialing`, `trial_ends_at = now() + 30 dias`. **Sem cartão** para começar (maximiza conversão de topo; cartão é pedido no D-23 com incentivo).
2. Stripe Checkout (quando assinar): `subscription_data.trial_end` alinhado ao trial restante — sem cobrança dupla.
3. Webhooks tratados (Edge Function `stripe-webhook`, idempotente via `subscription_events`):
   - `checkout.session.completed` → grava customer/subscription no tenant
   - `invoice.paid` → `status = active`
   - `invoice.payment_failed` → `status = past_due` + régua de e-mail/WhatsApp
   - `customer.subscription.deleted` → `status = canceled`
4. **Enforcement**: middleware verifica status do tenant; `trialing` expirado ou `canceled` → modo somente-leitura (dados preservados 90 dias, exportáveis) — nunca sequestre os dados do cliente, isso mata reputação.
5. Customer Portal do Stripe para trocar plano/cartão/cancelar (menos suporte para você).
6. Réguas de trial automatizadas: D+1 boas-vindas, D+7 check de ativação (criou 1ª OS?), D+23 oferta de conversão, D+29 último aviso, D+35 win-back.

### 7.3 Pagamentos dos clientes DA oficina (Stripe Connect — fase 2)
- Oficina conecta conta Stripe (Connect Standard) → links de pagamento PIX/cartão nas faturas → conciliação automática. Alternativa nacional (Asaas/Pagar.me) como fallback para boleto.

---

## 8. Sistema de Helpers (assistente por módulo)

### 8.1 Arquitetura
- Botão flutuante "?" em toda tela + atalho de teclado; abre painel lateral.
- Contexto injetado automaticamente: módulo atual, registro aberto (ex.: OS #1042), papel do usuário, plano do tenant.
- Backend: Edge Function → Claude API com **tool use** (consultas read-only pré-aprovadas por módulo: "buscar histórico da placa", "listar peças paradas"). Nunca executa escrita sem confirmação explícita do usuário na UI.
- Base de conhecimento: docs do produto (RAG) + `knowledge_base` do tenant (diagnósticos aprendidos).

### 8.2 Três camadas por módulo
1. **Tour guiado** (primeiro acesso): passos interativos destacando elementos da tela; progresso em `onboarding_progress`.
2. **Ajuda contextual**: "o que faço agora?" — o helper olha o estado do registro e orienta ("esta OS está sem mecânico designado; toque aqui").
3. **Assistente IA**: perguntas em linguagem natural, geração de textos (mensagens, laudos, descrições técnicas), análises rápidas.

### 8.3 Guardrails
- Helper NUNCA vê dados de outro tenant (as tools herdam o RLS do usuário logado).
- Respostas financeiras/fiscais com disclaimer e link para a doc.
- Feedback 👍/👎 por resposta alimenta melhoria dos prompts.

---

## 9. Landing Page (especificação)

**Objetivo:** converter dono de oficina de caminhões em trial de 30 dias. Tom direto, sem tecnicês, com prova social do setor.

### 9.1 Estrutura (ordem das seções)
1. **Hero**: headline "Sua oficina de caminhões no controle. Do pátio ao caixa." Sub: "OS digital, aprovação por WhatsApp, estoque sem furo e relatórios de verdade — no celular do seu mecânico e no seu." CTA primário: **"Comece grátis — 30 dias, sem cartão"**. Mockup do Kanban no desktop + check-in no celular.
2. **Barra de dor** (3 itens): "Peça que some do estoque" / "Serviço feito e não cobrado" / "Cliente ligando pra saber do caminhão".
3. **Como funciona em 4 passos**: Check-in pelo celular → Orçamento aprovado no WhatsApp → Execução com apontamento → Fatura e NF em 1 clique. (GIFs curtos de tela real.)
4. **Módulos** (cards): OS/Kanban, WhatsApp, Estoque, Preventiva/Frota, Financeiro, Fiscal, Portal do Cliente, Relatórios.
5. **Seção frota** (segmento premium): "Atende transportadora? Dê a ela um portal com o status de cada placa." — diferencial competitivo.
6. **Prova social**: depoimentos com foto/oficina/cidade, números ("+X OS geridas", "Y oficinas").
7. **Pricing** com toggle mensal/anual e comparativo dos 3 planos; FAQ de objeções (preciso de cartão? meus dados? funciona no celular? e se eu cancelar?).
8. **Helper na LP**: chat com o mesmo motor IA para tirar dúvidas pré-venda ("funciona pra oficina de implementos agrícolas?").
9. **CTA final** + rodapé (LGPD, termos, contato WhatsApp comercial).

### 9.2 Técnica
- Next.js SSG, Core Web Vitals verdes, schema.org SoftwareApplication.
- SEO alvo: "sistema para oficina de caminhões", "ordem de serviço oficina diesel", "software oficina mecânica pesada", "sistema oficina com WhatsApp".
- Pixel Meta + Google Ads + eventos de conversão (signup, ativação D7).
- Página de captura secundária: calculadora "quanto sua oficina perde por mês sem controle de estoque?" (lead magnet).

---

## 10. Segurança & LGPD

- RLS em 100% das tabelas + testes automatizados de isolamento (suite que tenta vazar dados entre 2 tenants de teste a cada deploy).
- Criptografia de credenciais (pgsodium), TLS em tudo, backups diários com PITR.
- LGPD: consentimento de comunicação (opt-in/opt-out por contato), DPO indicado, exportação e exclusão de dados sob demanda, logs de auditoria (`audit_logs`) com retenção 5 anos.
- Rate limit por IP e por tenant nas Edge Functions; 2FA opcional para roles `owner`/`finance`.

---

## 11. Roadmap de Implementação

| Fase | Duração | Entregas |
|---|---|---|
| **MVP (F1)** | 8–10 sem | Tenancy+Auth+RBAC, Clientes/Veículos, Check-in, OS+Kanban, Orçamento com aprovação por link, Estoque básico (baixa por OS), WhatsApp transacional (Evolution), Billing Stripe+trial, Landing, Helper tour+FAQ |
| **F2** | +6 sem | Apontamento de tempo, requisição de peça mobile, compras+XML, financeiro (receber/pagar/caixa), relatórios gestor v1, helper IA completo |
| **F3** | +6 sem | Fiscal (NFS-e/NF-e), portal do cliente, PM+contratos, faturamento de frota, relatórios do cliente, NPS, campanhas |
| **F4** | +6 sem | Stripe Connect (pgto dos clientes da oficina), BI avançado, bot de autoatendimento, inventário por código de barras, API pública, app móvel dedicado (React Native, se PWA não bastar) |

**Métrica-norte do produto:** % de oficinas que criam ≥5 OS na primeira semana (ativação). Meta trial→pago: ≥25%.

---

## 12. Diferenciais competitivos (resumo executivo)

1. **WhatsApp nativo e profundo** — concorrentes BR enviam PDF; TruckOS fecha o ciclo: aprovação com botões, cobrança, NPS e caixa de entrada compartilhada.
2. **Portal de frota** — praticamente inexistente nos players nacionais de pequeno porte; é o que destrava contas de transportadoras.
3. **Helper em cada módulo** — ataca a objeção nº 1 do setor (medo da equipe não usar) e reduz custo de suporte do SaaS.
4. **Compra puxada por orçamento aprovado** — gestão de estoque estilo TOC, capital de giro mínimo.
5. **Mobile-first real** — mecânico opera 100% pelo celular; concorrentes tratam mobile como visualização.
6. **Rastreabilidade de retrabalho** — OS de retorno vinculada à origem, indicador de qualidade por mecânico (raro no mercado).
7. **Rastreamento público em tempo real** — todo cliente, mesmo sem login, acompanha a linha do tempo da OS ao vivo pelo link do WhatsApp; zero ligação para "saber se ficou pronto".
