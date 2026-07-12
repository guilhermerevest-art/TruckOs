// Orcamento por foto: recebe uma foto do componente, chama a IA com visao,
// cruza com o catalogo de pecas do tenant e devolve um rascunho para o
// consultor aprovar item a item. Nada e enviado ao cliente automaticamente.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzePhotoForQuote } from '@/lib/ai/orcamentoFoto';

export async function POST(req: Request) {
  const { workOrderId, imageBase64, mediaType } = await req.json();

  if (!workOrderId || !imageBase64) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, tenant_id, vehicle:vehicles(plate, brand, model, year, vehicle_type)')
    .eq('id', workOrderId)
    .single();

  if (!wo) return NextResponse.json({ error: 'work_order_not_found' }, { status: 404 });

  const vehicle = wo.vehicle as any;
  const vehicleSummary = vehicle
    ? `${vehicle.plate} — ${vehicle.brand} ${vehicle.model} ${vehicle.year ?? ''} (${vehicle.vehicle_type ?? 'pesado'})`
    : 'veiculo pesado';

  const { data: parts } = await supabase
    .from('parts')
    .select('id, sku, description, category, sale_price')
    .limit(200);

  const partIds = (parts ?? []).map(p => p.id);
  const { data: balances } = partIds.length
    ? await supabase.from('stock_balances').select('part_id, qty').in('part_id', partIds)
    : { data: [] as { part_id: string; qty: number }[] };

  const saldoByPart = new Map<string, number>();
  (balances ?? []).forEach(b => {
    saldoByPart.set(b.part_id, (saldoByPart.get(b.part_id) ?? 0) + Number(b.qty));
  });

  let suggestion;
  try {
    suggestion = await analyzePhotoForQuote({
      imageBase64,
      mediaType: mediaType ?? 'image/jpeg',
      vehicleSummary,
      partsCatalog: parts ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'Nao foi possivel analisar a foto agora. Preencha manualmente.' },
      { status: 200 },
    );
  }

  // Sobe a foto pro storage e registra em wo_media (mesmo padrao do PhotoCapture)
  const ext = (mediaType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
  const path = `${wo.tenant_id}/${workOrderId}/orcamento-foto-${Date.now()}.${ext}`;
  const buffer = Buffer.from(imageBase64, 'base64');

  await supabase.storage.from('wo-media').upload(path, buffer, { contentType: mediaType ?? 'image/jpeg' });
  await supabase.from('wo_media').insert({
    tenant_id: wo.tenant_id,
    work_order_id: workOrderId,
    kind: 'foto_servico',
    storage_path: path,
    caption: `IA: ${suggestion.componente} (${suggestion.confianca}% confianca)`,
    uploaded_by: user.id,
  });
  const { data: pub } = supabase.storage.from('wo-media').getPublicUrl(path);

  const pecasComSaldo = suggestion.pecas_sugeridas.map(p => ({
    ...p,
    saldo: p.part_id ? saldoByPart.get(p.part_id) ?? 0 : null,
    sale_price: p.part_id ? (parts ?? []).find(cp => cp.id === p.part_id)?.sale_price ?? null : null,
  }));

  return NextResponse.json({
    suggestion: { ...suggestion, pecas_sugeridas: pecasComSaldo },
    photoUrl: pub.publicUrl,
  });
}
