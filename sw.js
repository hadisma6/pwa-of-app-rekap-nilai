const CACHE_NAME = 'sih2i-v1-cache-2025';
const FILES_TO_CACHE = [
  '/pwa-of-app-rekap-nilai/',
  '/pwa-of-app-rekap-nilai/index.html',
  '/pwa-of-app-rekap-nilai/manifest.json',
  '/pwa-of-app-rekap-nilai/icon.svg',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'
];

// 1. Install Service Worker & Cache Files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline pages');
      return cache.addAll(FILES_TO_CACHE).catch(error => {
        console.log('[ServiceWorker] Cache failed:', error);
        // Continue installation even if cache fails
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting(); // Force activation
});

// 2. Activate Service Worker & Clean Old Cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// 3. Fetch Event (Offline First Strategy)
self.addEventListener('fetch', (event) => {
  // Hanya cache request GET (Abaikan POST ke API Google Script)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return dari cache jika ada, jika tidak fetch dari network
      return response || fetch(event.request);
    })
  );
});