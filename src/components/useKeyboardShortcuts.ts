'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { KANBAN_PHASES, type KanbanPhaseKey } from '@/lib/utils';

// Atalhos de teclado globais no app
// j/k = navegar entre colunas
// 1-9 = mover OS pra fase X (kanban)
// n = nova OS
// / = focar busca
export function useKeyboardShortcuts({
  onNewOS,
  onSearch,
}: {
  onNewOS?: () => void;
  onSearch?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignora quando digitando em inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'n' && onNewOS) {
        e.preventDefault();
        onNewOS();
      }
      if (e.key === '/' && onSearch) {
        e.preventDefault();
        onSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNewOS, onSearch]);
}