/* Kaha Gaya Mera Paisa — service worker
 * - makes the app installable and open instantly (even offline)
 * - receives screenshots/statements shared from other apps (GPay, Gallery, Files) → Jaadu Scanner
 * Money data is NOT cached here; it lives in your Google Sheet (the page keeps a last-seen copy for offline viewing).
 */
const CACHE = 'kgmp-shell-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'kgmp-share').map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) { e.respondWith(receiveShare(e.request)); return; }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API calls + fonts go straight to the network
  if (e.request.mode === 'navigate') {
    // network first so updates show up; cached shell when offline
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put('./index.html', copy));
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

async function receiveShare(request) {
  const form = await request.formData();
  const c = await caches.open('kgmp-share');
  let i = 0;
  for (const f of form.getAll('files')) {
    if (!f || !f.size) continue;
    await c.put('./shared/' + Date.now() + '-' + (i++), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'shared'), 'x-kind': 'file' } }));
  }
  const text = [form.get('title'), form.get('text')].filter(Boolean).join(' ').trim();
  if (text) await c.put('./shared/' + Date.now() + '-t', new Response(text, { headers: { 'content-type': 'text/plain', 'x-kind': 'text' } }));
  return Response.redirect('./?share=1&tab=' + (i ? 'jaadu' : 'home'), 303);
}
