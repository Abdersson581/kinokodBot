/* ===== v57: Service Worker вЂ” РѕС„С„Р»Р°Р№РЅ-РєСЌС€ Рё РјРіРЅРѕРІРµРЅРЅС‹Рµ РїРѕРІС‚РѕСЂРЅС‹Рµ Р·Р°РіСЂСѓР·РєРё ===== */
const SW_CACHE = 'kinokod-v78';
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
  if (url.origin !== location.origin) return; // ytimg Рё РїСЂРѕС‡РёРµ РІРЅРµС€РЅРёРµ вЂ” РјРёРјРѕ РєСЌС€Р°
  const path = url.pathname;

  // РџРѕСЃС‚РµСЂС‹: cache-first вЂ” РјРіРЅРѕРІРµРЅРЅРѕ Рё РґРѕСЃС‚СѓРїРЅРѕ РѕС„С„Р»Р°Р№РЅ
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
  // Р”Р°РЅРЅС‹Рµ: network-first вЂ” СЃРІРµР¶Р°Рє РІР°Р¶РЅРµРµ, РїСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё СЃРµС‚Рё РѕС‚РґР°С‘Рј РєСЌС€
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
  // v76: index.html вЂ” network-first. Р Р°РЅСЊС€Рµ Р±С‹Р» stale-while-revalidate, РёР·-Р·Р°
  // С‡РµРіРѕ РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРёР»РѕР¶РµРЅРёСЏ РїСЂРёРјРµРЅСЏР»РёСЃСЊ С‚РѕР»СЊРєРѕ РЎРћ Р’РўРћР РћР“Рћ РѕС‚РєСЂС‹С‚РёСЏ (РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ
  // РІРёРґРµР» СЃС‚Р°СЂСѓСЋ РІРµСЂСЃРёСЋ РёР· РєСЌС€Р°). РўРµРїРµСЂСЊ СЃРІРµР¶РёР№ html РІСЃРµРіРґР° СЃ СЃРµС‚Рё, РєСЌС€ вЂ” Р·Р°РїР°СЃРЅРѕР№.
  if (path === '/' || path.endsWith('/index.html')) {
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
  // РЁСЌР»Р» (css/js): stale-while-revalidate вЂ” РјРіРЅРѕРІРµРЅРЅС‹Р№ РїРѕРєР°Р· + С„РѕРЅРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ
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