import Anthropic from '@anthropic-ai/sdk';

// Socorro: sugere checklist de ferramentas/pecas pro caminhao-oficina
// levar, a partir do defeito relatado pelo motorista. So sugestao —
// o socorrista confere antes de sair.

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

export type RoadsideChecklist = { tools: string[]; parts: string[]; risk_note: string };

export async function suggestRoadsideChecklist(reportedIssue: string): Promise<RoadsideChecklist> {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 500,
    system: `
Você monta o checklist de ferramentas e peças que um caminhão-oficina de socorro 24h deve levar
para atender um chamado de emergência de caminhão pesado, a partir do defeito relatado.
Responda APENAS com JSON: {"tools": string[], "parts": string[], "risk_note": string}.
"risk_note": um aviso curto se o defeito parecer grave/inseguro para rodar (ex: freio, direção).
Seja objetivo — liste só o que é plausivelmente necessário pra esse defeito específico.
`.trim(),
    messages: [{ role: 'user', content: `Defeito relatado pelo motorista: "${reportedIssue}"` }],
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '{}';
  const jsonText = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonText);
    return {
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
      parts: Array.isArray(parsed.parts) ? parsed.parts : [],
      risk_note: String(parsed.risk_note ?? ''),
    };
  } catch {
    return { tools: [], parts: [], risk_note: '' };
  }
}
