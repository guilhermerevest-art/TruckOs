import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { ClienteFormFields } from './ClienteFormFields';

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;

  async function create(formData: FormData) {
    'use server';
    try {
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

      if (!membership) {
        redirect(
          '/app/clientes/novo?error=' +
            encodeURIComponent('Não encontramos uma oficina ativa vinculada à sua conta. Saia e entre novamente ou fale com o suporte.'),
        );
      }
      const tenant = { id: membership.tenant_id };

      const name = String(formData.get('name') ?? '').trim();
      if (!name) {
        redirect('/app/clientes/novo?error=' + encodeURIComponent('Informe o nome ou razão social.'));
      }

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
          name,
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

      if (error) {
        console.error('Erro ao criar cliente:', error);
        redirect('/app/clientes/novo?error=' + encodeURIComponent('Não foi possível salvar o cliente. Confira os dados e tente de novo.'));
      }

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
    } catch (err) {
      // redirect() do Next lanca uma excecao especial pra funcionar — deixa passar.
      if (err && typeof err === 'object' && 'digest' in err && String((err as any).digest).startsWith('NEXT_REDIRECT')) {
        throw err;
      }
      console.error('Erro inesperado ao criar cliente:', err);
      redirect('/app/clientes/novo?error=' + encodeURIComponent('Erro inesperado ao criar cliente. Tente novamente.'));
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Novo cliente</h1>
      <p className="text-sm text-slate-500">
        Caminhoneiro autonomo ou transportadora — o cadastro serve pros dois.
      </p>

      {errorMessage && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      <form action={create} className="mt-6 space-y-5">
        <ClienteFormFields />

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