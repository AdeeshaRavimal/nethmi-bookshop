import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextValue {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<ToastType, { icon: typeof CheckCircle2; ring: string; iconColor: string; titleColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-200', iconColor: 'text-emerald-500', titleColor: 'text-emerald-800' },
  error: { icon: AlertCircle, ring: 'border-red-200', iconColor: 'text-red-500', titleColor: 'text-red-800' },
  info: { icon: Info, ring: 'border-blue-200', iconColor: 'text-blue-500', titleColor: 'text-blue-800' },
  warning: { icon: AlertTriangle, ring: 'border-amber-200', iconColor: 'text-amber-500', titleColor: 'text-amber-800' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((type: ToastType, message: string, title?: string) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, message, title }]);
    setTimeout(() => remove(id), 4200);
  }, [remove]);

  const api: ToastContextValue = {
    success: (m, t) => show('success', m, t),
    error: (m, t) => show('error', m, t),
    info: (m, t) => show('info', m, t),
    warning: (m, t) => show('warning', m, t),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 print:hidden">
        {toasts.map(toast => {
          const cfg = VARIANT_CONFIG[toast.type];
          const Icon = cfg.icon;
          return (
            <div
              key={toast.id}
              className={`bg-white border ${cfg.ring} rounded-xl shadow-lg p-3.5 flex items-start gap-3 animate-in fade-in slide-in-from-right-4 duration-200`}
            >
              <Icon className={`w-5 h-5 ${cfg.iconColor} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                {toast.title && <p className={`text-sm font-bold ${cfg.titleColor}`}>{toast.title}</p>}
                <p className="text-sm text-gray-600 break-words">{toast.message}</p>
              </div>
              <button
                onClick={() => remove(toast.id)}
                className="text-gray-300 hover:text-gray-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}