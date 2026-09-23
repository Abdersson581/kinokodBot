/* ===== Service Worker — оффлайн-кэш и мгновенные повторные загрузки ===== */
/* v131: ОТКАТ к стратегии «кэш в первую очередь» (stale-while-revalidate).
   Две недели приложение открывалось мгновенно из кэша, а обновлялось в фоне —
   это переживало любые сетевые капризы. Сегодняшние v129/v130 перевели шэлл
   на network-first («свежесть важнее»): каждое открытие обязано успешно
   сходить в сеть, и во встроенном браузере Telegram Desktop это падало
   ERR_FAILED, хотя сайт был жив. Возвращаем проверенную схему: открытие —
   мгновенно из любого кэша, обновление — в фоне. Предыдущие версии кэша
   остаются страховкой. */
const SW_CACHE = 'kinokod-v136';
// Список данных неизменен; shell собирается в install — версии берём из index.html.
const SW_DATA = ['./data/movies.json', './data/meta.json', './data/collections.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SW_CACHE);
    // v135: версии берём ИЗ index.html. Раньше здесь лежали './script.js' и
    // './style.css' БЕЗ ?v=, а страница запрашивает их с версией — такие записи
    // не использовались никогда (URL не совпадал), зато первый показ после
    // деплоя тянул прошлый бандл из кэша. Исправление «доезжало» только со
    // второго открытия, а сломанный бандл (инцидент «чёрный экран» 23.09.2026)
    // так и оставался на экране.
    let ver = '';
    try {
      const html = await (await fetch('./index.html', { cache: 'no-cache' })).text();
      const m = html.match(/script\.js\?v=(\d+)/);
      if (m) ver = '?v=' + m[1];
    } catch (err) { /* нет сети — precache без версии */ }
    const shell = ['./', './index.html', './script.js' + ver, './style.css' + ver];
    await Promise.all([...shell, ...SW_DATA].map(u =>
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
    // Текущий кэш + ПРЕДЫДУЩАЯ версия остаются как страховка: если сеть
    // недоступна, страница откроется из копии прошлой версии.
    const keep = new Set([SW_CACHE]);
    const prev = kinokod.find(x => x.v < curV);
    if (prev) keep.add(prev.k);
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

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
  // Всё остальное (html/css/js/data-json): SWR — отдаём кэш мгновенно,
  // свежую копию тянем в фоне для следующего открытия. Если кэша ещё нет
  // (самое первое открытие) — идём в сеть напрямую.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchAndCache = (async () => {
      const cache = await caches.open(SW_CACHE);
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (err) {
        return null; // сеть недоступна — живём на кэше
      }
    })();
    e.waitUntil(fetchAndCache);
    if (cached) return cached;
    return (await fetchAndCache) || Response.error();
  })());
});
