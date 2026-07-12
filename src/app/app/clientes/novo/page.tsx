import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function NewCustomerPage() {
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

    const tagsRaw = String(formData.get('tags') ?? '');
    const tags = tagsRaw
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const { data: customer, error } = await admin
      .from('customers')
      .insert({
        tenant_id: tenant.id,
        type: formData.get('type'),
        name: formData.get('name'),
        trade_name: formData.get('trade_name') || null,
        document: formData.get('document') || null,
        email: formData.get('email') || null,
        payment_terms: parseInt(String(formData.get('payment_terms') ?? '0')) || 0,
        tags,
        notes: formData.get('notes') || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // contato principal (telefone/WhatsApp)
    const phone = String(formData.get('phone') ?? '');
    if (phone) {
      await admin.from('customer_contacts').insert({
        tenant_id: tenant.id,
        customer_id: customer.id,
        name: 'Principal',
        role: 'dono',
        phone_e164: phone.startsWith('+') ? phone : `+55${phone.replace(/\D/g, '')}`,
        whatsapp: true,
        can_approve: true,
      });
    }

    redirect(`/app/clientes/${customer.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Novo cliente</h1>
      <p className="text-sm text-slate-500">
        Caminhoneiro autonomo ou transportadora — o cadastro serve pros dois.
      </p>

      <form action={create} className="mt-6 space-y-5">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Tipo</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: 'pf', label: 'Pessoa Fisica', desc: 'Caminhoneiro autonomo' },
              { v: 'pj', label: 'Pessoa Juridica', desc: 'Transportadora / frota' },
            ].map(opt => (
              <label
                key={opt.v}
                className="cursor-pointer rounded-lg border-2 border-slate-200 p-3 transition hover:border-sky-400 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50"
              >
                <input type="radio" name="type" value={opt.v} required className="sr-only" defaultChecked={opt.v === 'pj'} />
                <div className="font-bold text-slate-900">{opt.label}</div>
                <div className="text-xs text-slate-500">{opt.desc}</div>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Dados basicos</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Nome / Razao social *</label>
              <input
                name="name"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Nome fantasia</label>
              <input
                name="trade_name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">CPF / CNPJ</label>
              <input
                name="document"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                name="email"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">WhatsApp</label>
              <input
                name="phone"
                placeholder="11999998888"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Condicoes comerciais</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Prazo de faturamento (dias)</label>
              <select
                name="payment_terms"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
                defaultValue="0"
              >
                <option value="0">A vista</option>
                <option value="15">15 dias</option>
                <option value="30">30 dias</option>
                <option value="45">45 dias</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Etiquetas (separadas por virgula)</label>
              <input
                name="tags"
                placeholder="frota, vip, agro"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Observacoes</label>
          <textarea
            name="notes"
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>

        <div className="flex justify-end gap-2">
          <a
            href="/app/clientes"
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </a>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Criar cliente
          </button>
        </div>
      </form>
    </div>
  );
}