import Anthropic from '@anthropic-ai/sdk';

// Orcamento por foto: a IA sugere, o consultor sempre confirma (ver PhotoQuoteDraft).
// Nada aqui grava no orcamento sozinho.

// Instancia lazy: evita quebrar o build quando ANTHROPIC_API_KEY
// ainda nao esta configurada nas env vars (so roda em request-time).
let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

export type PartCatalogItem = {
  id: string;
  sku: string | null;
  description: string;
  category: string | null;
  sale_price: number | null;
};

export type PhotoQuoteSuggestion = {
  componente: string;
  categoria: string;
  confianca: number; // 0-100
  diagnostico: string;
  tempo_padrao_horas: number;
  pecas_sugeridas: { part_id: string | null; description: string; qty: number }[];
};

const SYSTEM_PROMPT = `
Voce e o assistente de orcamento por foto do TruckOS, um SaaS de gestao para oficinas de
caminhoes pesados. Um mecanico fotografou um componente danificado (freio, suspensao, motor,
etc). Sua tarefa: identificar o componente, sugerir diagnostico provavel, cruzar com o catalogo
de pecas fornecido (usando o part_id quando houver correspondencia clara; caso contrario
part_id null e apenas a descricao) e sugerir tempo padrao de mao de obra em horas.

Regras:
1. Responda APENAS com JSON valido, sem markdown, sem explicacao fora do JSON.
2. Se nao tiver certeza do componente, ainda assim responda, mas com "confianca" baixa (abaixo de 70).
3. NUNCA invente pecas que nao existem no catalogo fornecido — se nao houver correspondencia,
   sugira a peca por descricao generica com part_id null.
4. tempo_padrao_horas deve ser realista para oficina de caminhoes pesados (ex: troca de lona 1.5-3h).
5. Isto e apenas uma sugestao — um humano sempre confere antes de enviar ao cliente.

Formato exato de resposta:
{
  "componente": string,
  "categoria": "freios"|"suspensao"|"motor"|"embreagem"|"transmissao"|"direcao"|"eletrica"|"pneus"|"5a_roda"|"carroceria"|"outros",
  "confianca": number,
  "diagnostico": string,
  "tempo_padrao_horas": number,
  "pecas_sugeridas": [{ "part_id": string|null, "description": string, "qty": number }]
}
`.trim();

export async function analyzePhotoForQuote(params: {
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  vehicleSummary: string;
  partsCatalog: PartCatalogItem[];
}): Promise<PhotoQuoteSuggestion> {
  const catalogText = params.partsCatalog
    .slice(0, 200)
    .map(p => `${p.id} | ${p.sku ?? '-'} | ${p.description} | ${p.category ?? '-'}`)
    .join('\n');

  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Veiculo: ${params.vehicleSummary}\n\nCatalogo de pecas disponivel (id | sku | descricao | categoria):\n${catalogText || '(vazio)'}\n\nAnalise a foto anexada e responda no formato JSON especificado.`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: params.mediaType,
              data: params.imageBase64,
            },
          },
        ],
      },
    ],
  });

  const block = response.content[0];
  const text = block.type === 'text' ? block.text : '{}';
  const jsonText = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      componente: parsed.componente ?? 'Componente nao identificado',
      categoria: parsed.categoria ?? 'outros',
      confianca: Math.max(0, Math.min(100, Number(parsed.confianca) || 0)),
      diagnostico: parsed.diagnostico ?? '',
      tempo_padrao_horas: Number(parsed.tempo_padrao_horas) || 1,
      pecas_sugeridas: Array.isArray(parsed.pecas_sugeridas)
        ? parsed.pecas_sugeridas.map((p: any) => ({
            part_id: p.part_id ?? null,
            description: String(p.description ?? ''),
            qty: Number(p.qty) || 1,
          }))
        : [],
    };
  } catch {
    return {
      componente: 'Nao foi possivel analisar a foto',
      categoria: 'outros',
      confianca: 0,
      diagnostico: 'Tente novamente com uma foto mais nitida ou preencha manualmente.',
      tempo_padrao_horas: 1,
      pecas_sugeridas: [],
    };
  }
}
