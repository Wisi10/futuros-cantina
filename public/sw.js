// Versionado: bumpear cada deploy para invalidar cache viejo.
const CACHE_VERSION = 'v4-swr';
const CACHE_NAME = `futuros-cantina-${CACHE_VERSION}`;
const SHELL = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
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

// Estrategia: stale-while-revalidate para assets estáticos (JS, CSS, fuentes,
// imágenes, manifest, HTML). Para datos dinámicos (Supabase REST, RPC) usamos
// network-only para no servir stale data crítica como stock o pagos.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo GETs y mismo origen para SWR — el resto va directo a red.
  if (event.request.method !== 'GET') return;

  // Supabase / APIs externas → network-only (no queremos stale)
  if (url.hostname.includes('supabase.') || url.hostname.includes('vercel.app/api')) {
    return; // dejar pasar al fetch normal del navegador
  }

  // Assets estáticos: SWR — sirve cache instant + refresca atrás
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    const networkPromise = fetch(event.request).then((response) => {
      // Solo cachear respuestas válidas
      if (response && response.status === 200 && response.type !== 'opaque') {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => null);

    return cached || (await networkPromise) || new Response('Sin conexión', { status: 503 });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
