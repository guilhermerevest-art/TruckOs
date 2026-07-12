import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLaudo } from '@/lib/ai/laudo';

export async function POST(req: Request) {
  const { workOrderId, sectionId, transcript } = await req.json();
  if (!workOrderId || !transcript?.trim()) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: wo } = await supabase
    .from('work_orders')
    .select('tenant_id, vehicle:vehicles(plate, brand, model)')
    .eq('id', workOrderId)
    .single();
  if (!wo) return NextResponse.json({ error: 'work_order_not_found' }, { status: 404 });

  const vehicle = wo.vehicle as any;
  const vehicleSummary = vehicle ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model}` : 'veiculo pesado';

  let laudo;
  try {
    laudo = await generateLaudo(transcript, vehicleSummary);
  } catch {
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'Nao foi possivel gerar o laudo agora. Edite manualmente.' },
      { status: 200 },
    );
  }

  const { data: report, error } = await supabase
    .from('wo_reports')
    .insert({
      tenant_id: wo.tenant_id,
      work_order_id: workOrderId,
      section_id: sectionId ?? null,
      transcript,
      laudo_tecnico: laudo.tecnico,
      laudo_cliente: laudo.cliente,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ report });
}
