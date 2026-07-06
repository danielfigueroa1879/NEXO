const CACHE_NAME = 'nfc-nexo-v8';
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
  const esSupabaseStorage = url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/');

  // Si no es un recurso local ni archivos de almacenamiento de Supabase, no lo interceptamos
  if (!esLocal && !esSupabaseStorage) {
    return;
  }

  // Clave de caché limpia (para Supabase Storage ignoramos tokens y firmas que cambian constantemente)
  let cacheKey = event.request;
  if (esSupabaseStorage) {
    const cleanUrl = new URL(event.request.url);
    cleanUrl.search = ''; // Elimina ?token=...&expires=...
    cacheKey = cleanUrl.toString();
  }

  event.respondWith(
    caches.match(cacheKey).then((cachedResponse) => {
      // Realizar consulta de red en segundo plano para actualizar la caché de forma asíncrona
      // (siempre usando la request original autorizada con token)
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(cacheKey, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          console.warn('Fallo actualización de fondo para:', event.request.url, error);
          if (!cachedResponse) {
            const acceptHeader = event.request.headers.get('accept');
            if (acceptHeader && acceptHeader.includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
          }
        });

      // Servir al instante desde caché (0ms de latencia, sin carga por partes) si existe
      return cachedResponse || fetchPromise;
    })
  );
});
