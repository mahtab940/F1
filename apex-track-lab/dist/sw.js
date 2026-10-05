// Bump the version whenever the app shell changes. Updates activate after all app windows close.
const CACHE = 'apex-shell-v6';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './engine.js', './track-editor.js', './cars.js', './assets/three.module.js', './manifest.webmanifest', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('apex-shell-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const asset = event.request.mode === 'navigate' ? new URL('./index.html', self.registration.scope).href : url.href;
  if (!ASSETS.some(path => new URL(path, self.registration.scope).href === asset)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(asset)) || fetch(event.request)));
});
