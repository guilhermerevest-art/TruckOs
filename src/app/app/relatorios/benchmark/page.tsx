import { createClient } from '@/lib/supabase/server';
import { BenchmarkClient } from './BenchmarkClient';

export default async function BenchmarkPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id, plan, benchmark_opt_in').single();

  let initialData = null;
  if (tenant) {
    const { data } = await supabase.rpc('tenant_benchmark', { p_tenant_id: tenant.id });
    initialData = data;
  }

  return (
    <BenchmarkClient
      tenantId={tenant?.id ?? ''}
      plan={tenant?.plan ?? 'starter'}
      optIn={tenant?.benchmark_opt_in ?? false}
      initialData={initialData}
    />
  );
}
