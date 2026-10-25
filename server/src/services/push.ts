import webpush from 'web-push';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

/**
 * Web Push delivery.
 *
 * Fire-and-forget by contract: a dead push service must never break the
 * request that triggered the notification, so every failure here is logged
 * and swallowed — same contract as `notify()`.
 */

let vapidReady: boolean | null = null;

/** Lazily configure VAPID so an unset feature costs nothing at boot. */
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  if (!env.webPushEnabled) {
    vapidReady = false;
    return false;
  }
  try {
    webpush.setVapidDetails(env.vapidSubject, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] invalid VAPID configuration, web push stays off', err);
    vapidReady = false;
  }
  return vapidReady;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  href?: string | null;
  /** Groups related notifications on the device (one chat = one entry). */
  tag?: string;
}

/** True when the server can actually send — drives `/api/push/public-key`. */
export function pushEnabled(): boolean {
  return ensureVapid();
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    },
    // Re-claiming a known endpoint moves it to whoever just subscribed —
    // signing out on a shared browser must not leave the old account's
    // subscription attached to that device.
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, lastSeenAt: new Date() },
  });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/**
 * Sends to every browser the user opted into. Subscriptions the push service
 * rejects as gone (404/410) are deleted so the table does not accumulate
 * devices the user no longer has.
 */
export async function sendWebPush(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;

  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      href: payload.href ?? '/',
      tag: payload.tag,
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            // A day is long enough for "you were mentioned"; a stale alert
            // after that is noise on the lock screen.
            { TTL: 60 * 60 * 24, urgency: 'normal' },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
            return;
          }
          // eslint-disable-next-line no-console
          console.warn('[push] send failed', { userId, status });
        }
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] sendWebPush failed', err);
  }
}
