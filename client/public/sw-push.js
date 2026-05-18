/* Service Worker — PWA + Push Notifications */

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `static-${CACHE_VERSION}`
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
]

// ── Install: pre-cache shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch strategy ──
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and browser extension requests
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/uploads/')) return

  // API: network-first, no cache fallback (fresh data always preferred)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    )
    return
  }

  // Static assets (JS/CSS/fonts/images): cache-first
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // HTML navigation: network-first, fall back to cached '/' (app shell)
  if (request.headers.get('accept')?.includes('text/html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match('/').then((cached) => cached || fetch(request)))
    )
    return
  }
})

// ── Push Notifications ──
self.addEventListener('push', (event) => {
  let data = { title: 'VxperS Store', body: '', icon: '/favicon.ico' }
  try { data = { ...data, ...(event.data?.json() || {}) } } catch {}

  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    image: data.image || undefined,
    tag: data.tag || 'vxpers-notification',
    renotify: !!data.tag,
    requireInteraction: !!data.require_interaction,
    data: { link: data.link || '/' },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(data.title || 'VxperS Store', options))
})

// ── Notification click ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification?.data?.link || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(link)
          return c.focus()
        }
      }
      return clients.openWindow(link)
    })
  )
})

// ── Background sync (future-proof) ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') {
    event.waitUntil(Promise.resolve())
  }
})
