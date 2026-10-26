// TERTIB DISIPLIN - Service Worker
// Naikkan angka versi di bawah setiap kali file aplikasi diperbarui.
const CACHE_NAME = 'tertib-disiplin-v71';  // PWA Install fix: tombol #btn-install-pwa sebelumnya tidak ter-wire -> sekarang terhubung ke triggerPwaPrompt + modal install informatif (instruksi spesifik iOS Safari / Android Chrome / desktop) + dismissPwaBanner exposed ke window + handler error-safe
// Pre-cache hanya file critical (bukan semua icons)
const SHELL = [
  './', './index.html', './style.css', './app.js', './api-client.js', './config.js',
  './manifest.json', './icons/logo.png'
];

self.addEventListener('install', (event) => {
  // Skip waiting agar SW baru langsung aktif
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Hapus cache lama + klaim client langsung
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Hanya cache GET request dari same-origin
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Strategy: Network-first untuk HTML/JS/CSS (selalu ambil versi terbaru)
  // Cache-first untuk gambar & font
  if (req.destination === 'document' || req.destination === 'script' || req.destination === 'style') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first untuk gambar/icon/font
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
