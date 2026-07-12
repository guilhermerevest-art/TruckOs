'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Wrench,
  Users,
  Package,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Hit = {
  id: string;
  type: 'wo' | 'cliente' | 'peca';
  title: string;
  subtitle: string;
  href: string;
};

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  // Atalho Cmd/Ctrl+K — abre direto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (!typing && e.key === '/' && !open) {
        // '/' fora de inputs também abre (atalho)
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!q || q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      const term = `%${q}%`;
      const numQ = parseInt(q);

      const [osRes, cliRes, pecasRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id, number, status, customer:customers(name), vehicle:vehicles(plate)')
          .or(
            `number.eq.${Number.isFinite(numQ) ? numQ : -1},reported_issue.ilike.${term},customer.name.ilike.${term}`,
          )
          .limit(6),
        supabase
          .from('customers')
          .select('id, name, document')
          .or(`name.ilike.${term},document.ilike.${term},trade_name.ilike.${term}`)
          .limit(6),
        supabase
          .from('parts')
          .select('id, sku, description')
          .or(`description.ilike.${term},sku.ilike.${term}`)
          .limit(6),
      ]);

      const out: Hit[] = [];
      osRes.data?.forEach(o => {
        const wo = o as any;
        out.push({
          id: wo.id,
          type: 'wo',
          title: `OS #${wo.number}`,
          subtitle: `${wo.customer?.name} · ${wo.vehicle?.plate} · ${wo.status}`,
          href: `/app/os/${wo.id}`,
        });
      });
      cliRes.data?.forEach((c: any) => {
        out.push({
          id: c.id,
          type: 'cliente',
          title: c.name,
          subtitle: c.document ?? c.trade_name ?? '',
          href: `/app/clientes/${c.id}`,
        });
      });
      pecasRes.data?.forEach((p: any) => {
        out.push({
          id: p.id,
          type: 'peca',
          title: p.description,
          subtitle: p.sku,
          href: `/app/estoque?q=${p.sku}`,
        });
      });

      setHits(out);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(href: string) {
    router.push(href);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && hits[0]) {
      e.preventDefault();
      go(hits[0].href);
    }
  }

  const ICONS = { wo: Wrench, cliente: Users, peca: Package };
  const TYPE_LABELS = { wo: 'OS', cliente: 'Cliente', peca: 'Peça' };
  const TYPE_COLORS = {
    wo: 'bg-sky-100 text-sky-700',
    cliente: 'bg-emerald-100 text-emerald-700',
    peca: 'bg-amber-100 text-amber-700',
  };

  return (
    <>
      {/* Botão discreto no canto inferior esquerdo — só pra mouse */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-30 hidden items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-md transition hover:border-sky-300 hover:text-sky-700 md:inline-flex"
        title="Buscar (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        Buscar
        <kbd className="kbd ml-1">Ctrl K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKey}
                autoFocus
                placeholder="Buscar OS, cliente ou peça…"
                className="flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <kbd className="kbd">esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!q && (
                <div className="space-y-2 p-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-700">Dicas rápidas</div>
                  <div>• Digite o <strong>nº da OS</strong>, placa, nome do cliente ou descrição da peça</div>
                  <div>• <kbd className="kbd">↑↓</kbd> navega · <kbd className="kbd">Enter</kbd> abre</div>
                </div>
              )}
              {q && q.length >= 2 && !hits.length && !loading && (
                <div className="p-6 text-center text-sm text-slate-500">
                  Nada encontrado para &ldquo;{q}&rdquo;
                </div>
              )}
              {hits.map((h, i) => {
                const Icon = ICONS[h.type];
                return (
                  <button
                    key={`${h.type}-${h.id}`}
                    onClick={() => go(h.href)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      i === 0 ? 'bg-sky-50' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{h.title}</div>
                      <div className="truncate text-xs text-slate-500">{h.subtitle}</div>
                    </div>
                    <span className={`badge ${TYPE_COLORS[h.type]}`}>{TYPE_LABELS[h.type]}</span>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
