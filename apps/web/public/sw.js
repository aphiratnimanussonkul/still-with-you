/* Tombstone service worker for MSW-mode deploys.
 * Replaces a leftover vite-plugin-pwa / Workbox sw.js so the browser can
 * update (HTML at this URL cannot). Then it clears caches, unregisters, and
 * reloads once so mockServiceWorker.js can become the only worker.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })()
  );
});
