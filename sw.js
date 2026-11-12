const CACHE_NAME = 'eduscale-pwa-v9-dates';
const APP_FILES = ['/', '/index.html', '/manifest.json', '/auth.css', '/auth.js', '/account.js', '/access.js', '/users.js','/records.js','/operations.js', '/app.js', '/app.css', '/styles.css', '/vendor/lucide.min.js', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/icon.png', '/vendor/jspdf.umd.min.js', '/vendor/jspdf.plugin.autotable.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('eduscale-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !APP_FILES.includes(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request) ||
        (request.mode === 'navigate' ? await cache.match('/') : undefined);
      if (cached) return cached;
      throw error;
    }
  })());
});
