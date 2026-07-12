'use client';

import { useState } from 'react';
import { Search, Plus, X, Loader2, MapPin, Package, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/utils';

type Listing = {
  id: string;
  description: string;
  brand: string | null;
  qty: number;
  unit_price: number;
  city: string | null;
  state: string | null;
  seller_name: string | null;
  status: string;
};

type Order = {
  id: string;
  qty: number;
  agreed_price: number;
  status: string;
  payment_status: string;
  listing: { description: string; seller_name: string | null } | null;
};

export function MarketplaceClient({
  tenantId,
  allListings,
  myListings,
  myOrders,
}: {
  tenantId: string;
  allListings: Listing[];
  myListings: Listing[];
  myOrders: Order[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [tab, setTab] = useState<'buscar' | 'minhas' | 'pedidos'>('buscar');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [newListingOpen, setNewListingOpen] = useState(false);
  const [listings, setListings] = useState(myListings);

  const filtered = allListings.filter(l => {
    const matchesQuery = !query || l.description.toLowerCase().includes(query.toLowerCase()) || l.brand?.toLowerCase().includes(query.toLowerCase());
    const matchesState = !stateFilter || l.state === stateFilter;
    return matchesQuery && matchesState;
  });

  async function comprar(listing: Listing) {
    const { error } = await supabase.rpc('create_marketplace_order', { p_listing_id: listing.id, p_qty: 1 });
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao solicitar', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Pedido enviado', description: 'Combine os detalhes com o vendedor pelo pedido.' });
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketplace de Peças</h1>
          <p className="text-sm text-slate-500">A peça parada de uma oficina é a emergência da outra</p>
        </div>
        <button onClick={() => setNewListingOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Publicar peça
        </button>
      </div>

      <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Pagamento ainda é combinado direto entre as oficinas — a intermediação de pagamento pela
        TruckOS depende de integração com um parceiro de pagamentos, ainda não configurada.
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {(['buscar', 'minhas', 'pedidos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize ${
              tab === t ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            {t === 'minhas' ? 'Minhas publicações' : t === 'pedidos' ? 'Meus pedidos' : 'Buscar'}
          </button>
        ))}
      </div>

      {tab === 'buscar' && (
        <div>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar peça ou marca…" className="input-base w-full pl-9" />
            </div>
            <input value={stateFilter} onChange={e => setStateFilter(e.target.value.toUpperCase())} placeholder="UF" maxLength={2} className="input-base w-20" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {filtered.map(l => (
              <div key={l.id} className="card-base p-4">
                <div className="font-bold text-slate-900">{l.description}</div>
                <div className="text-xs text-slate-500">{l.brand}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" /> {l.city ?? '—'}/{l.state ?? '—'} · {l.seller_name}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold text-sky-700">{formatBRL(l.unit_price)}</span>
                  <span className="text-xs text-slate-500">{l.qty} un.</span>
                </div>
                <button onClick={() => comprar(l)} className="btn-primary mt-2 w-full py-1.5 text-sm">
                  <Package className="h-4 w-4" /> Solicitar
                </button>
              </div>
            ))}
            {!filtered.length && <div className="empty-state md:col-span-3">Nenhuma peça encontrada.</div>}
          </div>
        </div>
      )}

      {tab === 'minhas' && (
        <div className="grid gap-3 md:grid-cols-3">
          {listings.map(l => (
            <div key={l.id} className="card-base p-4">
              <div className="font-bold text-slate-900">{l.description}</div>
              <div className="text-xs text-slate-500">{l.brand} · {l.qty} un.</div>
              <div className="mt-1 font-bold text-sky-700">{formatBRL(l.unit_price)}</div>
              <span className="badge badge-neutral mt-1">{l.status}</span>
            </div>
          ))}
          {!listings.length && <div className="empty-state md:col-span-3">Você ainda não publicou peças.</div>}
        </div>
      )}

      {tab === 'pedidos' && (
        <div className="space-y-2">
          {myOrders.map(o => (
            <OrderRow key={o.id} order={o} tenantId={tenantId} />
          ))}
          {!myOrders.length && <div className="empty-state">Nenhum pedido ainda.</div>}
        </div>
      )}

      {newListingOpen && (
        <NewListingModal
          tenantId={tenantId}
          onClose={() => setNewListingOpen(false)}
          onCreated={l => {
            setListings(prev => [l, ...prev]);
            setNewListingOpen(false);
          }}
        />
      )}
    </div>
  );
}

function OrderRow({ order, tenantId }: { order: Order; tenantId: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const toast = useToast();

  async function abrir() {
    setOpen(o => !o);
    if (!open) {
      const { data } = await supabase.from('marketplace_messages').select('*').eq('order_id', order.id).order('created_at');
      setMessages(data ?? []);
    }
  }

  async function enviar() {
    if (!msg.trim()) return;
    const { data, error } = await supabase
      .from('marketplace_messages')
      .insert({ order_id: order.id, sender_tenant_id: tenantId, message: msg })
      .select()
      .single();
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao enviar', description: error.message });
      return;
    }
    setMessages(prev => [...prev, data]);
    setMsg('');
  }

  async function avancar(status: string) {
    await supabase.from('marketplace_orders').update({ status }).eq('id', order.id);
    toast.show({ type: 'success', title: `Pedido marcado como ${status}` });
  }

  return (
    <div className="card-base p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900">{order.listing?.description}</div>
          <div className="text-xs text-slate-500">{order.listing?.seller_name} · {formatBRL(order.agreed_price)}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">{order.status}</span>
          <button onClick={abrir} className="btn-ghost text-xs"><MessageSquare className="h-4 w-4" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {['aceito', 'enviado', 'recebido', 'cancelado'].map(s => (
              <button key={s} onClick={() => avancar(s)} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50">
                {s}
              </button>
            ))}
          </div>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded bg-slate-50 p-2">
            {messages.map(m => (
              <div key={m.id} className="text-xs">
                <span className="font-semibold">{m.sender_name}:</span> {m.message}
              </div>
            ))}
            {!messages.length && <div className="text-xs text-slate-400">Sem mensagens ainda.</div>}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={msg} onChange={e => setMsg(e.target.value)} className="input-base flex-1 text-sm" placeholder="Mensagem…" />
            <button onClick={enviar} className="btn-secondary text-sm">Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewListingModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (l: Listing) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!description.trim() || price <= 0) {
      toast.show({ type: 'warning', title: 'Preencha descrição e preço' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('marketplace_listings')
      .insert({ tenant_id: tenantId, description, brand: brand || null, qty, unit_price: price, city: city || null, state: state || null })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao publicar', description: error.message });
      return;
    }
    toast.show({ type: 'success', title: 'Peça publicada' });
    onCreated(data as any);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Publicar peça</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição da peça" className="input-base w-full" />
          <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Marca" className="input-base w-full" />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 1)} placeholder="Qtd" className="input-base w-full" />
            <input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} placeholder="Preço unit." className="input-base w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" className="input-base w-full" />
            <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="UF" className="input-base w-full" />
          </div>
          <button onClick={salvar} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
