import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { conversation_id, phone, body } = await req.json();
  const supabase = await createClient();

  // Grava a mensagem como "out"
  const { data: msg, error } = await supabase
    .from('wa_messages')
    .insert({
      conversation_id,
      direction: 'out',
      kind: 'text',
      body,
      status: 'queued',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Tenta enviar via Evolution API (se configurada)
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  if (evolutionUrl) {
    try {
      await fetch(`${evolutionUrl}/message/sendText/${process.env.EVOLUTION_INSTANCE ?? 'truckos'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EVOLUTION_API_GLOBAL_KEY ?? '',
        },
        body: JSON.stringify({ number: phone.replace(/\D/g, ''), text: body }),
      });
      await supabase.from('wa_messages').update({ status: 'sent' }).eq('id', msg.id);
    } catch {
      await supabase.from('wa_messages').update({ status: 'failed' }).eq('id', msg.id);
    }
  }

  // Atualiza last_message_at na conversa
  await supabase
    .from('wa_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation_id);

  return NextResponse.json({ ok: true });
}