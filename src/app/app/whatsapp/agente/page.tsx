import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AgenteClient } from './AgenteClient';

export default async function AgenteWhatsappPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id').single();

  const [{ data: config }, { data: handoffs }, { data: autoMessages }] = await Promise.all([
    supabase.from('wa_agent_configs').select('*').eq('tenant_id', tenant?.id ?? '').maybeSingle(),
    supabase
      .from('wa_agent_handoffs')
      .select('*, conversation:wa_conversations(contact_name, contact_phone)')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('wa_messages').select('id, direction, is_automated, created_at').eq('is_automated', true),
  ]);

  const resolvedCount = (autoMessages ?? []).length;
  const handoffCount = (handoffs ?? []).length;
  const resolvedPct = resolvedCount + handoffCount > 0 ? Math.round((resolvedCount / (resolvedCount + handoffCount)) * 100) : 0;

  return (
    <div className="p-6 lg:p-8">
      <Link href="/app/whatsapp" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar ao WhatsApp
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Agente IA no WhatsApp</h1>
        <p className="text-sm text-slate-500">Responde status, agendamento e triagem fora do horário — transborda o resto pra humano.</p>
      </div>

      <AgenteClient
        tenantId={tenant?.id ?? ''}
        initialConfig={config}
        handoffs={handoffs ?? []}
        metrics={{ resolvedCount, handoffCount, resolvedPct }}
      />
    </div>
  );
}
