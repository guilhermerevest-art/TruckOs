'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Check, X, AlertTriangle, PlusCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type SuggestedPart = {
  part_id: string | null;
  description: string;
  qty: number;
  saldo: number | null;
  sale_price: number | null;
};

type Suggestion = {
  componente: string;
  categoria: string;
  confianca: number;
  diagnostico: string;
  tempo_padrao_horas: number;
  pecas_sugeridas: SuggestedPart[];
};

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mediaType = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg';
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PhotoQuoteClient({
  workOrderId,
  vehicleLabel,
}: {
  workOrderId: string;
  vehicleLabel: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [approvedParts, setApprovedParts] = useState<Set<number>>(new Set());
  const [laborRate, setLaborRate] = useState(120);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setSuggestion(null);
    setAnalyzing(true);
    const { base64, mediaType } = await fileToBase64(file);
    setPhotoPreview(`data:${mediaType};base64,${base64}`);

    try {
      const res = await fetch('/api/ai/orcamento-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId, imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (data.error) {
        toast.show({ type: 'error', title: 'Nao foi possivel analisar', description: data.message });
        return;
      }
      setSuggestion(data.suggestion);
      setApprovedParts(new Set((data.suggestion.pecas_sugeridas as SuggestedPart[]).map((_, i) => i)));
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao analisar foto', description: err?.message });
    } finally {
      setAnalyzing(false);
    }
  }

  function togglePart(i: number) {
    setApprovedParts(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function addToQuote() {
    if (!suggestion) return;
    setSaving(true);
    try {
      const { data: tenant } = await supabase.from('tenants').select('id').single();
      if (!tenant) throw new Error('Tenant nao encontrado');

      const { data: section, error: sectionErr } = await supabase
        .from('wo_sections')
        .insert({
          tenant_id: tenant.id,
          work_order_id: workOrderId,
          category: suggestion.categoria,
          description: suggestion.componente,
          diagnosis: { sintoma: '', causa: suggestion.diagnostico, solucao: '' },
          std_hours: suggestion.tempo_padrao_horas,
          labor_rate: laborRate,
        })
        .select()
        .single();
      if (sectionErr) throw sectionErr;

      let addedParts = 0;
      for (let i = 0; i < suggestion.pecas_sugeridas.length; i++) {
        if (!approvedParts.has(i)) continue;
        const p = suggestion.pecas_sugeridas[i];

        if (p.part_id) {
          const { error } = await supabase.rpc('add_wo_part_from_stock', {
            p_work_order_id: workOrderId,
            p_part_id: p.part_id,
            p_qty: p.qty,
            p_unit_price: p.sale_price ?? 0,
            p_description: p.description,
            p_section_id: section.id,
          });
          if (!error) addedParts++;
        } else {
          const { error } = await supabase.from('wo_parts').insert({
            tenant_id: tenant.id,
            work_order_id: workOrderId,
            section_id: section.id,
            source: 'terceiro',
            description: p.description,
            qty: p.qty,
            unit_price: 0,
          });
          if (!error) addedParts++;
        }
      }

      toast.show({
        type: 'success',
        title: 'Adicionado a OS',
        description: `1 servico + ${addedParts} peca(s). Confira e gere o orcamento.`,
      });
      setSuggestion(null);
      setPhotoPreview(null);
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao adicionar', description: err?.message ?? String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10">
      <div className="mb-4 text-center text-white">
        <h1 className="text-xl font-bold">Orcamento por foto</h1>
        <p className="text-sm text-slate-400">{vehicleLabel}</p>
      </div>

      {!photoPreview && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900 py-20 text-slate-300 hover:border-sky-500 hover:text-sky-300"
        >
          <Camera className="h-12 w-12" />
          <span className="text-lg font-semibold">Fotografar componente danificado</span>
          <span className="text-sm text-slate-500">lona, cruzeta, vazamento… a IA identifica</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {photoPreview && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <img src={photoPreview} alt="Foto do componente" className="w-full rounded-xl border border-slate-700" />
            <button
              type="button"
              onClick={() => {
                setPhotoPreview(null);
                setSuggestion(null);
              }}
              className="btn-secondary mt-2 w-full"
            >
              Tirar outra foto
            </button>
          </div>

          <div>
            {analyzing && (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl bg-slate-900 p-8 text-slate-300">
                <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
                Analisando foto…
              </div>
            )}

            {suggestion && (
              <div className="space-y-4 rounded-xl bg-slate-900 p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">{suggestion.componente}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        suggestion.confianca >= 70
                          ? 'bg-green-600 text-white'
                          : 'bg-amber-500 text-slate-900'
                      }`}
                    >
                      {suggestion.confianca}% confianca
                    </span>
                  </div>
                  {suggestion.confianca < 70 && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-900/40 p-2 text-xs text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      Nao tenho certeza — confira com o mecanico antes de aprovar.
                    </div>
                  )}
                </div>

                <p className="text-sm text-slate-300">{suggestion.diagnostico}</p>

                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <span>Tempo padrao:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={suggestion.tempo_padrao_horas}
                    onChange={e =>
                      setSuggestion(s => (s ? { ...s, tempo_padrao_horas: parseFloat(e.target.value) || 0 } : s))
                    }
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-white"
                  />
                  <span>h ×</span>
                  <input
                    type="number"
                    step="1"
                    value={laborRate}
                    onChange={e => setLaborRate(parseFloat(e.target.value) || 0)}
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-white"
                  />
                  <span>R$/h = {formatBRL(suggestion.tempo_padrao_horas * laborRate)}</span>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">
                    Pecas sugeridas — confirme cada uma
                  </div>
                  <div className="space-y-1.5">
                    {suggestion.pecas_sugeridas.map((p, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-lg p-2 ${
                          approvedParts.has(i) ? 'bg-slate-800' : 'bg-slate-800/40 opacity-50'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium text-white">{p.description}</div>
                          <div className="text-xs text-slate-400">
                            {p.qty}x{p.part_id ? ` · saldo ${p.saldo ?? 0}` : ' · sem correspondencia no estoque'}
                            {p.sale_price ? ` · ${formatBRL(p.sale_price)}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePart(i)}
                          className={`rounded-full p-1.5 ${
                            approvedParts.has(i) ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {approvedParts.has(i) ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                    {!suggestion.pecas_sugeridas.length && (
                      <div className="text-sm text-slate-500">Nenhuma peca sugerida.</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addToQuote}
                  disabled={saving}
                  className="btn-primary w-full py-2.5"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  {saving ? 'Adicionando…' : 'Adicionar a OS'}
                </button>
                <p className="text-center text-xs text-slate-500">
                  Nada e enviado ao cliente agora — depois gere o orcamento a partir da OS.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
