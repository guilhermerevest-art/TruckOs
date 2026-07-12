'use client';

import { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

type Props = {
  workOrderId: string;
  sectionId?: string;
  kind: 'foto_entrada' | 'foto_servico' | 'foto_publica';
  onUploaded?: () => void;
};

export function PhotoCapture({ workOrderId, sectionId, kind, onUploaded }: Props) {
  const supabase = createClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<{ url: string; path: string }[]>([]);

  const isValidWO = workOrderId && workOrderId !== 'temp' && workOrderId.length > 8;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!isValidWO) {
      toast.show({
        type: 'warning',
        title: 'Crie a OS primeiro',
        description: 'As fotos entram na OS depois que ela for criada.',
      });
      return;
    }

    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('created_by', user?.id)
      .single();

    if (!tenant) {
      toast.show({ type: 'error', title: 'Tenant não encontrado' });
      setUploading(false);
      return;
    }

    let success = 0;
    for (const file of Array.from(files)) {
      const path = `${tenant.id}/${workOrderId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('wo-media')
        .upload(path, file, { contentType: file.type });

      if (upErr) {
        toast.show({ type: 'error', title: 'Falha no upload', description: upErr.message });
        continue;
      }

      const { error: dbErr } = await supabase.from('wo_media').insert({
        tenant_id: tenant.id,
        work_order_id: workOrderId,
        section_id: sectionId ?? null,
        kind,
        storage_path: path,
        uploaded_by: user?.id,
        is_public: kind === 'foto_publica',
      });

      if (dbErr) {
        toast.show({ type: 'error', title: 'Erro ao salvar foto', description: dbErr.message });
        continue;
      }

      const { data: pub } = supabase.storage.from('wo-media').getPublicUrl(path);
      setPreviews(prev => [...prev, { url: pub.publicUrl, path }]);
      success++;
    }

    toast.show({
      type: 'success',
      title: `${success} foto${success === 1 ? '' : 's'} enviada${success === 1 ? '' : 's'}`,
    });
    setUploading(false);
    onUploaded?.();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {uploading ? 'Enviando…' : 'Tirar foto / escolher'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {!isValidWO && (
          <span className="text-xs text-slate-500 self-center">
            💡 Salve a OS primeiro para anexar fotos a ela.
          </span>
        )}
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
          {previews.map(p => (
            <div
              key={p.path}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-100"
            >
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setPreviews(prev => prev.filter(x => x.path !== p.path))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
