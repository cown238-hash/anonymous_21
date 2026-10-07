import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from './toast';

/** Debounced mirror of a value. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Small data-fetching helper for one-off endpoints (most use TanStack Query). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** Runs a mutation with toast + error handling in one place. */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: { success?: string | ((r: TResult) => string); onError?: (e: Error) => void },
) {
  const [pending, setPending] = useState(false);

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      try {
        const result = await fn(...args);
        const msg =
          typeof options?.success === 'function' ? options.success(result) : options?.success;
        if (msg) toast.success(msg);
        return result;
      } catch (err) {
        const error = err as Error;
        options?.onError?.(error);
        toast.error(error.message ?? 'เกิดข้อผิดพลาด');
        return null;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );

  return { mutate, pending };
}

export interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

/** Lightweight toast stack rendered by <ToastHost />. */
export function useToasts(): ToastItem[] {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((type: ToastItem['type'], message: string) => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    toast.handlers.push(push);
    return () => {
      toast.handlers = toast.handlers.filter((h) => h !== push);
    };
  }, [push]);

  return items;
}