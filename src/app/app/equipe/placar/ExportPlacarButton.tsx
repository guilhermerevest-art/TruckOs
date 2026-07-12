'use client';

import { Download } from 'lucide-react';
import { toCsv } from '@/lib/csv';

type Row = {
  name: string;
  efficiency: number;
  quality: number;
  punctuality: number;
  requestsPct: number;
  score: number;
  hoursWorked: number;
};

export function ExportPlacarButton({ rows }: { rows: Row[] }) {
  function baixar() {
    const csv = toCsv(
      ['mecanico', 'score', 'eficiencia_pct', 'qualidade_pct', 'pontualidade_pct', 'requisicoes_pct', 'horas_apontadas'],
      rows.map(r => [
        r.name,
        r.score.toFixed(1),
        r.efficiency.toFixed(1),
        r.quality.toFixed(1),
        r.punctuality.toFixed(1),
        r.requestsPct.toFixed(1),
        r.hoursWorked.toFixed(2),
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `placar-${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={baixar} className="btn-secondary">
      <Download className="h-4 w-4" /> Exportar (folha/comissão)
    </button>
  );
}
