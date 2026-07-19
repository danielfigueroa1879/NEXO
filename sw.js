// Dos cachés distintos:
//  - APP_CACHE   se bumpea con cada deploy para forzar refresco de HTML/JS/CSS.
//  - STORAGE_CACHE es persistente: guarda las imágenes de documentos de Supabase
//                  para que NO se vuelvan a descargar en el próximo deploy.
const APP_CACHE     = 'nfc-nexo-v16';
const STORAGE_CACHE = 'nfc-nexo-storage-v1';
const OFFLINE_URL   = 'index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
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
          // Borrar solo las cachés viejas de la app. STORAGE_CACHE se preserva
          // entre deploys → las imágenes ya bajadas no se vuelven a descargar.
          if (cacheName !== APP_CACHE && cacheName !== STORAGE_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const esLocal = url.origin === self.location.origin;
  const esSupabaseStorage = url.hostname.endsWith('.supabase.co')
    && url.pathname.includes('/storage/v1/object/');

  if (!esLocal && !esSupabaseStorage) return;

  // ---- Supabase Storage: CACHE-FIRST puro, sin revalidación en background ----
  // Los documentos casi nunca cambian (y cuando cambian, el usuario re-sube y
  // Supabase invalida vía Cache-Control). Servir desde caché y NO redescargar
  // en background baja el egress a ~0 para archivos ya vistos.
  if (esSupabaseStorage) {
    const cleanUrl = new URL(event.request.url);
    cleanUrl.search = ''; // ignora ?token=... y firmas que cambian
    const cacheKey = cleanUrl.toString();

    event.respondWith((async () => {
      const cache = await caches.open(STORAGE_CACHE);
      const cached = await cache.match(cacheKey);
      if (cached) return cached; // 0 egress

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          cache.put(cacheKey, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch (e) {
        console.warn('Storage fetch falló:', event.request.url, e);
        return new Response('', { status: 504, statusText: 'Storage offline' });
      }
    })());
    return;
  }

  // ---- Recursos locales: stale-while-revalidate contra APP_CACHE ----
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(APP_CACHE).then((cache) => {
              cache.put(event.request, responseToCache);
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

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Poner badge en el ícono de la app (número rojo)
      if ('setAppBadge' in navigator) {
        try { await navigator.setAppBadge(1); } catch(_){}
      }
    })()
  );
});

// Al tocar la notificación → abrir la app en la página de documentos.
// Si ya hay una ventana abierta, la enfocamos en lugar de abrir otra.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Limpiar badge del ícono de la app
  if ('clearAppBadge' in navigator) {
    try { navigator.clearAppBadge(); } catch(_){}
  }
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
