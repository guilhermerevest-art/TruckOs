'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Save, Loader2, X, Package, AlertTriangle } from 'lucide-react';
import { formatBRL } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

type Section = {
  id?: string;
  category: string;
  description: string;
  std_hours: number;
  labor_rate: number;
};

type Part = {
  id: string;
  part_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  source: 'estoque' | 'terceiro' | 'cliente';
};

type NewPartDraft = {
  source: 'estoque' | 'terceiro' | 'cliente';
  part_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  stockQty?: number;
};

// Templates prontos — o que o mecânico mais usa no dia a dia
const SERVICE_TEMPLATES = [
  { category: 'freios', description: 'Troca de pastilhas dianteiras', std_hours: 2, labor_rate: 120 },
  { category: 'freios', description: 'Troca de discos + pastilhas dianteiras', std_hours: 3, labor_rate: 120 },
  { category: 'freios', description: 'Retífica de discos', std_hours: 2.5, labor_rate: 120 },
  { category: 'suspensao', description: 'Troca de amortecedores (par)', std_hours: 4, labor_rate: 120 },
  { category: 'suspensao', description: 'Troca de molas', std_hours: 3, labor_rate: 120 },
  { category: 'motor', description: 'Troca de óleo e filtro', std_hours: 0.5, labor_rate: 120 },
  { category: 'motor', description: 'Regulagem de válvulas', std_hours: 3, labor_rate: 120 },
  { category: 'motor', description: 'Troca de correia dentada', std_hours: 3.5, labor_rate: 120 },
  { category: 'embreagem', description: 'Troca de kit embreagem', std_hours: 5, labor_rate: 120 },
  { category: 'direcao', description: 'Alinhamento 3D', std_hours: 1, labor_rate: 120 },
  { category: 'direcao', description: 'Troca de bomba d\'água', std_hours: 2, labor_rate: 120 },
  { category: 'eletrica', description: 'Diagnóstico elétrico', std_hours: 1.5, labor_rate: 150 },
  { category: 'pneus', description: 'Rodízio de pneus', std_hours: 0.5, labor_rate: 100 },
  { category: '5a_roda', description: 'Lubrificação 5ª roda', std_hours: 1, labor_rate: 120 },
];

const CATEGORIES = [
  { v: 'freios', label: 'Freios' },
  { v: 'suspensao', label: 'Suspensão' },
  { v: 'motor', label: 'Motor' },
  { v: 'embreagem', label: 'Embreagem' },
  { v: 'transmissao', label: 'Transmissão' },
  { v: 'direcao', label: 'Direção' },
  { v: 'eletrica', label: 'Elétrica' },
  { v: 'pneus', label: 'Pneus' },
  { v: '5a_roda', label: '5ª Roda' },
  { v: 'carroceria', label: 'Carroceria' },
  { v: 'outros', label: 'Outros' },
];

const SOURCE_LABELS: Record<Part['source'], { label: string; color: string }> = {
  estoque: { label: 'Estoque', color: 'bg-sky-100 text-sky-700' },
  terceiro: { label: 'Terceiro', color: 'bg-purple-100 text-purple-700' },
  cliente: { label: 'Cliente', color: 'bg-amber-100 text-amber-700' },
};

const emptyDraft = (source: NewPartDraft['source'] = 'estoque'): NewPartDraft => ({
  source,
  part_id: null,
  description: '',
  qty: 1,
  unit_price: 0,
});

export function WODetailClient({
  woId,
  initialSections,
  initialParts,
}: {
  woId: string;
  initialSections: any[];
  initialParts: any[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [tab, setTab] = useState<'sections' | 'parts'>('sections');
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [sections, setSections] = useState<Section[]>(initialSections ?? []);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsDirty, setSectionsDirty] = useState(false);

  const [parts, setParts] = useState<Part[]>(
    (initialParts ?? []).map(p => ({
      id: p.id,
      part_id: p.part_id ?? null,
      description: p.description,
      qty: Number(p.qty),
      unit_price: Number(p.unit_price),
      source: p.source,
    })),
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [partsCatalog, setPartsCatalog] = useState<any[]>([]);
  const [newPart, setNewPart] = useState<NewPartDraft>(emptyDraft());
  const [addingPart, setAddingPart] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);

  // Tenant (necessario pros inserts diretos de secao/peca terceiro-cliente) + catalogo de pecas
  useEffect(() => {
    supabase.from('tenants').select('id').single().then(({ data }) => setTenantId(data?.id ?? null));
    supabase
      .from('parts')
      .select('id, sku, description, sale_price, stock_balances(qty)')
      .eq('active', true)
      .order('description')
      .limit(300)
      .then(({ data }) => setPartsCatalog(data ?? []));
  }, [supabase]);

  function addSectionTemplate(template?: typeof SERVICE_TEMPLATES[number]) {
    setSections([
      ...sections,
      template ? { ...template } : { category: 'freios', description: '', std_hours: 0, labor_rate: 120 },
    ]);
    setSectionsDirty(true);
  }

  function updateSection(i: number, patch: Partial<Section>) {
    setSections(sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setSectionsDirty(true);
  }

  function removeSection(i: number) {
    setSections(sections.filter((_, idx) => idx !== i));
    setSectionsDirty(true);
  }

  async function saveSections() {
    if (!tenantId) return;
    setSectionsLoading(true);
    try {
      await supabase.from('wo_sections').delete().eq('work_order_id', woId);
      const sectionRows = sections.filter(s => s.description);
      if (sectionRows.length > 0) {
        const { error } = await supabase.from('wo_sections').insert(
          sectionRows.map(s => ({
            tenant_id: tenantId,
            work_order_id: woId,
            category: s.category,
            description: s.description,
            std_hours: s.std_hours,
            labor_rate: s.labor_rate,
          })),
        );
        if (error) throw error;
      }
      toast.show({
        type: 'success',
        title: 'Serviços salvos!',
        description: `${sectionRows.length} serviço(s).`,
      });
      setSectionsDirty(false);
    } catch (e: any) {
      toast.show({ type: 'error', title: 'Erro ao salvar', description: e?.message ?? String(e) });
    } finally {
      setSectionsLoading(false);
    }
  }

  // Filtra catálogo conforme digita (so pro form de adicionar peca do estoque)
  const filteredCatalog = useMemo(() => {
    if (!newPart.description || newPart.description.length < 2 || newPart.source !== 'estoque') return [];
    const q = newPart.description.toLowerCase();
    return partsCatalog
      .filter(p => p.description.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [newPart.description, newPart.source, partsCatalog]);

  function pickFromCatalog(c: any) {
    const stockQty = (c.stock_balances as any[])?.[0]?.qty ?? 0;
    setNewPart(d => ({ ...d, part_id: c.id, description: c.description, unit_price: Number(c.sale_price ?? 0), stockQty }));
    setShowCatalogPicker(false);
  }

  async function confirmAddPart() {
    if (!newPart.description.trim()) {
      toast.show({ type: 'warning', title: 'Descreva a peça' });
      return;
    }
    if (newPart.source === 'estoque' && !newPart.part_id) {
      toast.show({ type: 'warning', title: 'Selecione a peça na lista do estoque', description: 'Assim o saldo é atualizado certinho.' });
      return;
    }

    setAddingPart(true);

    if (newPart.source === 'estoque') {
      const { data, error } = await supabase.rpc('add_wo_part_from_stock', {
        p_work_order_id: woId,
        p_part_id: newPart.part_id,
        p_qty: newPart.qty,
        p_unit_price: newPart.unit_price,
        p_description: newPart.description,
      });
      setAddingPart(false);

      if (error) {
        toast.show({ type: 'error', title: 'Erro ao usar peça', description: error.message });
        return;
      }

      const row = data?.[0];
      setParts(prev => [
        ...prev,
        { id: row.wo_part_id, part_id: newPart.part_id, description: newPart.description, qty: newPart.qty, unit_price: newPart.unit_price, source: 'estoque' },
      ]);

      const resulting = row?.resulting_qty != null ? Number(row.resulting_qty) : null;
      if (resulting != null && resulting < 0) {
        toast.show({
          type: 'warning',
          title: 'Peça usada — mas estoque ficou negativo',
          description: `Saldo: ${resulting} un. Lance uma compra para regularizar.`,
        });
      } else {
        toast.show({
          type: 'success',
          title: 'Peça baixada do estoque',
          description: resulting != null ? `Saldo restante: ${resulting} un.` : undefined,
        });
      }
    } else {
      if (!tenantId) return;
      const { data, error } = await supabase
        .from('wo_parts')
        .insert({
          tenant_id: tenantId,
          work_order_id: woId,
          source: newPart.source,
          description: newPart.description,
          qty: newPart.qty,
          unit_price: newPart.unit_price,
        })
        .select()
        .single();
      setAddingPart(false);

      if (error) {
        toast.show({ type: 'error', title: 'Erro ao adicionar peça', description: error.message });
        return;
      }

      setParts(prev => [
        ...prev,
        { id: data.id, part_id: null, description: data.description, qty: Number(data.qty), unit_price: Number(data.unit_price), source: data.source },
      ]);
      toast.show({ type: 'success', title: 'Peça adicionada' });
    }

    setNewPart(emptyDraft(newPart.source));
  }

  async function removePart(p: Part) {
    setRemovingId(p.id);
    if (p.source === 'estoque' && p.part_id) {
      const { error } = await supabase.rpc('remove_wo_part', { p_wo_part_id: p.id });
      setRemovingId(null);
      if (error) {
        toast.show({ type: 'error', title: 'Erro ao remover', description: error.message });
        return;
      }
      toast.show({ type: 'info', title: 'Peça removida', description: 'Devolvida ao estoque.' });
    } else {
      const { error } = await supabase.from('wo_parts').delete().eq('id', p.id);
      setRemovingId(null);
      if (error) {
        toast.show({ type: 'error', title: 'Erro ao remover', description: error.message });
        return;
      }
      toast.show({ type: 'info', title: 'Peça removida' });
    }
    setParts(prev => prev.filter(x => x.id !== p.id));
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 border-b">
        <button
          onClick={() => setTab('sections')}
          className={`border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === 'sections'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Serviços ({sections.length})
        </button>
        <button
          onClick={() => setTab('parts')}
          className={`border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === 'parts'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Peças ({parts.length})
        </button>
        {tab === 'sections' && (
          <div className="ml-auto">
            <button
              onClick={saveSections}
              disabled={sectionsLoading || !sectionsDirty}
              className="btn-primary"
              title={sectionsDirty ? 'Clique para salvar' : 'Nada alterado'}
            >
              {sectionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {sectionsLoading ? 'Salvando…' : sectionsDirty ? 'Salvar' : 'Salvo'}
            </button>
          </div>
        )}
        {tab === 'parts' && (
          <div className="ml-auto text-xs text-slate-500">
            Cada peça é salva na hora — sem botão de salvar.
          </div>
        )}
      </div>

      {tab === 'sections' && (
        <div className="space-y-2">
          {sections.map((s, i) => (
            <div key={i} className="rounded-lg border bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <select
                  value={s.category}
                  onChange={e => updateSection(i, { category: e.target.value })}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.v} value={c.v}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  value={s.description}
                  onChange={e => updateSection(i, { description: e.target.value })}
                  placeholder="Ex: troca discos dianteiros"
                  className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button onClick={() => removeSection(i)} className="text-red-500 hover:text-red-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Horas</label>
                  <input
                    type="number"
                    step="0.5"
                    value={s.std_hours}
                    onChange={e => updateSection(i, { std_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">R$/hora</label>
                  <input
                    type="number"
                    step="0.01"
                    value={s.labor_rate}
                    onChange={e => updateSection(i, { labor_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Subtotal</label>
                  <div className="rounded bg-white px-2 py-1 text-sm font-semibold">
                    {formatBRL(s.std_hours * s.labor_rate)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="rounded-lg border-2 border-dashed bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-slate-700">
                ⚡ Modelos prontos (clique para adicionar)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_TEMPLATES.slice(0, 8).map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => addSectionTemplate(t)}
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
                  >
                    + {t.description}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => addSectionTemplate()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-600"
          >
            <Plus className="h-4 w-4" /> Adicionar serviço em branco
          </button>
        </div>
      )}

      {tab === 'parts' && (
        <div className="space-y-2">
          {parts.map(p => {
            const meta = SOURCE_LABELS[p.source];
            return (
              <div key={p.id} className="rounded-lg border bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{p.description}</span>
                  </div>
                  <button
                    onClick={() => removePart(p)}
                    disabled={removingId === p.id}
                    className="text-red-500 hover:text-red-700 disabled:opacity-40"
                  >
                    {removingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-600">
                  <span>{p.qty}x · {formatBRL(p.unit_price)}</span>
                  <span className="font-semibold text-slate-900">{formatBRL(p.qty * p.unit_price)}</span>
                </div>
              </div>
            );
          })}

          {parts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
              Nenhuma peça usada ainda
            </div>
          )}

          {/* Form de adicionar peca — acao imediata, sem "salvar" */}
          <div className="rounded-lg border-2 border-dashed border-sky-200 bg-sky-50/40 p-3">
            <div className="mb-2 flex gap-1.5">
              {(['estoque', 'terceiro', 'cliente'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewPart(emptyDraft(s))}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    newPart.source === s
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {SOURCE_LABELS[s].label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                value={newPart.description}
                onChange={e => {
                  setNewPart(d => ({ ...d, description: e.target.value, part_id: null, stockQty: undefined }));
                  setShowCatalogPicker(true);
                }}
                onFocus={() => setShowCatalogPicker(true)}
                placeholder={newPart.source === 'estoque' ? 'Buscar peça do estoque…' : 'Descrição da peça…'}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
              {newPart.source === 'estoque' && showCatalogPicker && filteredCatalog.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
                  {filteredCatalog.map(c => {
                    const qty = (c.stock_balances as any[])?.[0]?.qty ?? 0;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickFromCatalog(c)}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
                      >
                        <div>
                          <div className="font-semibold">{c.description}</div>
                          <div className="text-xs text-slate-500">{c.sku} · {formatBRL(c.sale_price)}</div>
                        </div>
                        <span className={`text-xs font-semibold ${qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {qty} un.
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {newPart.source === 'estoque' && newPart.part_id && newPart.stockQty !== undefined && newPart.stockQty < newPart.qty && (
              <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-orange-600">
                <AlertTriangle className="h-3 w-3" /> Saldo atual: {newPart.stockQty} un. — vai ficar negativo
              </div>
            )}

            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500">Qtd</label>
                <input
                  type="number"
                  step="0.001"
                  value={newPart.qty}
                  onChange={e => setNewPart(d => ({ ...d, qty: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Preço unit.</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPart.unit_price}
                  onChange={e => setNewPart(d => ({ ...d, unit_price: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Subtotal</label>
                <div className="rounded bg-white px-2 py-1 text-sm font-semibold">
                  {formatBRL(newPart.qty * newPart.unit_price)}
                </div>
              </div>
            </div>

            <button
              onClick={confirmAddPart}
              disabled={addingPart}
              className="btn-primary mt-2 w-full py-2 text-sm"
            >
              {addingPart ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {addingPart ? 'Adicionando…' : newPart.source === 'estoque' ? 'Usar peça do estoque' : 'Adicionar peça'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
