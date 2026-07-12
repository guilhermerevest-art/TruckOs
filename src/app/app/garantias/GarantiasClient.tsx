'use client';

import { useState } from 'react';
import { Plus, X, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type Claim = {
  id: string;
  part_description: string;
  failure_description: string | null;
  status: string;
  claim_value: number;
  credited_value: number | null;
  response_deadline: string | null;
  supplier: { name: string } | null;
  work_order: { number: number } | null;
};

const COLUMNS = [
  { key: 'aberto', label: 'Aberto' },
  { key: 'enviado', label: 'Enviado' },
  { key: 'em_analise', label: 'Em análise' },
  { key: 'aprovado', label: 'Aprovado' },
  { key: 'creditado', label: 'Creditado' },
];

const NEXT_STATUS: Record<string, string | null> = {
  aberto: 'enviado',
  enviado: 'em_analise',
  em_analise: 'aprovado',
  aprovado: 'creditado',
  creditado: null,
  rejeitado: null,
};

export function GarantiasClient({
  tenantId,
  initialClaims,
  suppliers,
  supplierStats,
}: {
  tenantId: string;
  initialClaims: Claim[];
  suppliers: { id: string; name: string }[];
  supplierStats: { name: string; decided: number; approved: number; totalValue: number }[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [claims, setClaims] = useState(initialClaims);
  const [modalOpen, setModalOpen] = useState(false);

  async function avancar(claim: Claim) {
    const next = NEXT_STATUS[claim.status];
    if (!next) return;
    const patch: any = { status: next };
    if (next === 'creditado') patch.credited_at = new Date().toISOString();
    const { error } = await supabase.from('warranty_claims').update(patch).eq('id', claim.id);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao mover', description: error.message });
      return;
    }
    setClaims(prev => prev.map(c => (c.id === claim.id ? { ...c, status: next } : c)));
  }

  async function rejeitar(claim: Claim) {
    const { error } = await supabase.from('warranty_claims').update({ status: 'rejeitado' }).eq('id', claim.id);
    if (error) return;
    setClaims(prev => prev.map(c => (c.id === claim.id ? { ...c, status: 'rejeitado' } : c)));
  }

  const totalCreditado = claims
    .filter(c => c.status === 'creditado')
    .reduce((a, c) => a + Number(c.credited_value ?? c.claim_value ?? 0), 0);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Central de Garantias</h1>
          <p className="text-sm text-slate-500">Dinheiro que a oficina deixa na mesa quando não formaliza pleito</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Novo pleito
        </button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="card-base p-4">
          <div className="text-sm text-slate-500">Total creditado</div>
          <div className="text-2xl font-bold text-green-600">{formatBRL(totalCreditado)}</div>
        </div>
        <div className="card-base p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Taxa de aprovação por fornecedor</div>
          <div className="space-y-1.5">
            {supplierStats.slice(0, 4).map(s => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{s.name}</span>
                <span className="font-semibold text-slate-900">
                  {s.decided > 0 ? `${Math.round((s.approved / s.decided) * 100)}%` : '—'}
                </span>
              </div>
            ))}
            {!supplierStats.length && <div className="text-xs text-slate-400">Sem dados ainda</div>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {COLUMNS.map(col => {
          const items = claims.filter(c => c.status === col.key);
          return (
            <div key={col.key} className="rounded-xl border bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">{col.label}</span>
                <span className="text-xs text-slate-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(c => (
                  <div key={c.id} className="rounded-lg border bg-white p-3 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">{c.part_description}</div>
                    <div className="text-xs text-slate-500">{c.supplier?.name ?? 'Sem fornecedor'}</div>
                    {c.work_order && <div className="text-xs text-slate-400">OS #{c.work_order.number}</div>}
                    <div className="mt-1 text-sm font-bold text-sky-700">{formatBRL(c.claim_value)}</div>
                    {c.response_deadline && (
                      <div className="text-[11px] text-slate-500">
                        Prazo: {new Date(c.response_deadline).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                    <div className="mt-2 flex gap-1">
                      {NEXT_STATUS[c.status] && (
                        <button onClick={() => avancar(c)} className="btn-secondary flex-1 py-1 text-xs">
                          Avançar
                        </button>
                      )}
                      {['enviado', 'em_analise'].includes(c.status) && (
                        <button onClick={() => rejeitar(c)} className="btn-ghost py-1 text-xs text-red-600">
                          Rejeitar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!items.length && <div className="text-center text-xs text-slate-400">Vazio</div>}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <NovoPleitoModal
          tenantId={tenantId}
          suppliers={suppliers}
          onClose={() => setModalOpen(false)}
          onCreated={c => {
            setClaims(prev => [c, ...prev]);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NovoPleitoModal({
  tenantId,
  suppliers,
  onClose,
  onCreated,
}: {
  tenantId: string;
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (c: Claim) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [partDescription, setPartDescription] = useState('');
  const [failureDescription, setFailureDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [claimValue, setClaimValue] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!partDescription.trim()) {
      toast.show({ type: 'warning', title: 'Descreva a peça' });
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('warranty_claims')
      .insert({
        tenant_id: tenantId,
        part_description: partDescription,
        failure_description: failureDescription || null,
        supplier_id: supplierId || null,
        claim_value: claimValue,
        response_deadline: deadline || null,
        created_by: user?.id,
      })
      .select('*, supplier:suppliers(name), work_order:work_orders(number)')
      .single();
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao criar pleito', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Pleito aberto' });
    onCreated(data as any);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-sky-600" /> Novo pleito de garantia
          </h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Peça</label>
            <input value={partDescription} onChange={e => setPartDescription(e.target.value)} className="input-base mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Descrição da falha</label>
            <textarea value={failureDescription} onChange={e => setFailureDescription(e.target.value)} rows={2} className="input-base mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Fornecedor</label>
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input-base mt-1 w-full">
              <option value="">—</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Valor do pleito</label>
              <input type="number" step="0.01" value={claimValue} onChange={e => setClaimValue(parseFloat(e.target.value) || 0)} className="input-base mt-1 w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Prazo de resposta</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="input-base mt-1 w-full" />
            </div>
          </div>
          <button onClick={salvar} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir pleito'}
          </button>
        </div>
      </div>
    </div>
  );
}
