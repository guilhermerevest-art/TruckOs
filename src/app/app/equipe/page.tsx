import Link from 'next/link';
import { Moon, Trophy } from 'lucide-react';

export default function EquipePage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Equipe</h1>
        <p className="text-sm text-slate-500">Passagem de turno e desempenho</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/app/equipe/turno" className="card-base flex items-start gap-3 p-5 hover:bg-slate-50">
          <Moon className="h-6 w-6 flex-shrink-0 text-indigo-600" />
          <div>
            <div className="font-bold text-slate-900">Passagem de turno</div>
            <div className="text-sm text-slate-500">Resumo de fim de dia do pátio</div>
          </div>
        </Link>
        <Link href="/app/equipe/placar" className="card-base flex items-start gap-3 p-5 hover:bg-slate-50">
          <Trophy className="h-6 w-6 flex-shrink-0 text-amber-600" />
          <div>
            <div className="font-bold text-slate-900">Placar de produtivos</div>
            <div className="text-sm text-slate-500">Ranking mensal por mecânico</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
