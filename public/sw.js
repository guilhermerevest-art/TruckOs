// Service Worker basico para PWA + offline
const CACHE_NAME = 'truckos-v1';
const STATIC_ASSETS = ['/', '/logo.svg', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Ignora metodos nao-GET
  if (request.method !== 'GET') return;

  // Ignora requisicoes para Supabase / API (deve ser sempre online)
  const url = new URL(request.url);
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Cache-first pra assets estaticos, network-first pra paginas
  if (request.destination === 'image' || request.destination === 'style' ||
      request.destination === 'script' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      })),
    );
  } else {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(c => c || caches.match('/'))),
    );
  }
});