/**
 * TERTIB DISIPLIN - PWA Service Worker
 * Version: 2.0.0 (bumped to force cache invalidation for previous v1 users)
 *
 * Strategy: Network-first for HTML/CSS/JS (so updates show immediately),
 * cache-first fallback only when offline.
 */

const SW_VERSION = 'tertib-disiplin-v83-loading-overlay';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/logo.png',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: pre-cache app shell, skip waiting to activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_VERSION)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete ALL old caches (different version name), claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== SW_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          // Tell the page to reload so it picks up new assets
          client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
        });
      }))
  );
});

// Fetch: network-first for navigation & static assets, cache fallback for offline
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin & API requests — always go to network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'Offline mode active' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Network-first for HTML/CSS/JS — ensures users always get latest version
  if (request.mode === 'navigate' ||
      /\.(html|css|js|json|svg|png|jpg|jpeg|gif|webp)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(SW_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Default: stale-while-revalidate for other assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(SW_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
