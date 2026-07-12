import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBRL(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  // +5511999998888 -> (11) 99999-8888
  const m = e164.match(/^\+?55?(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

export const KANBAN_PHASES = [
  { key: 'recepcao', label: 'Recepcao', color: 'bg-slate-500' },
  { key: 'diagnostico', label: 'Diagnostico', color: 'bg-purple-500' },
  { key: 'orcamento', label: 'Orcamento', color: 'bg-indigo-500' },
  { key: 'aguardando_aprovacao', label: 'Aguard. Aprovacao', color: 'bg-yellow-500' },
  { key: 'aguardando_peca', label: 'Aguard. Peca', color: 'bg-orange-500' },
  { key: 'em_execucao', label: 'Em Execucao', color: 'bg-blue-500' },
  { key: 'controle_qualidade', label: 'Qualidade', color: 'bg-cyan-500' },
  { key: 'pronto', label: 'Pronto', color: 'bg-green-500' },
  { key: 'entregue', label: 'Entregue', color: 'bg-emerald-700' },
] as const;

export type KanbanPhaseKey = (typeof KANBAN_PHASES)[number]['key'];