# TruckOS — Funcionalidades e Telas de Alto Valor

**Companion de:** TruckOS-Especificacao-Completa.md e TruckOS-Implementacao-Fase1.md
**Propósito:** catálogo de funcionalidades além do escopo base que geram valor desproporcional — retenção, ticket médio, diferenciação e novas linhas de receita. Cada item traz: o que é, por que vale dinheiro, a tela, e classificação de esforço × impacto.

**Legenda:** 💰 = gera receita direta | 🔒 = aumenta retenção/lock-in | 🎯 = diferenciação competitiva | ⚡ = eficiência operacional do cliente

---

## ÍNDICE POR PRIORIDADE ESTRATÉGICA

| # | Funcionalidade | Impacto | Esforço | Quando |
|---|---|---|---|---|
| 1 | Orçamento por foto (IA) | 🎯💰 Altíssimo | Médio | F2 |
| 2 | Agente IA no WhatsApp da oficina | 🎯🔒 Altíssimo | Médio | F2-F3 |
| 3 | Score de Saúde do Veículo | 🔒🎯 Alto | Baixo | F2 |
| 4 | Radar de Recompra (manutenção preditiva por histórico) | 💰🔒 Altíssimo | Médio | F3 |
| 5 | Gestão de Pneus | 💰🎯 Alto | Médio | F3 |
| 6 | Modo Pátio (TV da oficina) | ⚡🔒 Alto | Baixo | F2 |
| 7 | Gamificação de produtivos | ⚡🔒 Alto | Baixo | F3 |
| 8 | Benchmark anônimo entre oficinas | 🔒🎯 Altíssimo | Médio | F4 |
| 9 | Central de Garantias de Fabricante | 💰⚡ Alto | Médio | F3 |
| 10 | Agenda Inteligente com capacidade | ⚡💰 Alto | Médio | F3 |
| 11 | Orçamentista de balcão (peças) | 💰 Médio-Alto | Baixo | F2 |
| 12 | Socorro & Oficina Móvel | 💰🎯 Alto | Médio | F4 |
| 13 | Multi-unidade / franquia | 💰🔒 Alto (contas grandes) | Alto | F4 |
| 14 | Marketplace de peças entre oficinas | 💰🎯 Transformacional | Alto | F5 |
| 15 | TruckOS Financia (BNPL de reparo) | 💰 Transformacional | Alto (parceria) | F5 |

---

## BLOCO A — IA aplicada ao dia a dia da oficina

### A1. Orçamento por Foto 📸 → 📋

**O que é:** o consultor (ou o mecânico) fotografa o componente danificado — lona de freio gasta, cruzeta folgada, vazamento no cubo — e a IA identifica o componente, sugere o diagnóstico provável, puxa as peças compatíveis do estoque (via aplicação por modelo) e monta o rascunho do orçamento com tempo padrão do catálogo.

**Por que vale muito:** o gargalo nº 1 de faturamento de oficina é orçamento parado. Reduzir o ciclo "diagnóstico → orçamento enviado" de horas para minutos aumenta diretamente a conversão (orçamento enviado no calor do problema converte mais). É também o recurso mais demonstrável em vendas: impossível não gerar "uau" na demo.

**Tela: `/os/[id]/orcamento-foto`**
- Câmera aberta em tela cheia (mobile) com guia de enquadramento.
- Após a foto: painel dividido — foto à esquerda com marcações da IA (bounding box no componente), à direita o rascunho: componente identificado + confiança %, diagnóstico sugerido, peças do estoque compatíveis com o veículo da OS (com saldo), tempo padrão sugerido.
- Cada sugestão tem ✓/✗ — o humano sempre confirma; nada vai para o orçamento sem aprovação do consultor.
- Botão "Adicionar ao orçamento" joga direto na quote em rascunho.

**Guardrails:** IA nunca envia nada ao cliente sozinha; confiança < 70% mostra "não tenho certeza — confira com o mecânico"; feedback ✓/✗ alimenta melhoria contínua.

---

### A2. Agente IA no WhatsApp da oficina 🤖

**O que é:** evolução do bot de autoatendimento — um agente que conversa naturalmente no WhatsApp da oficina e resolve ponta a ponta: consulta status por placa, envia 2ª via de orçamento/fatura, pré-agenda serviço consultando a agenda real, faz triagem de defeito ("descreva o problema" → estrutura sintomas → cria pré-OS), responde perguntas sobre garantia dos serviços feitos. Transbordo inteligente: detecta frustração ou assunto sensível (negociação de preço, reclamação) e passa para humano com resumo da conversa.

**Por que vale muito:** oficina de caminhão recebe mensagem 6h da manhã e 22h da noite (motorista na estrada). Responder fora do horário sem contratar ninguém é valor direto. Para o TruckOS, é o recurso que ancora o plano Pro/Fleet e é quase impossível de replicar por concorrente local.

**Tela: `/whatsapp/agente`**
- Painel de configuração: liga/desliga por intent (status ✓, agendamento ✓, negociação ✗), horário de atuação (ex.: só fora do comercial), tom de voz (formal/próximo), respostas proibidas.
- Simulador embutido: chat de teste onde o gestor conversa com o agente antes de ativar.
- Fila de supervisão: conversas que o agente resolveu (auditáveis) + as que transbordou, com nota de por quê.
- Métricas: % resolvido sem humano, tempo médio de resposta, satisfação pós-conversa.

---

### A3. Laudo Técnico Narrado 🎙️

**O que é:** o mecânico grava um áudio explicando o que encontrou ("a lona do segundo eixo tá no rebite, o tambor riscou, recomendo trocar o jogo e retificar") e a IA transforma em laudo técnico estruturado e formatado — versão técnica para o arquivo e versão "para leigo" que vai no orçamento do cliente.

**Por que vale muito:** mecânico bom raramente gosta de escrever. O laudo escrito profissionaliza a oficina perante frotas (que exigem documentação) e a explicação em linguagem simples aumenta conversão de orçamento. Custo de desenvolvimento baixo (transcrição + prompt), percepção de valor alta.

**Tela:** botão de microfone dentro da seção da OS → preview do laudo gerado em 2 abas (Técnico / Cliente) → editar → anexar.

---

## BLOCO B — Retenção do cliente final (a oficina vende mais, o SaaS fica indispensável)

### B1. Score de Saúde do Veículo ❤️‍🩹

**O que é:** cada veículo ganha uma nota 0-100 calculada do histórico: itens críticos com manutenção em dia, idade dos componentes de desgaste (lonas, embreagem, pneus se módulo ativo), PMs cumpridas vs. atrasadas, reincidência de defeitos. Exibido como selo colorido (verde/amarelo/vermelho) na ficha do veículo, no portal da frota e no relatório mensal.

**Por que vale muito:** transforma dado histórico em argumento de venda para a oficina ("seu cavalo está 61/100 — esses 3 itens derrubam a nota") e em ferramenta de gestão para a frota. Cria conversa proativa de manutenção = mais OS por veículo/ano. Para o SaaS: quanto mais histórico acumulado, melhor o score → lock-in de dados brutal.

**Tela: card no `/veiculos/[id]` + widget no portal**
- Gauge circular com a nota + tendência (↑↓ vs. trimestre anterior).
- Lista "o que derruba sua nota": item, severidade, custo estimado de resolver, botão "Orçar agora".
- No portal da frota: ranking dos veículos por score — gestor de frota vê na hora qual caminhão é a bomba-relógio.

---

### B2. Radar de Recompra (manutenção preditiva por histórico) 🎯

**O que é:** motor de regras + estatística sobre o histórico do tenant e da base agregada (anonimizada): "lona de freio nesse perfil de operação dura em média 40.000 km; o veículo ABC-1234 trocou há 34.000 km e roda ~4.500 km/mês → janela de recompra em ~6 semanas". Gera fila de oportunidades com valor estimado e dispara campanha de WhatsApp com um clique (ou automática).

**Por que vale muito:** é literalmente uma máquina de gerar receita para a oficina — o argumento de ROI mais direto possível na renovação da assinatura ("o Radar gerou R$ 38 mil em OS este trimestre"). Mostrar esse número na tela de assinatura na hora da renovação é retenção pura.

**Tela: `/radar`**
- Funil de oportunidades: colunas Previstas → Contatadas → Agendadas → Convertidas, com R$ em cada.
- Card da oportunidade: veículo, cliente, item previsto, km estimado atual, confiança, valor estimado, botão WhatsApp com mensagem pronta.
- Painel de resultado: receita atribuída ao Radar no período (o número que renova assinatura).

---

### B3. Recall & Campanhas de Fabricante 📢

**O que é:** base de recalls e campanhas de fábrica (Mercedes, Volvo, Scania, VW, DAF, Iveco) cruzada com a frota cadastrada por chassi/modelo/ano. Oficina descobre quais veículos de clientes têm recall pendente e oferece o serviço/encaminhamento.

**Tela:** aba em `/radar` com matches; alerta no check-in ("este chassi tem campanha de fábrica ativa").

---

## BLOCO C — Operação de pátio e produtividade

### C1. Modo Pátio — TV da oficina 📺

**O que é:** uma URL `/tv` que roda em qualquer smart TV/monitor pendurado na oficina: Kanban gigante em tempo real, sem interação, com rotação automática entre visões — OS por fase, fila de cada mecânico, requisições de peça pendentes (piscando as atrasadas), veículos prometidos para hoje. Auto-refresh via Realtime, dark mode de alto contraste, fonte legível a 10 metros.

**Por que vale muito:** custo de desenvolvimento baixíssimo (é uma view read-only do que já existe) e impacto cultural enorme: a oficina inteira passa a viver dentro do sistema. É também marketing físico — todo cliente que entra no pátio vê a operação organizada na TV. Recurso clássico de "efeito demo" que fecha venda.

**Tela: `/tv` (token de dispositivo, sem login interativo)**
- Config no admin: quais painéis rotacionam, tempo de cada, cores de alerta.

---

### C2. Gamificação de Produtivos 🏆

**O que é:** placar mensal por mecânico baseado no que o sistema já mede: eficiência (padrão × real), qualidade (taxa de retorno), pontualidade de apontamento, requisições corretas. Metas configuráveis, medalhas, e — o que importa — vínculo opcional ao cálculo de prêmio/comissão (exportável para folha).

**Por que vale muito:** o apontamento de tempo é o dado mais difícil de conseguir do mecânico; gamificar resolve a adesão. E o dono ganha critério objetivo de bônus, encerrando a discussão de "quem produz mais". Você conhece esse mecanismo do chão de fábrica da QuartzRevest — polivalência e metas visíveis mudam comportamento.

**Tela: `/equipe/placar`**
- Ranking do mês com barras (eficiência, qualidade, disciplina), evolução individual, metas do time.
- Versão para o Modo Pátio (TV) — placar público opcional (configurável, alguns donos amam, outros preferem privado).

---

### C3. Agenda Inteligente com Capacidade Real 📅

**O que é:** agenda que enxerga capacidade de verdade: horas disponíveis por mecânico × especialidade × box, e encaixa agendamentos com base no tempo padrão do serviço solicitado. Sugere o melhor slot ("terça 14h: box 2 livre + João, que é o especialista em freio, disponível"). Overbooking controlado com % configurável (no-show existe). Cliente agenda pelo link público ou pelo agente do WhatsApp.

**Por que vale muito:** oficina de pesados vive o dilema pátio lotado × mecânico ocioso. Vender hora ociosa e não prometer o que não cabe é ganho direto de faturamento e de reputação de prazo.

**Tela: `/agenda`**
- Grade semanal por recurso (mecânico/box), com "mancha de capacidade" (heatmap de ocupação).
- Modal de novo agendamento: serviço → sistema sugere 3 melhores slots com justificativa.
- Linha vermelha do dia: capacidade comprometida vs. disponível em horas.

---

### C4. Checklist de Inspeção Vendedor (DVI que vende) 🔍

**O que é:** inspeção digital de N pontos (40 itens padrão linha pesada) com semáforo verde/amarelo/vermelho por item + foto obrigatória nos vermelhos. Ao final, gera página pública (mesmo padrão do acompanhamento) onde o cliente vê o raio-X do veículo e pode aprovar itens direto de lá. Itens amarelos não aprovados alimentam o Radar de Recompra.

**Por que vale muito:** DVI é o recurso que mais comprovadamente aumenta ticket médio em oficinas nos EUA (Shopmonkey/Autoflow constroem o pitch em cima disso) — o cliente aprova mais quando VÊ. Amarra três módulos que já existem: fotos, aprovação pública e radar.

**Tela: `/os/[id]/inspecao` (mobile, para o mecânico)**
- Lista de itens com 3 botões grandes (verde/amarelo/vermelho), câmera inline, observação por voz.
- Barra de progresso; ao concluir, preview da página do cliente e botão "Enviar por WhatsApp".

---

## BLOCO D — Módulos de nicho que viram receita (add-ons de plano)

### D1. Gestão de Pneus 🛞 (add-on pago)

**O que é:** pneu é o 2º maior custo de frota depois do diesel — e tem vida própria: rodízio, recapagem (1ª, 2ª, 3ª vida), sucateamento, medição de sulco. O módulo rastreia cada pneu individualmente (número de fogo), posição no veículo (diagrama interativo dos eixos), histórico de rodízios, envios para recapadora, CPK (custo por km) por marca/modelo de pneu.

**Por que vale muito:** nenhuma oficina pequena tem isso; frotas pagam caro por sistemas dedicados de pneu. Como add-on (ex.: +R$ 149/mês), é receita incremental e argumento para a oficina fechar contrato de gestão de pneus com as frotas — receita nova para o SEU cliente, financiada pelo seu módulo.

**Tela: `/pneus`**
- Diagrama do veículo (vista superior, eixos e posições) — toque na posição mostra o pneu: fogo, sulco atual, vidas, km rodado.
- Fluxo de rodízio: arrastar pneu de uma posição a outra no diagrama.
- Painel de recapagem: pneus na recapadora, prazo, custo.
- Relatório CPK por marca — qual pneu vale a pena comprar.

---

### D2. Central de Garantias de Fabricante 🛡️

**O que é:** gestão do dinheiro que a oficina deixa na mesa: peça que falhou dentro da garantia do fabricante/distribuidor. Fluxo: peça removida → foto + laudo de falha → abertura de pleito com o fornecedor → acompanhamento (enviado, em análise, aprovado, creditado) → conciliação do crédito.

**Por que vale muito:** oficinas perdem milhares de reais/ano por não formalizar pleitos de garantia (dá trabalho, ninguém acompanha). Recuperar isso é dinheiro achado no chão — mais um número de ROI direto do sistema.

**Tela: `/garantias`** — funil de pleitos por fornecedor com valores, prazo de resposta, taxa de aprovação por fornecedor (dado que vira poder de negociação de compra).

---

### D3. Socorro & Oficina Móvel 🚨

**O que é:** botão de emergência no portal/WhatsApp da frota → abre chamado com localização (link de GPS do WhatsApp), triagem do problema pelo agente IA, despacho do caminhão-oficina com checklist de ferramentas/peças sugerido pelo defeito relatado, OS de campo com apontamento offline (sincroniza ao voltar ao sinal), cobrança de taxa de deslocamento por km.

**Por que vale muito:** socorro 24h é o serviço de maior margem da oficina de pesados e o maior gerador de fidelidade de frota ("quem me atende na estrada às 3h leva minha manutenção toda"). O módulo de almoxarifado móvel já previsto (warehouses kind='movel') se conecta aqui.

**Tela: `/socorro`** — mapa com chamados abertos, veículo de socorro em rota, timeline do atendimento; app do socorrista em modo offline-first.

---

### D4. Multi-unidade / Rede & Franquia 🏢

**O que é:** camada acima do tenant: grupo com N oficinas, consolidação de relatórios, transferência de estoque entre unidades, tabela de preços corporativa, cliente atendido em qualquer unidade com histórico único.

**Por que vale muito:** destrava o segmento de redes regionais e concessionárias de pesados — tíquete de assinatura 5-10× maior. Só faça quando houver demanda puxada (é complexidade real de dados).

**Tela: `/grupo`** — seletor de unidade no header, dashboards consolidados vs. por unidade, comparativo entre lojas (a unidade B converte 20 pontos a menos — por quê?).

---

## BLOCO E — Efeito de rede (o fosso de longo prazo)

### E1. Benchmark Anônimo entre Oficinas 📊

**O que é:** com dezenas de tenants, o TruckOS passa a ter o dado que ninguém no Brasil tem: indicadores reais de oficinas de pesados. Painel opt-in e anonimizado: "seu ticket médio é R$ 3.400; oficinas do seu porte na sua região: R$ 4.100" — conversão de orçamento, eficiência de mecânico, prazo médio, margem de peças, tudo comparado por porte/região.

**Por que vale muito:** é o recurso que ninguém consegue copiar sem a base instalada. Vira conteúdo de marketing (relatório anual "Panorama das Oficinas de Pesados"), imprensa e um motivo emocional fortíssimo de permanência ("se eu sair, fico cego de novo"). Exclusivo do plano Fleet.

**Tela: `/relatorios/benchmark`** — cada KPI com o seu número, a faixa do mercado (p25-p75) e sua posição; insights do helper ("você está no quartil inferior de conversão — as 3 práticas mais comuns do quartil superior são...").

**Regras inegociáveis:** opt-in explícito, k-anonimato (mínimo de N tenants por recorte para exibir), nunca dados que identifiquem cliente final, LGPD documentada.

---

### E2. Marketplace de Peças entre Oficinas 🔄

**O que é:** a peça parada de uma oficina é a emergência da outra. Marketplace interno: cada tenant pode publicar excedentes (curva C parada > 180 dias) visíveis a oficinas próximas na rede TruckOS; busca federada quando uma OS precisa de peça sem estoque local ("disponível na Diesel Forte, 40 km, R$ 890"). TruckOS intermedeia com taxa de transação (3-5%).

**Por que vale muito:** transforma o SaaS em rede com receita transacional além da assinatura, resolve dor real (capital parado + caminhão esperando peça) e cria mais um lock-in de rede. É o embrião de um negócio maior que o próprio SaaS.

**Tela: `/marketplace`** — busca com raio geográfico, ficha da peça com fotos e cross-reference OEM, chat entre oficinas, pedido com pagamento intermediado, reputação de vendedor.

---

### E3. TruckOS Financia (BNPL de reparo) 💳

**O que é:** parceria com fintech de crédito (ex.: modelos tipo Koin/BizCapital) embutida na aprovação do orçamento: reparo de R$ 18.000 parcelado para o cliente da oficina, com a oficina recebendo à vista (antecipação). O botão "Parcelar este reparo" aparece na própria página pública de aprovação.

**Por que vale muito:** o maior motivo de recusa de orçamento grande é caixa do cliente. Destravar isso aumenta a conversão da oficina (ROI direto) e gera receita de originação para o TruckOS. Exige parceiro regulado — é integração, não construir crédito do zero.

**Tela:** simulador de parcelas dentro de `/aprovar/[token]`; painel de antecipações no financeiro da oficina.

---

## BLOCO F — Pequenas telas de alto impacto (quick wins)

### F1. Balcão Rápido (venda de peças sem OS)
PDV simplificado: busca por código de barras, carrinho, cliente opcional, NFC-e, baixa de estoque. Muitas oficinas de pesados têm balcão de peças com giro relevante — sem isso, o estoque do sistema nunca bate. **Tela `/balcao`:** 3 cliques da busca ao recibo.

### F2. Modo Passagem de Turno 🌙
Resumo automático de fim de dia para o grupo do WhatsApp interno da oficina (ou tela): OS que viraram o dia e por quê, pendências de peça, prometidos para amanhã. O gestor dorme sabendo o estado do pátio. **Gerado pelo helper às 18h, custo de dev quase zero.**

### F3. Etiquetas & QR do Pátio
Impressão de etiqueta da OS (nº grande + QR) para pendurar no retrovisor. Qualquer pessoa com o app escaneia e cai na OS. Mata o "de quem é esse caminhão no fundo do pátio?". **Tela:** botão imprimir na OS + scanner no menu mobile.

### F4. Custo Real da OS (margem verdadeira)
Painel pós-entrega: receita − peças (custo médio real) − horas apontadas × custo/hora do mecânico − terceiros = margem real da OS. Ranking de OS por margem; tipos de serviço que dão prejuízo sem o dono saber. **Aproveita 100% de dados já coletados — só falta a tela.**

### F5. Modo Treinamento 🎓
Tenant sandbox com dados fictícios para treinar funcionário novo sem sujar a base real. Reset com um clique. Reduz medo de "estragar o sistema" — objeção real de adoção.

### F6. Exportação Contador 📁
Tela mensal: um ZIP com XMLs, relatório de faturamento, comissões e movimentos — pronto para mandar ao contador no dia 1º. Quem já viveu fechamento fiscal sabe: isso sozinho retém assinatura.

---

## COMO PRIORIZAR (recomendação)

**Regra de ouro:** priorize o que gera **número de ROI exibível na tela de renovação da assinatura**. Nessa lógica:

1. **F2 (imediato pós-MVP):** Modo Pátio (C1), Balcão (F1), Custo Real da OS (F4), Orçamento por Foto (A1), Score de Saúde (B1), Laudo Narrado (A3) — baratos, demonstráveis, aumentam adoção diária.
2. **F3 (consolidação):** Radar de Recompra (B2) — o coração da retenção —, DVI (C4), Agenda Inteligente (C3), Gamificação (C2), Garantias (D2), Agente IA completo (A2), Pneus (D1) como primeiro add-on pago.
3. **F4 (expansão):** Multi-unidade (D4), Socorro (D3), Benchmark (E1) quando houver ≥ 50 tenants ativos.
4. **F5 (efeito de rede):** Marketplace (E2) e Financiamento (E3) — só com base instalada e fôlego; são negócios dentro do negócio.

**Sinal de alerta:** não construir D4/E1/E2 cedo demais. Efeito de rede sem rede é custo morto. O caminho é: MVP sólido → ROI provado por tenant → escala de base → aí os recursos de rede viram imbatíveis.
