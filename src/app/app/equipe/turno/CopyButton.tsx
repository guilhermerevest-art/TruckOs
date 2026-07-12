'use client';

import { Copy } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function CopyButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.show({ type: 'success', title: 'Resumo copiado', description: 'Cole no grupo do WhatsApp da equipe.' });
      }}
      className="btn-primary"
    >
      <Copy className="h-4 w-4" /> Copiar resumo
    </button>
  );
}
