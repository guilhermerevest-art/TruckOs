'use client';

import { useMemo, useState } from 'react';
import { Camera, Check, MessageCircle, ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { DVI_ITEMS } from '@/lib/dviItems';

type ItemStatus = 'nao_verificado' | 'verde' | 'amarelo' | 'vermelho';
type ItemRow = { id?: string; item_key: string; status: ItemStatus; note: string | null; photo_url: string | null };

const STATUS_META: Record<ItemStatus, { label: string; color: string }> = {
  nao_verificado: { label: '—', color: 'bg-slate-200 text-slate-500' },
  verde: { label: 'OK', color: 'bg-green-500 text-white' },
  amarelo: { label: 'Atenção', color: 'bg-amber-500 text-white' },
  vermelho: { label: 'Crítico', color: 'bg-red-600 text-white' },
};

export function InspecaoClient({
  workOrderId,
  tenantId,
  vehicleLabel,
  publicToken,
  initialItems,
}: {
  workOrderId: string;
  tenantId: string;
  vehicleLabel: string;
  publicToken: string | null;
  initialItems: ItemRow[];
}) {
  const supabase = createClient();
  const toast = useToast();

  const initialMap = useMemo(() => {
    const map = new Map<string, ItemRow>();
    initialItems.forEach(i => map.set(i.item_key, i));
    return map;
  }, [initialItems]);

  const [items, setItems] = useState<Record<string, ItemRow>>(() => {
    const obj: Record<string, ItemRow> = {};
    DVI_ITEMS.forEach(d => {
      obj[d.key] = initialMap.get(d.key) ?? { item_key: d.key, status: 'nao_verificado', note: null, photo_url: null };
    });
    return obj;
  });
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const checked = Object.values(items).filter(i => i.status !== 'nao_verificado').length;
  const progress = Math.round((checked / DVI_ITEMS.length) * 100);

  async function setStatus(key: string, status: ItemStatus) {
    setItems(prev => ({ ...prev, [key]: { ...prev[key], status } }));
    await persist(key, { status });
  }

  async function setNote(key: string, note: string) {
    setItems(prev => ({ ...prev, [key]: { ...prev[key], note } }));
  }

  async function persist(key: string, patch: Partial<ItemRow>) {
    const def = DVI_ITEMS.find(d => d.key === key)!;
    const current = items[key];
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('wo_inspections')
      .upsert(
        {
          tenant_id: tenantId,
          work_order_id: workOrderId,
          item_key: key,
          item_label: def.label,
          category: def.category,
          status: patch.status ?? current.status,
          note: patch.note !== undefined ? patch.note : current.note,
          photo_url: patch.photo_url !== undefined ? patch.photo_url : current.photo_url,
          checked_by: user?.id,
          checked_at: new Date().toISOString(),
        },
        { onConflict: 'work_order_id,item_key' },
      )
      .select()
      .single();

    if (error) {
      toast.show({ type: 'error', title: 'Erro ao salvar item', description: error.message });
      return;
    }
    setItems(prev => ({ ...prev, [key]: { ...prev[key], id: data.id } }));
  }

  async function uploadPhoto(key: string, file: File) {
    setUploadingKey(key);
    const path = `${tenantId}/${workOrderId}/dvi-${key}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('wo-media').upload(path, file, { contentType: file.type });
    if (upErr) {
      toast.show({ type: 'error', title: 'Erro no upload', description: upErr.message });
      setUploadingKey(null);
      return;
    }
    const { data: pub } = supabase.storage.from('wo-media').getPublicUrl(path);
    await persist(key, { photo_url: pub.publicUrl });
    setItems(prev => ({ ...prev, [key]: { ...prev[key], photo_url: pub.publicUrl } }));
    setUploadingKey(null);
  }

  async function enviarWhatsapp() {
    setSending(true);
    try {
      const { data: wo } = await supabase
        .from('work_orders')
        .select('customer:customers(name, contacts:customer_contacts(phone_e164, whatsapp))')
        .eq('id', workOrderId)
        .single();
      const phone = (wo?.customer as any)?.contacts?.find((c: any) => c.whatsapp)?.phone_e164;
      if (!phone) {
        toast.show({ type: 'warning', title: 'Sem WhatsApp cadastrado para este cliente' });
        return;
      }
      let { data: conv } = await supabase.from('wa_conversations').select('id').eq('contact_phone', phone).maybeSingle();
      if (!conv) {
        const { data: created } = await supabase
          .from('wa_conversations')
          .insert({ contact_phone: phone, contact_name: (wo?.customer as any)?.name })
          .select()
          .single();
        conv = created;
      }
      const link = `${window.location.origin}/acompanhamento/${publicToken}`;
      await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conv!.id,
          phone,
          body: `Fizemos a inspeção completa do seu veículo. Veja o raio-x e aprove os itens: ${link}`,
        }),
      });
      toast.show({ type: 'success', title: 'Enviado por WhatsApp' });
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao enviar', description: err?.message });
    } finally {
      setSending(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, typeof DVI_ITEMS>();
    DVI_ITEMS.forEach(d => {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    });
    return map;
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Inspeção (DVI)</h1>
        <p className="text-sm text-slate-500">{vehicleLabel}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 text-xs text-slate-500">{checked}/{DVI_ITEMS.length} verificados</div>
      </div>

      {Array.from(grouped.entries()).map(([category, defs]) => (
        <div key={category} className="mb-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{category}</h2>
          <div className="space-y-2">
            {defs.map(def => {
              const item = items[def.key];
              return (
                <div key={def.key} className="rounded-lg border bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{def.label}</span>
                    <div className="flex gap-1">
                      {(['verde', 'amarelo', 'vermelho'] as ItemStatus[]).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(def.key, s)}
                          className={`h-9 w-9 rounded-full text-xs font-bold ${
                            item.status === s ? STATUS_META[s].color : 'bg-slate-100 text-slate-400'
                          }`}
                          title={STATUS_META[s].label}
                        >
                          {s === 'verde' ? '✓' : s === 'amarelo' ? '!' : '✕'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {item.status !== 'nao_verificado' && (
                    <div className="mt-2 space-y-2">
                      <input
                        value={item.note ?? ''}
                        onChange={e => setNote(def.key, e.target.value)}
                        onBlur={() => persist(def.key, { note: item.note })}
                        placeholder="Observação (opcional)"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <label className="btn-secondary cursor-pointer py-1 text-xs">
                          {uploadingKey === def.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Camera className="h-3 w-3" />
                          )}
                          Foto
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={e => e.target.files?.[0] && uploadPhoto(def.key, e.target.files[0])}
                          />
                        </label>
                        {item.photo_url && (
                          <img src={item.photo_url} alt="" className="h-9 w-9 rounded object-cover" />
                        )}
                        {item.status === 'vermelho' && !item.photo_url && (
                          <span className="text-xs text-red-500">Foto recomendada para itens críticos</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="sticky bottom-4 mt-6 flex gap-2 rounded-xl border bg-white p-3 shadow-lg">
        {publicToken && (
          <a
            href={`/acompanhamento/${publicToken}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary flex-1"
          >
            <ExternalLink className="h-4 w-4" /> Ver como cliente
          </a>
        )}
        <button onClick={enviarWhatsapp} disabled={sending} className="btn-primary flex-1">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Enviar por WhatsApp
        </button>
      </div>
    </div>
  );
}
