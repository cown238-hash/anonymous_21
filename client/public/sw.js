/**
 * WKSL service worker.
 *
 * Strategy:
 * - Static assets (/assets/*, icons, favicon): cache-first, they are hashed.
 * - Navigations: network-first with a cached shell fallback, so the app still
 *   opens while offline.
 * - /api/*: never cached. Serving stale or private API data from a cache is a
 *   correctness and privacy problem.
 */

const VERSION = 'wksl-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL, '/offline.html', '/logo/wksl-mark.png', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API, uploads or the socket transport.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // Hashed build output: cache-first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, fall back to the cached shell then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(SHELL_URL)) ?? (await cache.match('/offline.html')) ?? Response.error();
        }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ---- Web push -----------------------------------------------------------
// Payload from /api/push: { title, body, href, tag }.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'WKSL', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      // The server also emits the same event over the socket. If a window is
      // visible and focused the user already saw the in-app toast, so a
      // system notification would just be the same message twice.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = clients.some((c) => c.visibilityState === 'visible' && c.focused);
      if (focused) return;

      await self.registration.showNotification(data.title || 'WKSL', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-32.png',
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { href: data.href || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          // Same-origin href: navigate the existing tab instead of stacking
          // a new one for every click.
          if ('navigate' in client) {
            try {
              await client.navigate(href);
            } catch {
              /* tab closed mid-flight, nothing to do */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(href);
    })(),
  );
});
