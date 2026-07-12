import Anthropic from '@anthropic-ai/sdk';

// Laudo Tecnico Narrado: transforma o relato falado (ja transcrito no
// navegador via Web Speech API) num laudo estruturado — versao tecnica
// para o arquivo e versao em linguagem simples para o cliente.

// Instancia lazy: evita quebrar o build quando ANTHROPIC_API_KEY
// ainda nao esta configurada nas env vars (so roda em request-time).
let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

const SYSTEM_PROMPT = `
Voce estrutura laudos tecnicos de oficina de caminhoes a partir do relato falado do mecanico.
Responda APENAS com JSON valido, sem markdown, no formato:
{ "tecnico": string, "cliente": string }

"tecnico": linguagem tecnica de oficina, objetiva, para o arquivo/garantia. Pode citar
componentes, medidas, causa provavel.
"cliente": mesma informacao em linguagem simples, sem jargao, explicando o problema e a
recomendacao de forma que qualquer motorista entenda — isso vai direto no orcamento do cliente.
NUNCA invente informacao que nao esteja no relato. Se o relato for vago, mantenha o laudo
igualmente conciso em vez de inventar detalhes.
`.trim();

export async function generateLaudo(transcript: string, vehicleSummary: string) {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Veiculo: ${vehicleSummary}\n\nRelato do mecanico (transcrito):\n"${transcript}"`,
      },
    ],
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '{}';
  const jsonText = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      tecnico: String(parsed.tecnico ?? transcript),
      cliente: String(parsed.cliente ?? transcript),
    };
  } catch {
    return { tecnico: transcript, cliente: transcript };
  }
}
