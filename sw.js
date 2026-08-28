const CACHE_NAME = 'hogandia-v3';

// Todo lo del propio origen (HTML/CSS/JS/imágenes) va con RED-PRIMERO: si hay
// conexión siempre se sirve la versión más nueva del deploy; el caché es solo el
// respaldo para cuando no hay red.
// (v3: antes las imágenes iban cache-first y quedaban cacheadas "para siempre" —
// cambiar img/hero.jpg no se veía nunca. Mismo problema que tuvo js/logica.js en v2.)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/logica.js',
  './js/supabase-config.js',
  './manifest.json',
  './img/icon-192.png',
];

// Sólo estos se sirven directo del caché sin ir a red (no cambian nunca por nombre).
const CACHE_FIRST_ASSETS = [
  './img/icon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png',
];

const STATIC_ASSETS = PRECACHE_ASSETS;

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

  // Íconos fijos: cache-primero (nunca cambian de contenido).
  if (CACHE_FIRST_ASSETS.includes(path)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Todo lo demás del origen: red-primero, caché como respaldo offline.
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
