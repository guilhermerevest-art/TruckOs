import Anthropic from '@anthropic-ai/sdk';

// Helper de IA contextual por modulo.
// As tools aqui sao read-only e respeitam o RLS do usuario logado.

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type HelperContext = {
  tenantId: string;
  userId: string;
  userRole: string;
  module: string;
  recordId?: string;
  extra?: Record<string, unknown>;
};

export type HelperMessage = { role: 'user' | 'assistant'; content: string };

const SYSTEM_PROMPT = `
Voce e o assistente embutido do TruckOS — um SaaS de gestao para oficinas de caminhoes.
Voce responde em portugues do Brasil, tom direto e pratico, sem enrolacao.

Suas regras:
1. NUNCA invente dados. Se nao souber, diga "nao tenho essa informacao agora" e sugira onde encontrar.
2. Respostas financeiras e fiscais devem vir com disclaimer: "Consulte seu contador para confirmar."
3. Sugestoes de acao devem ser concretas (qual botao clicar, qual tela abrir).
4. Quando o usuario pedir algo destrutivo (excluir, cancelar), confirme antes de sugerir.
5. Respostas curtas por padrao. Use listas quando houver mais de 2 itens.
6. NUNCA exponha dados de outro tenant. Trate o contexto como privado.
`.trim();

export async function askHelper(
  context: HelperContext,
  history: HelperMessage[],
  userMessage: string,
): Promise<string> {
  const messages: HelperMessage[] = [
    ...history.slice(-10), // janela de contexto
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: `${SYSTEM_PROMPT}\n\nContexto atual: modulo=${context.module}, role=${context.userRole}, registro=${context.recordId ?? 'nenhum'}.`,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : 'Nao consegui gerar uma resposta agora.';
}