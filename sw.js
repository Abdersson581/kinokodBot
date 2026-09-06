/* ===== v57: Service Worker — оффлайн-кэш и мгновенные повторные загрузки ===== */
const SW_CACHE = 'kinokod-v70';
const SW_SHELL = ['./', './index.html', './style.css', './script.js'];
const SW_DATA = ['./data/movies.json', './data/meta.json', './data/collections.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SW_CACHE);
    await Promise.all([...SW_SHELL, ...SW_DATA].map(u =>
      cache.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SW_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ytimg и прочие внешние — мимо кэша
  const path = url.pathname;

  // Постеры: cache-first — мгновенно и доступно оффлайн
  if (path.includes('/posters/')) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const cache = await caches.open(SW_CACHE);
      try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (err) {
        return cached || Response.error();
      }
    })());
    return;
  }
  // Данные: network-first — свежак важнее, при отсутствии сети отдаём кэш
  if (path.includes('/data/') && path.endsWith('.json')) {
    e.respondWith((async () => {
      const cache = await caches.open(SW_CACHE);
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }
  // Шэлл (html/css/js): stale-while-revalidate — мгновенный показ + фоновое обновление
  e.respondWith((async () => {
    const cache = await caches.open(SW_CACHE);
    const cached = await cache.match(req);
    const refresh = fetch(req, { cache: 'no-cache' })
      .then(resp => { if (resp.ok) cache.put(req, resp.clone()); return resp; })
      .catch(() => null);
    if (cached) { e.waitUntil(refresh); return cached; }
    const resp = await refresh;
    return resp || Response.error();
  })());
});