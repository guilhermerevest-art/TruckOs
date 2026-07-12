'use client';

import { useState } from 'react';
import { Building2, Search, Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type UnitStat = {
  tenant_id: string;
  tenant_name: string;
  os_abertas: number;
  faturamento_mes: number;
  ticket_medio: number;
  clientes: number;
};

type PriceRow = { id: string; sku: string | null; description: string; corporate_price: number };

export function GrupoClient({
  groupId,
  isAdmin,
  dashboard,
  priceList,
}: {
  groupId: string;
  isAdmin: boolean;
  dashboard: UnitStat[];
  priceList: PriceRow[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [document, setDocument] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<any[] | null>(null);

  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState(0);
  const [prices, setPrices] = useState(priceList);

  const totalFat = dashboard.reduce((a, u) => a + Number(u.faturamento_mes), 0);
  const maxFat = Math.max(1, ...dashboard.map(u => Number(u.faturamento_mes)));

  async function buscarCliente() {
    if (!document.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.rpc('group_search_customer', { p_document: document.trim() });
    setSearching(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro na busca', description: error.message });
      return;
    }
    setMatches(data ?? []);
  }

  async function addPrice() {
    if (!newDesc.trim()) return;
    const { data, error } = await supabase
      .from('group_price_lists')
      .insert({ group_id: groupId, description: newDesc, corporate_price: newPrice })
      .select()
      .single();
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao adicionar', description: error.message });
      return;
    }
    setPrices(prev => [...prev, data as any]);
    setNewDesc('');
    setNewPrice(0);
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-2">
        <Building2 className="h-6 w-6 text-sky-600" />
        <h1 className="text-2xl font-bold text-slate-900">Grupo / Rede</h1>
      </div>

      {isAdmin && (
        <div className="mb-6">
          <div className="mb-3 card-base p-4">
            <div className="text-sm text-slate-500">Faturamento consolidado do mês</div>
            <div className="text-2xl font-bold text-green-600">{formatBRL(totalFat)}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dashboard.map(u => (
              <div key={u.tenant_id} className="card-base p-4">
                <div className="font-bold text-slate-900">{u.tenant_name}</div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${(Number(u.faturamento_mes) / maxFat) * 100}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>Faturamento: <span className="font-semibold text-slate-900">{formatBRL(u.faturamento_mes)}</span></div>
                  <div>Ticket médio: <span className="font-semibold text-slate-900">{formatBRL(u.ticket_medio)}</span></div>
                  <div>OS abertas: <span className="font-semibold text-slate-900">{u.os_abertas}</span></div>
                  <div>Clientes: <span className="font-semibold text-slate-900">{u.clientes}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-base p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <Search className="h-4 w-4" /> Cliente já atendido em outra unidade?
          </h2>
          <div className="flex gap-2">
            <input
              value={document}
              onChange={e => setDocument(e.target.value)}
              placeholder="CNPJ/CPF do cliente"
              className="input-base flex-1"
            />
            <button onClick={buscarCliente} disabled={searching} className="btn-primary">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </button>
          </div>
          {matches && (
            <div className="mt-3 space-y-2">
              {matches.map((m, i) => (
                <div key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="font-semibold text-slate-900">{m.customer_name}</div>
                  <div className="text-xs text-slate-500">{m.tenant_name} · {m.total_os} OS no histórico</div>
                </div>
              ))}
              {!matches.length && <div className="text-sm text-slate-500">Nenhum registro nas outras unidades.</div>}
            </div>
          )}
        </div>

        <div className="card-base p-5">
          <h2 className="mb-3 font-bold text-slate-900">Tabela de preços corporativa</h2>
          <div className="mb-3 max-h-48 space-y-1 overflow-y-auto">
            {prices.map(p => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-slate-700">{p.description}</span>
                <span className="font-semibold text-slate-900">{formatBRL(p.corporate_price)}</span>
              </div>
            ))}
            {!prices.length && <div className="text-sm text-slate-500">Nenhum preço corporativo definido.</div>}
          </div>
          {isAdmin && (
            <div className="flex gap-2 border-t pt-3">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição" className="input-base flex-1 text-sm" />
              <input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(parseFloat(e.target.value) || 0)} className="input-base w-24 text-sm" />
              <button onClick={addPrice} className="btn-secondary"><Plus className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
