// Exportacao Contador: ZIP mensal com faturamento, comissoes, contas a
// pagar e XMLs fiscais disponiveis — pronto para mandar no dia 1o.
import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/csv';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mes = searchParams.get('mes'); // YYYY-MM
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'parametro mes invalido (YYYY-MM)' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: tenant } = await supabase.from('tenants').select('id, name').single();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const { data: membership } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .single();
  if (!membership || !['owner', 'manager', 'finance'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const start = new Date(`${mes}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const [{ data: invoices }, { data: commissions }, { data: payables }, { data: fiscal }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, kind, amount, paid_amount, payment_method, status, paid_at, customer:customers(name)')
      .gte('paid_at', start.toISOString())
      .lt('paid_at', end.toISOString()),
    supabase
      .from('commissions')
      .select('id, base, amount, status, period, paid_at, member_id')
      .gte('period', start.toISOString().slice(0, 10))
      .lt('period', end.toISOString().slice(0, 10)),
    supabase
      .from('payables')
      .select('id, description, category, amount, status, due_date, paid_at')
      .gte('due_date', start.toISOString().slice(0, 10))
      .lt('due_date', end.toISOString().slice(0, 10)),
    supabase
      .from('fiscal_documents')
      .select('number, kind, status, amount, xml_url, issued_at')
      .gte('issued_at', start.toISOString())
      .lt('issued_at', end.toISOString()),
  ]);

  const zip = new JSZip();

  zip.file(
    'faturamento.csv',
    toCsv(
      ['id', 'tipo', 'cliente', 'valor', 'valor_pago', 'forma_pagamento', 'status', 'pago_em'],
      (invoices ?? []).map(i => [
        i.id,
        i.kind,
        (i.customer as any)?.name ?? '',
        Number(i.amount).toFixed(2),
        Number(i.paid_amount ?? 0).toFixed(2),
        i.payment_method ?? '',
        i.status,
        i.paid_at ? new Date(i.paid_at).toLocaleDateString('pt-BR') : '',
      ]),
    ),
  );

  zip.file(
    'comissoes.csv',
    toCsv(
      ['id', 'membro_user_id', 'base', 'valor', 'status', 'periodo', 'pago_em'],
      (commissions ?? []).map(c => [
        c.id,
        c.member_id ?? '',
        c.base,
        Number(c.amount).toFixed(2),
        c.status,
        c.period,
        c.paid_at ? new Date(c.paid_at).toLocaleDateString('pt-BR') : '',
      ]),
    ),
  );

  zip.file(
    'contas_a_pagar.csv',
    toCsv(
      ['id', 'descricao', 'categoria', 'valor', 'status', 'vencimento', 'pago_em'],
      (payables ?? []).map(p => [
        p.id,
        p.description,
        p.category ?? '',
        Number(p.amount).toFixed(2),
        p.status,
        p.due_date,
        p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '',
      ]),
    ),
  );

  const totalFaturado = (invoices ?? []).reduce((a, i) => a + Number(i.paid_amount ?? 0), 0);
  const totalComissoes = (commissions ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const totalPagar = (payables ?? []).reduce((a, p) => a + Number(p.amount), 0);
  zip.file(
    'resumo.csv',
    toCsv(
      ['indicador', 'valor'],
      [
        ['Faturamento recebido', totalFaturado.toFixed(2)],
        ['Comissões do período', totalComissoes.toFixed(2)],
        ['Contas a pagar do período', totalPagar.toFixed(2)],
        ['Notas fiscais emitidas', String((fiscal ?? []).length)],
      ],
    ),
  );

  const xmlsFolder = zip.folder('xmls')!;
  let xmlCount = 0;
  for (const doc of fiscal ?? []) {
    if (!doc.xml_url) continue;
    try {
      const res = await fetch(doc.xml_url);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        xmlsFolder.file(`${doc.kind}-${doc.number ?? doc.xml_url.split('/').pop()}.xml`, buf);
        xmlCount++;
      }
    } catch {
      // ignora falha pontual de download, segue pros demais
    }
  }
  if (xmlCount === 0) {
    xmlsFolder.file(
      'LEIA-ME.txt',
      'Nenhum XML fiscal disponivel neste periodo (emissao de NF-e/NFS-e ainda nao configurada ou sem notas emitidas).',
    );
  }

  const blob = await zip.generateAsync({ type: 'uint8array' });

  return new NextResponse(blob as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${tenant.name.replace(/[^a-z0-9]+/gi, '-')}-${mes}.zip"`,
    },
  });
}
