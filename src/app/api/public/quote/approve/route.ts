// Endpoint publico (sem login) para aprovar orcamento via link
import { createClient } from '@/lib/supabase/client';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { token, item_ids, meta } = await req.json();

  if (!token) {
    return NextResponse.json({ error: 'token_required' }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('public_quote_approve', {
    p_token: token,
    p_item_ids: item_ids ?? [],
    p_meta: meta ?? {},
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}