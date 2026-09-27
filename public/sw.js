/// <reference lib="webworker" />

const CACHE_NAME = 'track-v1';
const APP_SHELL_URLS = [
  '/',
  '/progress',
  '/coach',
  '/more',
];

self.addEventListener('install', (event) => {
  const e = event as ExtendableEvent;
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_URLS).catch(() => {
        // Non-critical: some pages may not cache during install
      });
    })
  );
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener('activate', (event) => {
  const e = event as ExtendableEvent;
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

self.addEventListener('fetch', (event) => {
  const e = event as FetchEvent;
  const url = new URL(e.request.url);

  // Don't cache API routes or Gemini calls
  if (url.pathname.startsWith('/api/') || url.hostname !== location.hostname) {
    return;
  }

  // Network first for navigation, cache fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request).then((r) => r ?? caches.match('/')))
        .then((r) => r ?? new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Cache first for static assets
  if (url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        return cached ?? fetch(e.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        });
      })
    );
    return;
  }
});
