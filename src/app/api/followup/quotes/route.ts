// Endpoint que processa follow-upsautomaticos (chamado por cron ou manualmente)
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  return runFollowup();
}

export async function GET() {
  return runFollowup();
}

async function runFollowup() {
  const admin = createAdminClient();

  // Orcamentos enviados ha mais de 24h sem resposta
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: quotes } = await admin
    .from('quotes')
    .select(
      'id, sent_at, tenant_id, work_order:work_orders(number, customer:customers(name, contacts:customer_contacts(phone_e164)))',
    )
    .eq('status', 'sent')
    .lt('sent_at', since)
    .limit(50);

  let queued = 0;
  for (const q of quotes ?? []) {
    const wo = (q as any).work_order;
    const phone = wo?.customer?.contacts?.[0]?.phone_e164;
    if (!phone) continue;

    // registra follow-up (em produção chamaria Evolution API)
    await admin.from('quote_followups').insert({
      tenant_id: q.tenant_id,
      quote_id: q.id,
      scheduled_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      channel: 'whatsapp',
    });
    queued++;
  }

  return NextResponse.json({ ok: true, queued });
}