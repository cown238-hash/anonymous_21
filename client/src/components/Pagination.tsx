import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Compact pager that collapses long ranges into ellipses. */
export function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    const sorted = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const out: Array<number | 'gap'> = [];
    let prev = 0;
    for (const p of sorted) {
      if (prev && p - prev > 1) out.push('gap');
      out.push(p);
      prev = p;
    }
    return out;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav className={clsx('flex items-center justify-center gap-1.5', className)} aria-label="แบ่งหน้า">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="หน้าก่อนหน้า"
      >
        <ChevronLeft size={15} />
        <span className="hidden sm:inline">ก่อนหน้า</span>
      </button>

      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-ink-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={clsx(
              'h-9 min-w-9 rounded-xl px-3 text-sm font-medium transition',
              p === page
                ? 'bg-brand-500 font-semibold text-black'
                : 'text-ink-500 hover:bg-surface-2 hover:text-ink-900',
            )}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="หน้าถัดไป"
      >
        <span className="hidden sm:inline">ถัดไป</span>
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}

export function usePageState(initial = 1) {
  return useState(initial);
}