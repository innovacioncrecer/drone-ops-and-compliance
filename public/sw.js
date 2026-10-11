const CACHE_NAME = 'droneops-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((key) => key.startsWith('droneops-offline-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)));
      await self.clients.claim();
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
    url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.match(OFFLINE_URL)) ?? new Response('Sin conexion', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  ));
});