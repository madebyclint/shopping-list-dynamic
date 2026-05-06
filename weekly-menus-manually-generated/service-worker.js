/**
 * Brooklyn Kitchen — Service Worker
 *
 * Strategy: network-first for everything (app is DB-backed and real-time).
 * Static shell (HTML + CSS) is cached so the app at least opens offline.
 */

const CACHE_NAME   = 'brooklyn-kitchen-v1';
const SHELL_ASSETS = ['/', '/styles.css'];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

// ── Activate: remove stale caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// ── Fetch: network-first; fall back to cache for page navigations ─────────────
self.addEventListener('fetch', (event) => {
  // Only intercept same-origin GET requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // For API / SSE endpoints always go to network (never cache)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/events')) return;

  if (event.request.mode === 'navigate') {
    // Navigation: network first, fall back to cached shell
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('/') ?? caches.match(event.request)),
    );
  } else {
    // Static assets: network first, update cache, fall back to cache
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
  }
});
