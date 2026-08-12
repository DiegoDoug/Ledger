/*
 * Ledger service worker.
 *
 * Ledger's data lives in IndexedDB, so the only thing that needs caching is the
 * application itself. The strategy is deliberately conservative:
 *
 * - Navigations are network-first with a cached shell fallback, so a new deploy
 *   is picked up the moment the user is online and the app still opens offline.
 * - Static assets are cache-first, which is safe because Vite content-hashes
 *   every filename — a changed file is a changed URL.
 * - Anything that is not a same-origin GET is passed straight through.
 *
 * The cache name comes from the `v` query parameter on the registration URL, so
 * bumping the app version installs a new worker and evicts the old cache.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `ledger-${VERSION}`

/** Resolved against the worker's scope so it works at any base path. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // One failed shell entry must not fail the whole install.
      await Promise.allSettled(SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' }))))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name.startsWith('ledger-') && name !== CACHE).map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put('./index.html', response.clone())
    return response
  } catch {
    return (
      (await cache.match('./index.html')) ??
      (await cache.match('./')) ??
      new Response('Ledger is offline and no cached copy is available.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    // Opaque and error responses are not worth persisting.
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    if (cached) return cached
    throw error
  }
}
