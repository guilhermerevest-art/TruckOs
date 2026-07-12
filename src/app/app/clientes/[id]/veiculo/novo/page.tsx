import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export default async function NewVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: customerId } = await params;

  async function create(formData: FormData) {
    'use server';
    const admin = createAdminClient();
    const { data: customer } = await admin
      .from('customers')
      .select('tenant_id')
      .eq('id', customerId)
      .single();
    if (!customer) throw new Error('customer_not_found');

    const { data: vehicle } = await admin
      .from('vehicles')
      .insert({
        tenant_id: customer.tenant_id,
        customer_id: customerId,
        plate: String(formData.get('plate') ?? '').toUpperCase(),
        vin: formData.get('vin') || null,
        brand: formData.get('brand') || null,
        model: formData.get('model') || null,
        year: parseInt(String(formData.get('year') ?? '')) || null,
        vehicle_type: formData.get('vehicle_type'),
        axles: parseInt(String(formData.get('axles') ?? '2')) || 2,
        odometer_km: parseInt(String(formData.get('odometer_km') ?? '0')) || 0,
      })
      .select()
      .single();

    redirect(`/app/clientes/${customerId}`);
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Adicionar veiculo</h1>

      <form action={create} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Placa *</label>
            <input
              name="plate"
              required
              placeholder="ABC1D34"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Tipo *</label>
            <select
              name="vehicle_type"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
            >
              <option value="cavalo">Cavalo</option>
              <option value="truck">Truck</option>
              <option value="toco">Toco</option>
              <option value="carreta">Carreta</option>
              <option value="bitrem">Bitrem</option>
              <option value="onibus">Onibus</option>
              <option value="maquina">Maquina agricola</option>
              <option value="utilitario">Utilitario</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Marca</label>
            <input
              name="brand"
              placeholder="Scania"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Modelo</label>
            <input
              name="model"
              placeholder="R450"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Ano</label>
            <input
              type="number"
              name="year"
              placeholder="2022"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Eixos</label>
            <input
              type="number"
              name="axles"
              defaultValue="3"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Hodometro (km)</label>
            <input
              type="number"
              name="odometer_km"
              defaultValue="0"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">VIN/Chassi</label>
            <input
              name="vin"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <a
            href={`/app/clientes/${customerId}`}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </a>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Adicionar veiculo
          </button>
        </div>
      </form>
    </div>
  );
}