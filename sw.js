/* ===== v57: Service Worker РІР‚вЂќ Р С•РЎвЂћРЎвЂћР В»Р В°Р в„–Р Р…-Р С”РЎРЊРЎв‚¬ Р С‘ Р СР С–Р Р…Р С•Р Р†Р ВµР Р…Р Р…РЎвЂ№Р Вµ Р С—Р С•Р Р†РЎвЂљР С•РЎР‚Р Р…РЎвЂ№Р Вµ Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘ ===== */
const SW_CACHE = 'kinokod-v85';
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
  if (url.origin !== location.origin) return; // ytimg Р С‘ Р С—РЎР‚Р С•РЎвЂЎР С‘Р Вµ Р Р†Р Р…Р ВµРЎв‚¬Р Р…Р С‘Р Вµ РІР‚вЂќ Р СР С‘Р СР С• Р С”РЎРЊРЎв‚¬Р В°
  const path = url.pathname;

  // Р СџР С•РЎРѓРЎвЂљР ВµРЎР‚РЎвЂ№: cache-first РІР‚вЂќ Р СР С–Р Р…Р С•Р Р†Р ВµР Р…Р Р…Р С• Р С‘ Р Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р С• Р С•РЎвЂћРЎвЂћР В»Р В°Р в„–Р Р…
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
  // Р вЂќР В°Р Р…Р Р…РЎвЂ№Р Вµ: network-first РІР‚вЂќ РЎРѓР Р†Р ВµР В¶Р В°Р С” Р Р†Р В°Р В¶Р Р…Р ВµР Вµ, Р С—РЎР‚Р С‘ Р С•РЎвЂљРЎРѓРЎС“РЎвЂљРЎРѓРЎвЂљР Р†Р С‘Р С‘ РЎРѓР ВµРЎвЂљР С‘ Р С•РЎвЂљР Т‘Р В°РЎвЂР С Р С”РЎРЊРЎв‚¬
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
  // v76: index.html РІР‚вЂќ network-first. Р В Р В°Р Р…РЎРЉРЎв‚¬Р Вµ Р В±РЎвЂ№Р В» stale-while-revalidate, Р С‘Р В·-Р В·Р В°
  // РЎвЂЎР ВµР С–Р С• Р С•Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘РЎРЏ Р С—РЎР‚Р С‘Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ Р С—РЎР‚Р С‘Р СР ВµР Р…РЎРЏР В»Р С‘РЎРѓРЎРЉ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р РЋР С› Р вЂ™Р СћР С›Р В Р С›Р вЂњР С› Р С•РЎвЂљР С”РЎР‚РЎвЂ№РЎвЂљР С‘РЎРЏ (Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЉ
  // Р Р†Р С‘Р Т‘Р ВµР В» РЎРѓРЎвЂљР В°РЎР‚РЎС“РЎР‹ Р Р†Р ВµРЎР‚РЎРѓР С‘РЎР‹ Р С‘Р В· Р С”РЎРЊРЎв‚¬Р В°). Р СћР ВµР С—Р ВµРЎР‚РЎРЉ РЎРѓР Р†Р ВµР В¶Р С‘Р в„– html Р Р†РЎРѓР ВµР С–Р Т‘Р В° РЎРѓ РЎРѓР ВµРЎвЂљР С‘, Р С”РЎРЊРЎв‚¬ РІР‚вЂќ Р В·Р В°Р С—Р В°РЎРѓР Р…Р С•Р в„–.
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
  // Р РЃРЎРЊР В»Р В» (css/js): stale-while-revalidate РІР‚вЂќ Р СР С–Р Р…Р С•Р Р†Р ВµР Р…Р Р…РЎвЂ№Р в„– Р С—Р С•Р С”Р В°Р В· + РЎвЂћР С•Р Р…Р С•Р Р†Р С•Р Вµ Р С•Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘Р Вµ
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