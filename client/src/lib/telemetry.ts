import { getAccessToken } from './api';

/** Injected by Vite at build time (see vite.config.ts). */
declare const __APP_VERSION__: string;

/**
 * Privacy-friendly, dependency-free telemetry.
 *
 * - Error reports go to our own API, which forwards them to a collector only
 *   when ERROR_REPORT_ENDPOINT is configured. No third-party script is ever
 *   injected.
 * - Analytics events are opt-in at the server: /collect/config tells us
 *   whether a collector exists, and we do nothing when it does not.
 * - Nothing is stored in cookies and no fingerprinting is performed.
 */

const sentErrors = new Set<string>();
let analyticsEnabled: boolean | null = null;

function report(context: string, error: unknown, extra: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Dedupe identical reports within a session to avoid a render loop flooding.
  const fingerprint = `${context}:${message}`;
  if (sentErrors.has(fingerprint)) return;
  sentErrors.add(fingerprint);
  if (sentErrors.size > 50) sentErrors.clear();

  const body = JSON.stringify({
    message,
    level: 'error',
    context,
    stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    build: __APP_VERSION__,
    ...extra,
  });

  // `sendBeacon` survives page unload; fall back to keepalive fetch.
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon('/api/collect/client-errors', blob)) return;
  }

  void fetch('/api/collect/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/** Called by the ErrorBoundary and window listeners. */
export function reportError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  report(context, error, extra);
}

function track(name: string, props: Record<string, unknown> = {}): void {
  // Only send once we know the server has somewhere to put it.
  if (analyticsEnabled === false) return;

  const body = JSON.stringify({
    name,
    props: Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : (v ?? null)]),
    ),
    url: window.location.pathname,
    referrer: document.referrer || null,
  });

  const send = () =>
    fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);

  if (analyticsEnabled === null) {
    fetch('/api/collect/config')
      .then((r) => r.json())
      .then((json) => {
        analyticsEnabled = Boolean(json?.data?.enabled);
        if (analyticsEnabled) send();
      })
      .catch(() => {
        analyticsEnabled = false;
      });
    return;
  }

  void send();
}

/** Page-view and interaction tracking. */
export const analytics = {
  pageView(path: string) {
    track('page_view', { path });
  },
  event(name: string, props?: Record<string, unknown>) {
    track(name, props);
  },
  signUp() {
    track('sign_up');
  },
  signIn() {
    track('sign_in');
  },
  postCreated() {
    track('post_created');
  },
  messageSent(conversationId: string) {
    track('message_sent', { conversationId });
  },
};

/** Wires window error handlers. Call once at app start. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    report('window.onerror', event.error ?? event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    report('unhandledrejection', event.reason);
  });

  // A dropped connection invalidates the access token, so let the app know.
  window.addEventListener('offline', () => {
    document.documentElement.setAttribute('data-online', 'false');
  });
  window.addEventListener('online', () => {
    document.documentElement.setAttribute('data-online', 'true');
  });
  document.documentElement.setAttribute('data-online', String(navigator.onLine));

  // Report auth failures that are not handled locally.
  window.addEventListener('unauthorized', () => {
    if (getAccessToken()) report('unauthorized', 'session expired');
  });
}