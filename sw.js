// Cache only public application assets within this service worker scope.
const CACHE_PREFIX = 'tertib-disiplin:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + 'v9-modern-ui';
const SHELL = [
  './', './index.html', './style.css', './app.js', './api-client.js',
  './config.js', './modern-ui.css', './modern-ui.js', './manifest.json', './logo.png', './favicon.png',
  './icon-192.png', './icon-512.png'
];
const ASSET_URLS = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.search || !ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(req);
      if (response.status === 200 && response.type === 'basic') {
        const copy = response.clone(); event.waitUntil(cache.put(req, copy).catch(() => {}));
      }
      if (response.status >= 500) { const cached = await cache.match(req); if (cached) return cached; }
      return response;
    } catch (error) {
      const cached = await cache.match(req); if (cached) return cached;
      return new Response('Aset tidak tersedia saat offline. Hubungkan internet lalu muat ulang.', {status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
    }
  })());
});
