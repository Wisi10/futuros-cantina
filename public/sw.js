// Versionado: bumpear el numero cada deploy para invalidar cache viejo.
// Si te olvidas, los staff veran la version vieja hasta limpiar cache manual.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `futuros-cantina-${CACHE_VERSION}`;
const SHELL = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Limpiar caches viejos al activar la nueva version del SW
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('futuros-cantina-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // network-first: siempre intenta fresco primero, cache solo si offline
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Forzar update cuando la pagina mande mensaje
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
