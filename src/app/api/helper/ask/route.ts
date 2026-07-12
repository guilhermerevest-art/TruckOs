// Endpoint do Helper de IA: recebe pergunta, chama Claude com contexto do modulo.
import { NextResponse } from 'next/server';
import { askHelper } from '@/lib/ai/helper';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { module, message, history = [] } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // pega tenant_id do JWT (Supabase injeta via hook custom_access_token)
  const { data: { session } } = await supabase.auth.getSession();
  const tenantId = (session?.access_token ?? '') && JSON.parse(
    Buffer.from(session!.access_token.split('.')[1], 'base64').toString(),
  ).tenant_id;

  if (!tenantId) {
    return NextResponse.json(
      { reply: 'Voce nao tem um tenant ativo no momento.' },
      { status: 200 },
    );
  }

  // role do usuario
  const { data: membership } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single();

  try {
    const reply = await askHelper(
      {
        tenantId,
        userId: user.id,
        userRole: membership?.role ?? 'member',
        module,
      },
      history,
      message,
    );

    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { reply: 'O assistente esta indisponivel no momento. Tente novamente em instantes.' },
      { status: 200 },
    );
  }
}