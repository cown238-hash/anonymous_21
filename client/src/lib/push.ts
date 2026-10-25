import { api } from './api';

/**
 * Browser push plumbing.
 *
 * Everything here degrades quietly: an unsupported browser, a denied
 * permission or a server without VAPID keys simply answers "not available"
 * and the Settings toggle hides itself.
 */

export interface PushStatus {
  enabled: boolean;
  publicKey: string | null;
}

/** Web Push needs a service worker, so none of this works without one. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Asks the server whether push is configured (VAPID keys present). */
export async function fetchPushStatus(): Promise<PushStatus> {
  return api.get<PushStatus>('/push/public-key');
}

/** The browser's current permission, without prompting. */
export function notificationPermission(): NotificationPermission {
  return pushSupported() ? Notification.permission : 'denied';
}

/** True when this browser already holds a subscription for this origin. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return Boolean(await registration.pushManager.getSubscription());
}

/** base64url (the VAPID format) -> bytes, for `applicationServerKey`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Backed by a plain ArrayBuffer: `BufferSource` rejects SharedArrayBuffer
  // in the push subscription types.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registers the service worker on demand.
 *
 * In production main.tsx registers it on load, but the user may open Settings
 * before that finishes, and in development it is never registered at all.
 */
async function ensureWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'unavailable';

/**
 * Prompts for permission, subscribes this browser with the push service and
 * hands the subscription to the server. Returns what actually happened so the
 * caller can show the right message.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return 'unsupported';

  const status = await fetchPushStatus();
  if (!status.enabled || !status.publicKey) return 'unavailable';

  // The prompt must come from a user gesture, which the Settings toggle is.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await ensureWorker();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(status.publicKey),
  });

  await api.post('/push/subscribe', {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.toJSON().keys?.p256dh ?? '',
      auth: subscription.toJSON().keys?.auth ?? '',
    },
  });

  return 'enabled';
}

/** Unsubscribes this browser and tells the server to forget it. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  // Tell the server first: if the tab dies mid-way the subscription row is
  // still stale, but a push service 404/410 cleans that up on the next send.
  await api.post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
