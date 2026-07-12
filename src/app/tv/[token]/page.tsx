// Modo Patio: TV/monitor da oficina — somente leitura, sem login.
// Token de dispositivo por tenant (tenants.tv_token), nao expira sozinho.
import { createClient } from '@/lib/supabase/client';
import { TvClient, type TvSnapshot } from './TvClient';

export default async function TvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createClient();

  const { data } = await supabase.rpc('tv_snapshot', { p_token: token });

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Link invalido</h1>
          <p className="mt-2 text-slate-400">
            Gere um novo link do Modo Patio em Configuracoes.
          </p>
        </div>
      </main>
    );
  }

  return <TvClient token={token} initial={data as TvSnapshot} />;
}
