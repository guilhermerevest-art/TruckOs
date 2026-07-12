import Anthropic from '@anthropic-ai/sdk';

// Modo Passagem de Turno: resumo de fim de dia a partir de fatos ja
// apurados no banco (nao inventa nada — a IA so escreve a introducao).

// Instancia lazy: evita quebrar o build quando ANTHROPIC_API_KEY
// ainda nao esta configurada nas env vars (so roda em request-time).
let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export type ShiftFacts = {
  tenantName: string;
  openOverdue: { number: number; plate: string; phase: string; hoursInPhase: number }[];
  pendingParts: { wo_number: number; description: string; hoursWaiting: number }[];
  promisedTomorrow: { number: number; plate: string; customer: string }[];
};

export async function generateShiftIntro(facts: ShiftFacts): Promise<string> {
  const prompt = `
Escreva uma introducao curta (2-3 frases, portugues do Brasil, tom direto de gestor de oficina)
para o resumo de passagem de turno de hoje da oficina "${facts.tenantName}".

Fatos (nao invente nada alem disso):
- ${facts.openOverdue.length} OS pararam sem avancar de fase hoje.
- ${facts.pendingParts.length} requisicoes de peca pendentes.
- ${facts.promisedTomorrow.length} entregas prometidas para amanha.

Se tudo estiver tranquilo (poucos itens), reconheca isso. Se houver muitos itens parados, chame
atencao sem alarmismo. Nao liste os itens (a lista completa vem depois, separada).
`.trim();

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : '';
  } catch {
    return `Resumo do dia na ${facts.tenantName}.`;
  }
}
