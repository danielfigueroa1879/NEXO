const CACHE_NAME = 'nfc-nexo-v6';
const OFFLINE_URL = 'index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './',
        'index.html',
        'favicon/favicon-96x96.png',
        'favicon/favicon.ico',
        'favicon/favicon.svg',
        'favicon/apple-touch-icon.png',
        'favicon/nexo.webmanifest',
        'favicon/web-app-manifest-192x192.png',
        'favicon/web-app-manifest-512x512.png'
      ]).catch((error) => {
        console.warn('Pre-caching failed, will cache dynamically:', error);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  const esLocal = url.origin === self.location.origin;
  const esPublicaSupabase = url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/documentos/');

  // Si no es un recurso local ni un documento público de Supabase, no lo interceptamos
  if (!esLocal && !esPublicaSupabase) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Fetch de red en segundo plano (para actualizar caché de forma asíncrona)
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          console.warn('Fallo actualización de fondo para:', event.request.url, error);
          // Si no había caché y falló el fetch, intentamos devolver el HTML offline de fallback
          if (!cachedResponse) {
            const acceptHeader = event.request.headers.get('accept');
            if (acceptHeader && acceptHeader.includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
          }
        });

      // Servir inmediatamente desde caché si existe (Carga instantánea, 0ms), sino esperar a la red
      return cachedResponse || fetchPromise;
    })
  );
});
