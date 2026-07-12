// Simulador do Agente IA do WhatsApp — nunca envia mensagem real, so
// mostra pro gestor como o agente responderia com a config atual.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decideWaAgentReply, type WaAgentConfig } from '@/lib/ai/waAgent';

export async function POST(req: Request) {
  const { message, history, config } = await req.json();
  if (!message) return NextResponse.json({ error: 'missing_message' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const decision = await decideWaAgentReply(
      config as WaAgentConfig,
      { customerName: 'Cliente Teste', openWorkOrderNumber: 128, openWorkOrderStatus: 'em_execucao' },
      history ?? [],
      message,
    );
    return NextResponse.json({ decision });
  } catch (err: any) {
    return NextResponse.json({ error: 'ai_unavailable', message: err?.message }, { status: 200 });
  }
}
