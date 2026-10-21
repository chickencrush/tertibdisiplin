// TERTIB DISIPLIN - Service Worker
// Naikkan angka versi di bawah setiap kali file aplikasi diperbarui.
const CACHE_NAME = 'tertib-disiplin-v14';  // bumped v8 → v9 (setupAwal error fix + setupLeaveSheetOnly)
const SHELL = [
  './', './index.html', './style.css', './app.js', './api-client.js', './config.js',
  './manifest.json', './icons/logo.png', './icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Hanya file milik aplikasi ini; panggilan ke Apps Script / CDN tidak disentuh
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
