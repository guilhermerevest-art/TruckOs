import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export default async function NewPartPage() {
  async function create(formData: FormData) {
    'use server';
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1)
      .single();
    if (!membership) throw new Error('tenant_not_found');
    const tenant = { id: membership.tenant_id };

    const salePrice = parseFloat(String(formData.get('sale_price') ?? '0')) || 0;
    const avgCost = parseFloat(String(formData.get('avg_cost') ?? '0')) || 0;
    const margin = salePrice > 0 ? ((salePrice - avgCost) / salePrice) * 100 : 0;

    const { data: part, error } = await admin
      .from('parts')
      .insert({
        tenant_id: tenant.id,
        sku: formData.get('sku'),
        barcode: formData.get('barcode') || null,
        description: formData.get('description'),
        brand: formData.get('brand') || null,
        category: formData.get('category') || null,
        unit: formData.get('unit') || 'UN',
        min_qty: parseFloat(String(formData.get('min_qty') ?? '0')) || 0,
        max_qty: parseFloat(String(formData.get('max_qty') ?? '0')) || 0,
        avg_cost: avgCost,
        sale_price: salePrice,
        margin_pct: margin,
        location: formData.get('location') || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Cria saldo inicial no warehouse padrao
    const initialQty = parseFloat(String(formData.get('initial_qty') ?? '0')) || 0;
    if (initialQty > 0) {
      const { data: warehouse } = await admin
        .from('warehouses')
        .select('id')
        .eq('tenant_id', tenant.id)
        .limit(1)
        .single();
      if (warehouse) {
        await admin.from('stock_balances').insert({
          tenant_id: tenant.id,
          warehouse_id: warehouse.id,
          part_id: part.id,
          qty: initialQty,
        });
        if (avgCost > 0) {
          await admin.from('stock_moves').insert({
            tenant_id: tenant.id,
            warehouse_id: warehouse.id,
            part_id: part.id,
            kind: 'entrada_nf',
            qty: initialQty,
            unit_cost: avgCost,
            note: 'Estoque inicial',
          });
        }
      }
    }

    redirect('/app/estoque');
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Nova peca</h1>

      <form action={create} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">SKU *</label>
            <input
              name="sku"
              required
              placeholder="DISCO-FREIO-001"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Codigo de barras</label>
            <input
              name="barcode"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Descricao *</label>
          <input
            name="description"
            required
            placeholder="Disco de freio dianteiro Scania R450"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Marca</label>
            <input
              name="brand"
              placeholder="TRW"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Categoria</label>
            <input
              name="category"
              placeholder="freios, motor, suspensao..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Unidade</label>
            <select
              name="unit"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
              defaultValue="UN"
            >
              <option>UN</option>
              <option>JG</option>
              <option>LT</option>
              <option>KG</option>
              <option>MT</option>
              <option>PC</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Localizacao</label>
            <input
              name="location"
              placeholder="A-12"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Estoque inicial</label>
            <input
              type="number"
              name="initial_qty"
              defaultValue="0"
              step="0.001"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Estoque minimo</label>
            <input
              type="number"
              name="min_qty"
              defaultValue="0"
              step="0.001"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Estoque maximo</label>
            <input
              type="number"
              name="max_qty"
              defaultValue="0"
              step="0.001"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Custo medio (R$)</label>
            <input
              type="number"
              name="avg_cost"
              defaultValue="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Preco de venda (R$)</label>
            <input
              type="number"
              name="sale_price"
              defaultValue="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <a
            href="/app/estoque"
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </a>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Criar peca
          </button>
        </div>
      </form>
    </div>
  );
}