// Minimal service worker for WITS.
//
// IMPORTANT: this intentionally does NOT cache Supabase API responses.
// Caching inventory/transfer data would risk showing stale stock counts
// or letting someone submit against an out-of-date product list. All it
// does is let the browser install the app shell (HTML/JS/CSS/icons) so
// the "Install app" prompt appears — actual data always comes fresh from
// the network.

const CACHE_NAME = 'wits-shell-v1'
const SHELL_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept API calls (Supabase, functions, etc.) — always go to
  // the network so data is never served stale.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // Network-first for the app shell, falling back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request)),
  )
})
