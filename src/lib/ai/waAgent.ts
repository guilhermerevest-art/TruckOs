import Anthropic from '@anthropic-ai/sdk';

// Agente IA no WhatsApp da oficina. So decide o que fazer — quem manda
// a mensagem de fato e o chamador (route do simulador ou o wa-webhook).
// Guardrails: so responde intents habilitados; qualquer coisa fora disso
// (ou incerteza) vira transbordo para humano, nunca inventa.

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

export type WaAgentConfig = {
  enabled: boolean;
  intents: { status: boolean; agendamento: boolean; triagem: boolean; garantia: boolean; negociacao: boolean };
  tone: 'formal' | 'proximo';
  forbidden_replies: string[];
};

export type WaAgentContext = {
  customerName?: string | null;
  openWorkOrderNumber?: number | null;
  openWorkOrderStatus?: string | null;
};

export type WaAgentDecision =
  | { action: 'reply'; intent: string; reply: string }
  | { action: 'handoff'; intent: string; reason: string; summary: string };

const INTENT_LABELS: Record<string, string> = {
  status: 'consulta de status de OS por placa',
  agendamento: 'pré-agendamento de serviço',
  triagem: 'triagem de defeito relatado (estrutura sintomas)',
  garantia: 'perguntas sobre garantia de serviços já feitos',
  negociacao: 'negociação de preço ou reclamação',
};

export async function decideWaAgentReply(
  config: WaAgentConfig,
  context: WaAgentContext,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
): Promise<WaAgentDecision> {
  const enabledIntents = Object.entries(config.intents)
    .filter(([, v]) => v)
    .map(([k]) => `${k} (${INTENT_LABELS[k]})`);

  const systemPrompt = `
Você é o agente de atendimento no WhatsApp de uma oficina de caminhões pesados (TruckOS).
Tom de voz: ${config.tone === 'formal' ? 'formal e cordial' : 'próximo e direto, como um bom atendente conhece o cliente'}.
Responda sempre em português do Brasil.

Intents que você PODE responder sozinho: ${enabledIntents.join(', ') || 'nenhum'}.
Qualquer outra coisa — inclusive frustração, reclamação, negociação de preço, ou assunto fora
desses intents — você NÃO responde: decide "handoff" (transbordo para humano) com um resumo curto.

Frases proibidas (nunca use): ${config.forbidden_replies.join('; ') || 'nenhuma definida'}.

Contexto do cliente: ${context.customerName ?? 'desconhecido'}.
${context.openWorkOrderNumber ? `OS aberta: #${context.openWorkOrderNumber}, fase atual: ${context.openWorkOrderStatus}.` : 'Sem OS aberta vinculada.'}

Responda APENAS com JSON, um destes dois formatos:
{"action":"reply","intent":"<um dos intents permitidos>","reply":"<mensagem curta pro WhatsApp>"}
{"action":"handoff","intent":"<intent detectado>","reason":"<motivo curto>","summary":"<resumo da conversa pro humano>"}

Nunca invente informação (preço, prazo, saldo de garantia) que não esteja no contexto acima —
se precisar de dado que não tem, faça handoff em vez de chutar.
`.trim();

  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 500,
    system: systemPrompt,
    messages: [...history.slice(-6), { role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '{}';
  const jsonText = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed.action === 'reply' && config.intents[parsed.intent as keyof typeof config.intents]) {
      return { action: 'reply', intent: parsed.intent, reply: String(parsed.reply ?? '') };
    }
    return {
      action: 'handoff',
      intent: parsed.intent ?? 'desconhecido',
      reason: parsed.reason ?? 'Intent fora do escopo autorizado',
      summary: parsed.summary ?? userMessage,
    };
  } catch {
    return { action: 'handoff', intent: 'erro', reason: 'Falha ao interpretar resposta da IA', summary: userMessage };
  }
}
