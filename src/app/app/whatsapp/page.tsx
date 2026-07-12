import { createClient } from '@/lib/supabase/server';
import { WhatsAppInbox } from './WhatsAppInbox';
import { MessageCircle, Wifi, WifiOff, Bot } from 'lucide-react';
import Link from 'next/link';

export default async function WhatsAppPage() {
  const supabase = await createClient();

  const [{ data: instance }, { data: conversationRows }] = await Promise.all([
    supabase
      .from('wa_instances')
      .select('id, status, phone_e164, last_seen_at')
      .single(),
    supabase
      .from('wa_conversations')
      .select(
        'id, contact_phone, contact_name, status, last_message_at, unread_count, customer:customers(name)',
      )
      .order('last_message_at', { ascending: false })
      .limit(50),
  ]);

  // Supabase infere relacoes embutidas como array sem tipos gerados do banco;
  // em N:1 (conversa -> customer) o retorno em runtime e um objeto unico.
  const conversations = (conversationRows ?? []).map((r: any) => ({
    ...r,
    customer: Array.isArray(r.customer) ? (r.customer[0] ?? null) : r.customer,
  }));

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MessageCircle className="h-6 w-6 text-green-600" /> WhatsApp
          </h1>
          <p className="text-sm text-slate-500">
            Caixa de entrada compartilhada da oficina
          </p>
        </div>
        <div className="flex items-center gap-2">
          {instance?.status === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              <Wifi className="h-3 w-3" /> Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              <WifiOff className="h-3 w-3" /> Desconectado
            </span>
          )}
          {instance?.phone_e164 && (
            <span className="text-xs text-slate-500">{instance.phone_e164}</span>
          )}
          <Link href="/app/whatsapp/agente" className="btn-secondary">
            <Bot className="h-4 w-4" /> Agente IA
          </Link>
        </div>
      </div>

      <WhatsAppInbox initialConversations={conversations ?? []} instance={instance} />
    </div>
  );
}