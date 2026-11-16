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

const VARIANT_CONFIG: Record<
  ToastType,
  { icon: typeof CheckCircle2; border: string; iconColor: string; titleColor: string }
> = {
  success: {
    icon: CheckCircle2,
    border: 'border-emerald-500/30 dark:border-emerald-500/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    titleColor: 'text-emerald-900 dark:text-emerald-200',
  },
  error: {
    icon: AlertCircle,
    border: 'border-rose-500/30 dark:border-rose-500/40',
    iconColor: 'text-rose-600 dark:text-rose-400',
    titleColor: 'text-rose-900 dark:text-rose-200',
  },
  info: {
    icon: Info,
    border: 'border-blue-500/30 dark:border-blue-500/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-900 dark:text-blue-200',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-amber-500/30 dark:border-amber-500/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-900 dark:text-amber-200',
  },
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
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-84 max-w-[calc(100vw-2rem)] pointer-events-none print:hidden">
        {toasts.map(toast => {
          const cfg = VARIANT_CONFIG[toast.type];
          const Icon = cfg.icon;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border ${cfg.border} rounded-xl shadow-lg shadow-black/5 dark:shadow-black/30 p-3.5 flex items-start gap-3 transition-all animate-in fade-in slide-in-from-top-2 duration-150`}
            >
              <Icon className={`w-4 h-4 ${cfg.iconColor} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className={`text-xs font-bold leading-tight ${cfg.titleColor}`}>
                    {toast.title}
                  </p>
                )}
                <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-relaxed mt-0.5">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 -mr-1 -mt-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
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
