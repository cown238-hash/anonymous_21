import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useToasts } from '../lib/hooks';

export function ToastHost() {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={clsx(
            'animate-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur',
            t.type === 'success' && 'border-brand-500/35 bg-surface-2/95 text-brand-400',
            t.type === 'error' && 'border-danger/35 bg-surface-2/95 text-danger',
            t.type === 'info' && 'border-info/35 bg-surface-2/95 text-info',
          )}
        >
          {t.type === 'success' && <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
          {t.type === 'error' && <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
          {t.type === 'info' && <Info size={18} className="mt-0.5 shrink-0" />}
          <p className="flex-1 text-sm leading-snug text-ink-900">{t.message}</p>
          <X size={14} className="mt-1 shrink-0 text-ink-400" />
        </div>
      ))}
    </div>
  );
}