// Busca dados publicos de CNPJ via BrasilAPI (gratuita, sem chave) pra
// preencher o cadastro de cliente automaticamente.
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = await params;
  const digits = cnpj.replace(/\D/g, '');

  if (digits.length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: res.status === 404 ? 'CNPJ não encontrado' : 'Não foi possível consultar o CNPJ agora' },
        { status: 200 },
      );
    }

    const data = await res.json();

    return NextResponse.json({
      razao_social: data.razao_social ?? '',
      nome_fantasia: data.nome_fantasia ?? '',
      email: data.email ?? '',
      telefone: data.ddd_telefone_1 ? data.ddd_telefone_1.replace(/\D/g, '') : '',
      logradouro: data.logradouro ?? '',
      numero: data.numero ?? '',
      bairro: data.bairro ?? '',
      municipio: data.municipio ?? '',
      uf: data.uf ?? '',
      cep: data.cep ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar o CNPJ agora' }, { status: 200 });
  }
}
