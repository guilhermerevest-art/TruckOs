// Webhook Evolution API: recebe mensagens do WhatsApp, identifica cliente,
// abre/atualiza conversa, vincula a OS aberta, dispara respostas.
//
// Agente IA (opt-in, desligado por padrao — ver wa_agent_configs.enabled):
// so responde os intents habilitados pelo dono da oficina; qualquer coisa
// fora disso vira transbordo (wa_agent_handoffs) sem enviar nada sozinho.
// Qualquer erro aqui e engolido em try/catch: o registro da mensagem
// recebida (acima) nunca fica bloqueado pelo agente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const INTENT_LABELS: Record<string, string> = {
  status: 'consulta de status de OS por placa',
  agendamento: 'pré-agendamento de serviço',
  triagem: 'triagem de defeito relatado (estrutura sintomas)',
  garantia: 'perguntas sobre garantia de serviços já feitos',
  negociacao: 'negociação de preço ou reclamação',
};

async function isWithinActiveHours(activeHours: { mode: string; start: string; end: string }) {
  if (activeHours.mode === 'sempre') return true;
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    ),
  );
  // "fora_comercial": so atua antes das 8h ou depois das 18h
  return hour < 8 || hour >= 18;
}

async function callClaude(system: string, userMessage: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY nao configurada');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '{}';
}

async function runAgent(tenantId: string, conversationId: string, phone: string, userMessage: string) {
  const { data: config } = await supabase
    .from('wa_agent_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!config?.enabled) return;
  if (!(await isWithinActiveHours(config.active_hours))) return;

  const { data: contact } = await supabase
    .from('customer_contacts')
    .select('customer_id, customer:customers(name)')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', phone)
    .maybeSingle();

  let openWo: { number: number; status: string } | null = null;
  if (contact?.customer_id) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('number, status')
      .eq('tenant_id', tenantId)
      .eq('customer_id', contact.customer_id)
      .neq('status', 'entregue')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    openWo = wo ?? null;
  }

  const enabledIntents = Object.entries(config.intents ?? {})
    .filter(([, v]) => v)
    .map(([k]) => `${k} (${INTENT_LABELS[k] ?? k})`);

  const system = `
Você é o agente de atendimento no WhatsApp de uma oficina de caminhões pesados (TruckOS).
Tom de voz: ${config.tone === 'formal' ? 'formal e cordial' : 'próximo e direto'}.
Responda sempre em português do Brasil, mensagens curtas (estilo WhatsApp).

Intents que você PODE responder sozinho: ${enabledIntents.join(', ') || 'nenhum'}.
Qualquer outra coisa (frustração, reclamação, negociação de preço, fora desses intents) você
NÃO responde: decida "handoff".

Frases proibidas: ${(config.forbidden_replies ?? []).join('; ') || 'nenhuma'}.
Cliente: ${(contact?.customer as any)?.name ?? 'desconhecido'}.
${openWo ? `OS aberta: #${openWo.number}, fase: ${openWo.status}.` : 'Sem OS aberta.'}

Responda APENAS com JSON:
{"action":"reply","intent":"<intent>","reply":"<mensagem>"}
{"action":"handoff","intent":"<intent>","reason":"<motivo curto>","summary":"<resumo p/ humano>"}

Nunca invente preço, prazo ou dado que não esteja no contexto acima — sem certeza, faça handoff.
`.trim();

  const raw = await callClaude(system, userMessage);
  const jsonText = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const decision = JSON.parse(jsonText);

  if (decision.action === 'reply' && config.intents?.[decision.intent]) {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    let status = 'queued';
    if (evolutionUrl) {
      try {
        await fetch(`${evolutionUrl}/message/sendText/${Deno.env.get('EVOLUTION_INSTANCE') ?? 'truckos'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('EVOLUTION_API_GLOBAL_KEY') ?? '' },
          body: JSON.stringify({ number: phone.replace(/\D/g, ''), text: decision.reply }),
        });
        status = 'sent';
      } catch {
        status = 'failed';
      }
    }
    await supabase.from('wa_messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'out',
      kind: 'text',
      body: decision.reply,
      status,
      is_automated: true,
    });
  } else {
    await supabase.from('wa_agent_handoffs').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      reason: decision.reason ?? decision.intent ?? 'fora do escopo',
      summary: decision.summary ?? userMessage,
    });
    await supabase.from('wa_conversations').update({ status: 'pendente' }).eq('id', conversationId);
  }
}

Deno.serve(async req => {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant');
  if (!tenantId) return new Response('missing tenant', { status: 400 });

  const body = await req.json();
  const event = body.event;
  const data = body.data;

  // Filtra mensagens recebidas (nao enviadas por nos)
  if (event !== 'messages.upsert' || data?.key?.fromMe) {
    return new Response('ignored', { status: 200 });
  }

  const phone = data.key.remoteJid?.replace('@s.whatsapp.net', '');
  if (!phone) return new Response('no phone', { status: 200 });
  const phoneE164 = `+${phone}`;

  // Match com customer_contacts do tenant
  const { data: contact } = await supabase
    .from('customer_contacts')
    .select('id, customer_id, opt_out, customer:customers(id,name,tenant_id)')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', phoneE164)
    .single();

  // Cria/atualiza conversa
  const { data: conversation } = await supabase
    .from('wa_conversations')
    .upsert(
      {
        tenant_id: tenantId,
        contact_phone: phoneE164,
        customer_id: contact?.customer_id ?? null,
        contact_id: contact?.id ?? null,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,contact_phone' },
    )
    .select('id')
    .single();

  const text = data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? '';

  // Grava mensagem
  await supabase.from('wa_messages').insert({
    tenant_id: tenantId,
    conversation_id: conversation?.id,
    direction: 'in',
    kind: data.messageType ?? 'text',
    body: text,
    evolution_message_id: data.key.id,
  });

  // Auto-resposta: cliente escreve PARAR -> opt-out
  const normalized = text.toLowerCase().trim();
  if (normalized === 'parar' || normalized === 'sair') {
    await supabase
      .from('customer_contacts')
      .update({ opt_out: true })
      .eq('id', contact?.id ?? '00000000-0000-0000-0000-000000000000');
    return new Response('ok', { status: 200 });
  }

  // Agente IA (opt-in) — nunca deixa erro aqui derrubar o webhook
  if (conversation?.id && !contact?.opt_out && text) {
    try {
      await runAgent(tenantId, conversation.id, phoneE164, text);
    } catch (err) {
      console.error('wa-agent error', err);
    }
  }

  return new Response('ok', { status: 200 });
});
