// CSV simples separado por ; (compativel com Excel PT-BR), sem dependencia externa.
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map(row => row.map(escape).join(';'));
  return '﻿' + lines.join('\r\n'); // BOM p/ acentos abrirem certo no Excel
}
