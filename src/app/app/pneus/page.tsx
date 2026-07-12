import { createClient } from '@/lib/supabase/server';
import { PneusClient } from './PneusClient';

export default async function PneusPage() {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('id').single();

  const [{ data: vehicles }, { data: tires }, { data: positions }, { data: events }] = await Promise.all([
    supabase.from('vehicles').select('id, plate, brand, model, axles').order('plate'),
    supabase.from('tires').select('*').order('fire_number'),
    supabase.from('tire_positions').select('*').is('removed_at', null),
    supabase.from('tire_events').select('*').eq('kind', 'recapagem_recebida'),
  ]);

  return (
    <PneusClient
      tenantId={tenant?.id ?? ''}
      vehicles={vehicles ?? []}
      initialTires={tires ?? []}
      initialPositions={positions ?? []}
      recapEvents={events ?? []}
    />
  );
}
