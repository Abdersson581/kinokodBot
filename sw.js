/* ===== Service Worker — оффлайн-кэш и мгновенные повторные загрузки ===== */
const SW_CACHE = 'kinokod-v130';
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
    const kinokod = keys
      .filter(k => /^kinokod-v\d+$/.test(k))
      .map(k => ({ k, v: Number(k.slice('kinokod-v'.length)) }))
      .sort((a, b) => b.v - a.v);
    const curV = Number(SW_CACHE.match(/\d+$/)[0]);
    // v130: текущий кэш + ПРЕДЫДУЩАЯ версия остаются как страховка от
    // ERR_FAILED (если Pages в момент деплоя кратковременно отдаёт ошибку —
    // откроется предыдущая версия). Более старые версии и чужие кэши чистим.
    const keep = new Set([SW_CACHE]);
    const prev = kinokod.find(x => x.v < curV);
    if (prev) keep.add(prev.k);
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// v130: падение сети или небо-ответ (404/5xx во время пересборки Pages) для
// html/css/js — отдаём последнюю живую копию из ЛЮБОГО кэша (включая кэш
// предыдущей версии). Response.error() из SW = ERR_FAILED в Telegram —
// больше не допускаем для шэлла приложения.
async function shellFallback(req, resp) {
  if (resp && resp.ok) return resp;
  const any = await caches.match(req);
  if (any) return any;
  return resp || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ytimg и прочие внешние — мимо кэша
  const path = url.pathname;

  // Постеры: cache-first — мгновенно и доступно офлайн
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
  // Данные: network-first — свежесть важнее, при отсутствии сети отдаём кэш
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
  // v76: index.html — network-first. Раньше был stale-while-revalidate, из-за
  // чего обновления приложения применялись только СО ВТОРОГО открытия (пользователь
  // видел старую версию из кэша). Теперь свежий html всегда с сети, кэш — запасной.
  if (path === '/' || path.endsWith('/index.html')) {
    e.respondWith((async () => {
      const cache = await caches.open(SW_CACHE);
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        if (resp.ok) { cache.put(req, resp.clone()); return resp; }
        return await shellFallback(req, resp);
      } catch (err) {
        return await shellFallback(req, null);
      }
    })());
    return;
  }
  // v129: css/js — тоже network-first, как index.html. Раньше для шэлла был
  // stale-while-revalidate: после деплоя пользователь в рамках одной сессии
  // мог получить свежий HTML со СТАРЫМ script.js (кэш ещё не провалидировался)
  // — редкие «странные» баги и рассинхрон версий. Свежесть важнее мгновенного
  // показа: разница — одна сетевая задержка на открытие.
  e.respondWith((async () => {
    const cache = await caches.open(SW_CACHE);
    try {
      const resp = await fetch(req, { cache: 'no-cache' });
      if (resp.ok) { cache.put(req, resp.clone()); return resp; }
      return await shellFallback(req, resp);
    } catch (err) {
      return await shellFallback(req, null);
    }
  }));
});
