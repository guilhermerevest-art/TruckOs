'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileArchive, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ExportacaoContadorPage() {
  const toast = useToast();
  const [mes, setMes] = useState(currentMonth());
  const [loading, setLoading] = useState(false);

  async function baixar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/export/contador?mes=${mes}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Falha ao gerar exportação');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `truckos-${mes}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.show({ type: 'success', title: 'Exportação gerada' });
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao exportar', description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/financeiro"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao financeiro
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Exportação para o contador</h1>
        <p className="text-sm text-slate-500">
          Um ZIP com faturamento, comissões, contas a pagar e XMLs fiscais do mês — pronto pra mandar
          no dia 1º.
        </p>
      </div>

      <div className="card-base max-w-md p-6">
        <div className="mb-4 flex items-center gap-3">
          <FileArchive className="h-8 w-8 text-sky-600" />
          <div>
            <div className="font-bold text-slate-900">Pacote mensal</div>
            <div className="text-xs text-slate-500">
              faturamento.csv · comissoes.csv · contas_a_pagar.csv · resumo.csv · xmls/
            </div>
          </div>
        </div>
        <label className="block text-sm font-medium text-slate-700">Mês de referência</label>
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="input-base mt-1 w-full"
        />
        <button onClick={baixar} disabled={loading} className="btn-primary mt-4 w-full py-2.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? 'Gerando…' : 'Baixar ZIP'}
        </button>
      </div>
    </div>
  );
}
