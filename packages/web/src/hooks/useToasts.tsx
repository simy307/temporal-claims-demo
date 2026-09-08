import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (level: Toast['level'], message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (level: Toast['level'], message: string) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, level, message }].slice(-4));
      window.setTimeout(() => dismiss(id), level === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToasts(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToasts must be used inside a ToastProvider');
  }
  return context;
}

export function ToastStack() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast-${toast.level}`}
          onClick={() => dismiss(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
