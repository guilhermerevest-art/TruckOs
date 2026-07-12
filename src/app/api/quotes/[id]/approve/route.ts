import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Aprova todos os itens pela oficina (atalho para quando cliente aprovou verbalmente)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // marca todos os itens pendentes como aprovados
  const { error: itemsErr } = await supabase
    .from('quote_items')
    .update({ status: 'approved' })
    .eq('quote_id', id)
    .eq('status', 'pending');

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 400 });

  const { error } = await supabase
    .from('quotes')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // avança a OS para "aguardando_peca" ou "em_execucao" dependendo se tem peças sem estoque
  const { data: quote } = await supabase
    .from('quotes')
    .select('work_order_id, items:quote_items(kind, ref_id)')
    .eq('id', id)
    .single();

  if (quote?.work_order_id) {
    await supabase.rpc('move_work_order', {
      p_work_order_id: quote.work_order_id,
      p_new_status: 'aguardando_peca',
    });
  }

  return NextResponse.json({ ok: true });
}