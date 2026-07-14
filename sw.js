const CACHE_NAME = 'nfc-nexo-v9';
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

// ============================================================
//  WEB PUSH — avisos de documentos por vencer al celular donde
//  el usuario instaló la app. El backend envía el push desde
//  netlify/functions/notificar-vencimientos.js usando web-push.
//  Payload esperado (JSON):
//    { title, body, url, tag, doc_id }
// ============================================================
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Si el body no es JSON, lo tomamos como texto plano
    data = { title: 'NEXO', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'NEXO';
  const options = {
    body: data.body || '',
    icon: 'favicon/web-app-manifest-192x192.png',
    badge: 'favicon/favicon-96x96.png',
    tag: data.tag || 'nexo-doc',      // agrupa avisos del mismo documento
    renotify: true,
    data: {
      url: data.url || '/subir-documentos.html',
      doc_id: data.doc_id || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación → abrir la app en la página de documentos.
// Si ya hay una ventana abierta, la enfocamos en lugar de abrir otra.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/subir-documentos.html';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(targetUrl); } catch (e) { /* algunas plataformas lo bloquean */ }
          }
          return;
        }
      } catch (_) { /* ignorar URLs inválidas */ }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
