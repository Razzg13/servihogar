const CACHE_NAME = 'hogandia-v2';

// HTML/CSS/JS cambian con cada deploy y no tienen nombre versionado (no hay build
// step), así que van con red-primero: si hay conexión, siempre se sirve la versión
// más nueva; el caché es solo el respaldo para cuando no hay red.
// (v2: faltaba js/logica.js en esta lista — quedaba cacheado "para siempre" con la
// estrategia cache-first de más abajo, así que un visitante que ya lo tenía cacheado
// seguía recibiendo una versión vieja del archivo aunque hubiera deploys nuevos.)
const NETWORK_FIRST_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/logica.js',
  './js/supabase-config.js',
  './manifest.json',
];

// Imágenes/iconos casi no cambian: sirven directo del caché sin ir a red primero.
const CACHE_FIRST_ASSETS = [
  './img/icon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/logo-header.png',
];

const STATIC_ASSETS = [...NETWORK_FIRST_ASSETS, ...CACHE_FIRST_ASSETS];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // deja pasar CDNs (leaflet, supabase-js) y llamadas a Supabase

  const path = './' + url.pathname.replace(/^\//, '');
  const esNavegacion = request.mode === 'navigate';
  const esNetworkFirst = esNavegacion || NETWORK_FIRST_ASSETS.includes(path);

  if (esNetworkFirst) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || (esNavegacion ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Hogandia', body: 'Tienes una notificación nueva.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // payload no era JSON válido: se usa el texto por defecto de arriba
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './img/icon-192.png',
      badge: './img/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
