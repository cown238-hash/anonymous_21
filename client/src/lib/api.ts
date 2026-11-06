interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { message: string; code?: string; details?: Array<{ field: string; message: string }> };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    message: string,
    code = 'ERROR',
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Map of field -> message, handy for inline form errors. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) out[d.field] = d.message;
    return out;
  }
}

// --- access token lives in memory only (never localStorage) ----------------
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the automatic refresh-and-retry cycle. */
  raw?: boolean;
  /** Do not trigger the global logout on 401. */
  anonymous?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const json = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
        accessToken = json.data.accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        // Allow the next 401 to start a fresh refresh attempt.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      });
  }
  return refreshPromise;
}

function buildHeaders(hasBody: boolean, headers?: HeadersInit): Headers {
  const out = new Headers(headers);
  if (hasBody) out.set('Content-Type', 'application/json');
  if (accessToken) out.set('Authorization', `Bearer ${accessToken}`);
  return out;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, text || 'ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง');
  }

  const envelope = json as ApiEnvelope<T>;
  if (!res.ok || envelope?.success === false) {
    // A 2FA challenge is a successful response, not a failure, so it is
    // surfaced on the error object for the login form to render.
    const data = envelope?.data as SessionPayload | undefined;
    if (data?.twoFactorRequired) {
      const challenge = new ApiError(401, 'ต้องการรหัสยืนยัน', 'TWO_FACTOR_REQUIRED') as ApiError & {
        twoFactorRequired: boolean;
        emailHint?: string;
      };
      challenge.twoFactorRequired = true;
      challenge.emailHint = data.emailHint;
      throw challenge;
    }

    const error = envelope?.error;
    throw new ApiError(res.status, error?.message ?? `เกิดข้อผิดพลาด (${res.status})`, error?.code, error?.details);
  }
  return envelope.data;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, raw, anonymous, headers, ...rest } = options;
  const isFormData = body instanceof FormData;
  const url = path.startsWith('/api') ? path : `/api${path}`;
  const json = isFormData ? body : JSON.stringify(body);

  const send = (h: Headers) =>
    fetch(url, {
      ...rest,
      credentials: 'include',
      headers: h,
      ...(body !== undefined ? { body: json } : {}),
    });

  const res = await send(buildHeaders(body !== undefined && !isFormData, headers));

  if (res.status === 401 && !anonymous && !raw) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retry = await send(buildHeaders(body !== undefined && !isFormData));
      return parse<T>(retry);
    }
    accessToken = null;
    onUnauthorized?.();
  }

  return parse<T>(res);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: formData }),
  /**
   * Fetches a file response (attachment) and triggers a browser download.
   * Uses the same in-memory access token as every other call.
   */
  download: async (path: string, fallbackName: string): Promise<void> => {
    const url = path.startsWith('/api') ? path : `/api${path}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      let message = `ดาวน์โหลดไม่สำเร็จ (${res.status})`;
      try {
        const parsed = JSON.parse(text) as ApiEnvelope<unknown>;
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        /* keep the default message */
      }
      throw new ApiError(res.status, message);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const name = match?.[1] ?? fallbackName;

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  },
};

export interface SessionPayload {
  accessToken: string;
  user: unknown;
  /** Set on a login response when the account requires a second factor. */
  twoFactorRequired?: boolean;
  emailHint?: string;
}

let bootstrapPromise: Promise<SessionPayload> | null = null;

/**
 * Restores the session from the httpOnly refresh cookie exactly once per page
 * load.
 *
 * React 18's StrictMode intentionally double-invokes effects in development.
 * Because refresh tokens are single-use, firing two concurrent refreshes would
 * rotate the token twice: the second call fails and clears the cookie, silently
 * logging the user out on every reload. Memoising the call removes the race.
 */
export function bootstrapSession(): Promise<SessionPayload> {
  if (!bootstrapPromise) {
    bootstrapPromise = request<SessionPayload>('/auth/refresh', {
      method: 'POST',
      anonymous: true,
    }).catch((err) => {
      // Allow a later attempt (e.g. right after an explicit login).
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

/** Build a query string, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}