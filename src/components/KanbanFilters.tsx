'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, X } from 'lucide-react';

export type KanbanFilterState = {
  priority?: string;
  customer?: string;
  search?: string;
};

export function KanbanFilters({
  value,
  onChange,
}: {
  value: KanbanFilterState;
  onChange: (f: KanbanFilterState) => void;
}) {
  const supabase = createClient();
  const [customers, setCustomers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('customers')
      .select('id, name')
      .order('name')
      .limit(200)
      .then(({ data }) => setCustomers(data ?? []));
  }, [supabase]);

  function patch(p: Partial<KanbanFilterState>) {
    onChange({ ...value, ...p });
  }

  function clear() {
    onChange({});
  }

  const hasFilter = value.priority || value.customer;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="btn-secondary text-xs"
        >
          Mais filtros
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border bg-white p-3 shadow-lg space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Prioridade</label>
                <select
                  value={value.priority ?? ''}
                  onChange={e => patch({ priority: e.target.value || undefined })}
                  className="input-base mt-1 text-sm"
                >
                  <option value="">Todas</option>
                  <option value="urgente">Urgente</option>
                  <option value="alta">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cliente</label>
                <select
                  value={value.customer ?? ''}
                  onChange={e => patch({ customer: e.target.value || undefined })}
                  className="input-base mt-1 text-sm"
                >
                  <option value="">Todos</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>
      {hasFilter && (
        <button onClick={clear} className="btn-ghost text-xs">
          <X className="h-3 w-3" /> Limpar filtros
        </button>
      )}
    </div>
  );
}
