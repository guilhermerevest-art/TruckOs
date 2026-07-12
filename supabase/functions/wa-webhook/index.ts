// Webhook Evolution API: recebe mensagens do WhatsApp, identifica cliente,
// abre/atualiza conversa, vincula a OS aberta, dispara respostas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

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

  // Match com customer_contacts do tenant
  const { data: contact } = await supabase
    .from('customer_contacts')
    .select('id, customer_id, customer:customers(id,name,tenant_id)')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', `+${phone}`)
    .single();

  // Cria/atualiza conversa
  await supabase.from('wa_conversations').upsert(
    {
      tenant_id: tenantId,
      contact_phone: `+${phone}`,
      customer_id: contact?.customer_id ?? null,
      contact_id: contact?.id ?? null,
      last_message_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,contact_phone' },
  );

  // Grava mensagem
  await supabase.from('wa_messages').insert({
    tenant_id: tenantId,
    direction: 'in',
    kind: data.messageType ?? 'text',
    body: data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? '',
    evolution_message_id: data.key.id,
  });

  // Auto-resposta: cliente escreve PARAR -> opt-out
  const text = (data.message?.conversation ?? '').toLowerCase().trim();
  if (text === 'parar' || text === 'sair') {
    await supabase
      .from('customer_contacts')
      .update({ opt_out: true })
      .eq('id', contact?.id ?? '00000000-0000-0000-0000-000000000000');
  }

  return new Response('ok', { status: 200 });
});