import clsx from 'clsx';
import type { ReactNode } from 'react';
import { gradientFor, initialsOf } from '../lib/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
  ring?: boolean;
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-24 w-24 text-2xl',
} as const;

const DOTS = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3.5 w-3.5',
  xl: 'h-5 w-5',
} as const;

export function Avatar({ name, src, size = 'md', online, className, ring }: AvatarProps) {
  return (
    <span className={clsx('relative inline-block shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          className={clsx(
            'rounded-full object-cover grayscale',
            SIZES[size],
            ring && 'ring-2 ring-brand-500/40 ring-offset-2 ring-offset-surface-1',
          )}
        />
      ) : (
        <span
          aria-hidden
          className={clsx(
            'flex items-center justify-center rounded-full font-semibold text-black',
            gradientFor(name || 'wksl'),
            SIZES[size],
            ring && 'ring-2 ring-brand-500/40 ring-offset-2 ring-offset-surface-1',
          )}
        >
          {initialsOf(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={clsx(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-surface-1',
            DOTS[size],
            online ? 'bg-brand-400' : 'bg-ink-400',
          )}
        />
      )}
    </span>
  );
}

interface BadgeProps {
  children: ReactNode;
  color?: string;
  className?: string;
}

export function Badge({ children, color, className }: BadgeProps) {
  if (color) {
    return (
      <span
        className={clsx('badge', className)}
        style={{ backgroundColor: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
      >
        {children}
      </span>
    );
  }
  return <span className={clsx('badge bg-surface-2 text-ink-500', className)}>{children}</span>;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-20 text-center', className)}>
      {icon && (
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-ink-500/12 bg-surface-2 text-ink-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold tracking-tight text-ink-900">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={clsx(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('card animate-pulse p-5', className)}>
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-2.5 w-20" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function SpinnerPage({ label = 'กำลังโหลดข้อมูล' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-28 text-ink-500">
      <Spinner className="h-7 w-7 text-brand-400" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'card animate-pop w-full rounded-b-none border-ink-500/15 bg-surface-1 sm:rounded-2xl',
          width,
          'max-h-[90vh] overflow-hidden',
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-ink-500/10 px-5 py-4">
            <div>
              {title && <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>}
              {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="ปิด">
              ✕
            </button>
          </div>
        )}
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-500/10 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Alert({
  kind = 'error',
  children,
  className,
}: {
  kind?: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    error: 'border-danger/30 bg-danger/10 text-danger',
    success: 'border-brand-500/30 bg-brand-500/10 text-brand-400',
    info: 'border-info/30 bg-info/10 text-info',
    warning: 'border-warn/30 bg-warn/10 text-warn',
  }[kind];

  return (
    <div role="alert" className={clsx('rounded-xl border px-3.5 py-2.5 text-sm', styles, className)}>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }) {
  const map = {
    DRAFT: { label: 'ฉบับร่าง', className: 'border border-warn/30 bg-warn/10 text-warn' },
    PUBLISHED: { label: 'เผยแพร่', className: 'border border-brand-500/30 bg-brand-500/10 text-brand-400' },
    ARCHIVED: { label: 'เก็บถาวร', className: 'border border-ink-500/20 bg-surface-2 text-ink-500' },
  }[status];

  return <span className={clsx('badge', map.className)}>{map.label}</span>;
}