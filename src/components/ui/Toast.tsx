'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';
type Toast = { id: string; type: ToastType; title: string; description?: string };

const ToastContext = createContext<{
  show: (t: Omit<Toast, 'id'>) => void;
}>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = String(Date.now() + Math.random());
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map(t => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-80 animate-slide-up items-start gap-3 rounded-lg border p-3 shadow-lg ${STYLES[t.type]}`}
            >
              <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-bold">{t.title}</div>
                {t.description && <div className="mt-0.5 text-xs opacity-80">{t.description}</div>}
              </div>
              <button onClick={() => dismiss(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}