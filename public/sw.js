// My Little Pomodoro — service worker: offline app shell, cached photos, push notifications.
const CACHE = 'pomodoro-v6';
const PHOTOS = 'pomodoro-photos-v1';
const SHELL = [
  '/', '/style.css', '/manifest.webmanifest', '/favicon.png', '/brand/mark.webp', '/brand/logo.webp', '/data/who-growth.json',
  '/js/app.js', '/js/api.js', '/js/store.js', '/js/idb.js', '/js/util.js', '/js/ui.js', '/js/prefs.js', '/js/theme.js', '/js/growth.js',
  '/js/views/auth.js', '/js/views/today.js', '/js/views/history.js', '/js/views/growth.js', '/js/views/memories.js',
  '/js/views/more.js', '/js/views/guide.js', '/js/views/log.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PHOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Photos never change once uploaded: cache-first so albums work offline.
  if (url.origin === location.origin && /^\/api\/families\/[^/]+\/photos\//.test(url.pathname)) {
    e.respondWith(caches.open(PHOTOS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // Other API calls always go to the network (the app keeps its own offline copy).
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  // Network first so updates arrive right away; cached copy when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : undefined)))
  );
});

// ---------- Push notifications ----------
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'My Little Pomodoro', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  const tab = (url.split('#')[1] || '').trim();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => new URL(c.url).origin === location.origin);
    if (win) { win.postMessage({ type: 'navigate', tab }); return win.focus(); }
    return self.clients.openWindow(url);
  }));
});
