import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Building2, Users, Plug, FileText } from 'lucide-react';
import Link from 'next/link';

export default async function AdminPage() {
  const supabase = await createClient();

  async function updateTenant(formData: FormData) {
    'use server';
    const admin = createAdminClient();
    await admin
      .from('tenants')
      .update({
        name: formData.get('name'),
        brand_color: formData.get('brand_color'),
        cnpj: formData.get('cnpj') || null,
      })
      .eq('id', formData.get('tenant_id'));
    redirect('/app/admin');
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, cnpj, brand_color, status, plan, trial_ends_at')
    .single();

  const { data: members } = await supabase
    .from('tenant_members')
    .select('id, role, hourly_cost, active, user_id')
    .order('created_at');

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Configuracoes</h1>
        <p className="text-sm text-slate-500">Oficina, equipe e integracoes</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Dados da oficina */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">Oficina</h2>
          </div>
          <form action={updateTenant} className="space-y-3">
            <input type="hidden" name="tenant_id" defaultValue={tenant?.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700">Nome</label>
              <input
                name="name"
                defaultValue={tenant?.name}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">CNPJ</label>
              <input
                name="cnpj"
                defaultValue={tenant?.cnpj ?? ''}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Cor da marca</label>
              <input
                type="color"
                name="brand_color"
                defaultValue={tenant?.brand_color ?? '#0EA5E9'}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300"
              />
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Slug:</span>
                <span className="font-mono">{tenant?.slug}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate-500">Plano:</span>
                <span className="font-semibold">{tenant?.plan}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold">{tenant?.status}</span>
              </div>
              {tenant?.trial_ends_at && (
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-500">Trial ate:</span>
                  <span>{new Date(tenant.trial_ends_at).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Salvar alteracoes
            </button>
          </form>
        </div>

        {/* Equipe */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">Equipe ({members?.length ?? 0})</h2>
          </div>
          <div className="space-y-2">
            {members?.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <div>
                  <div className="font-mono text-xs text-slate-500">{m.user_id.slice(0, 8)}</div>
                  <div className="text-sm font-semibold capitalize text-slate-900">{m.role}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    m.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {m.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Convite de equipe via /signup (mesmo email = novo membro no tenant).
          </p>
        </div>

        {/* Integracoes */}
        <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Plug className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">Integracoes</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <IntegrationCard
              name="WhatsApp (Evolution API)"
              desc="Conectar numero da oficina"
              configured={false}
            />
            <IntegrationCard
              name="Stripe"
              desc="Receber pagamento de clientes finais"
              configured={false}
            />
            <IntegrationCard
              name="Focus NFe"
              desc="Emissao de NFS-e e NF-e"
              configured={false}
            />
          </div>
        </div>

        {/* Templates WhatsApp */}
        <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">Templates de mensagem</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Mensagens automaticas enviadas pelo sistema. Edite as globais ou crie overrides por oficina.
          </p>
          <Link
            href="/app/admin/templates"
            className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ver templates →
          </Link>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  name,
  desc,
  configured,
}: {
  name: string;
  desc: string;
  configured: boolean;
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="font-semibold text-slate-900">{name}</div>
      <div className="text-xs text-slate-500">{desc}</div>
      <div className="mt-2 flex items-center justify-between">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            configured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {configured ? 'Conectado' : 'Nao configurado'}
        </span>
        <button className="text-xs font-semibold text-sky-600 hover:underline">
          {configured ? 'Gerenciar' : 'Configurar'}
        </button>
      </div>
    </div>
  );
}