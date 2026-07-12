# Diretrizes de Desenvolvimento e Estabilidade (claude.md)

Este documento define as regras estritas para a manutenção e evolução deste projeto. O objetivo principal é **estabilidade em produção** e **consistência técnica**, evitando "soluções meteóricas" ou complexidade desnecessária.

---

## 🎯 1. Filosofia de Desenvolvimento
* **Pragmatismo sobre Purismo:** Priorize soluções simples, legíveis e fáceis de manter.
* **Não Invente:** Se um padrão já existe no projeto (ex: chamadas de API, estrutura de pastas, estilização), siga-o rigorosamente.
* **Código de Produção:** Todo código deve ser escrito pensando em tratamento de erros, logs e resiliência.

---

## 🏗️ 2. Arquitetura e Padrões (Front-end)
* **Estilização:** Manter o padrão atual. Não introduzir bibliotecas de CSS-in-JS se o projeto usa Tailwind, e vice-versa.
* **Componentes:**
    * Siga a estrutura: `components/`, `hooks/`, `services/`, `utils/`.
    * Componentes devem ser funcionais e focados em uma única responsabilidade.
    * **DRY (Don't Repeat Yourself):** Reutilize componentes de UI básicos (botões, inputs, cards).
* **Estado:** Não adicione novas bibliotecas de gerenciamento de estado sem necessidade crítica. Use o que já está configurado.

---

## 🛠️ 3. Regras Técnicas Estritas
1.  **TypeScript:** Tipagem forte em tudo. Evite o uso de `any`. Defina interfaces para respostas de API.
2.  **Tratamento de Erros:**
    * Toda operação assíncrona deve estar dentro de um bloco `try/catch`.
    * Exiba mensagens amigáveis ao usuário em caso de falha, mas logue o erro técnico no console/monitoramento.
3.  **Segurança:** Jamais armazene segredos (chaves de API) no código-fonte. Use variáveis de ambiente (`.env`).
4.  **Performance:** Evite re-renders desnecessários e loops pesados no lado do cliente.

---

## 🔄 4. Fluxo de Trabalho (Workflow)
* **Análise de Contexto:** Antes de gerar qualquer código, o Claude deve ler os arquivos relacionados para mimetizar o estilo de escrita e arquitetura.
* **Commits:** Mensagens em português, diretas e descritivas (ex: `fix: corrige validação de email no login`).
* **Refatoração:** Só é permitida se reduzir a complexidade ou corrigir um bug. Não refatore código funcional apenas por preferência estética.

---

## 🤖 5. Instruções para a IA (Claude)
* **Modo de Resposta:** Seja direto. Se o pedido for uma alteração simples, não reescreva o arquivo inteiro, apenas as partes afetadas.
* **Verificação:** Sempre verifique se a nova funcionalidade quebra componentes existentes.
* **Estabilidade:** Se uma sugestão minha (usuário) parecer arriscada para a produção, você deve me alertar antes de implementar.

# MOBILE APP E PORTAL
-TODAS ALTERAÇÕES DE REGRA NO APP DEVEM SER REPLICADAS NO PORTAL DO MOTORISTA E VICE-VERSA, ANTES DE FAZER QUALQUER MUDANÇA NO APP, VERIFICA SE JÁ FOI FEITA NO PORTAL.

-TODAS ALTERAÇÕES DE REGRA NO APP DEVEM SER REPLICADAS NO PORTAL DO MOTORISTA E VICE-VERSA, ANTES DE FAZER QUALQUER MUDANÇA NO APP, VERIFICA SE JÁ FOI FEITA NO PORTAL. 


# REGRAS CRÍTICAS DO SISTEMA
- NUNCA parar antes de finalizar a tarefa solicitada
- NUNCA pedir confirmação entre etapas — executar e reportar
- NUNCA commitar código quebrado
- NUNCA criar componentes de UI sem antes verificar os existentes
- NUNCA usar as any sem justificativa — tipar corretamente
- NUNCA criar planos grandes — sempre micro-etapas
- NUNCA ignorar o queue.md se ele existir no projeto
- SEMPRE corrigir erros dentro do loop, sem escalar
- SEMPRE manter o projeto funcional a cada mudança
- SEMPRE priorizar entrega funcional sobre perfeição
- SEMPRE consultar decisões arquiteturais anteriores (memória)
- CADA SESSAO deve fazer commit somente das suas alterações
- NAO fazer puveja o sh automatico.
- Sempre que criar um modulo, adiciona a lista de permissao.

