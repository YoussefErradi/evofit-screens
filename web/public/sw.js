const cacheName = 'evofit-display-media-v1';
const maxVideoBytes = 50 * 1024 * 1024;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_MEDIA' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    for (const url of event.data.urls.slice(0, 2)) {
      if (typeof url !== 'string' || !url.startsWith('/api/media/')) continue;
      try {
        if (await cache.match(url)) continue;
        const response = await fetch(url, { credentials: 'omit' });
        const size = Number(response.headers.get('content-length'));
        if (response.ok && size > 0 && size <= maxVideoBytes) await cache.put(url, response);
      } catch { /* The display retries on the next content poll. */ }
    }
    const current = event.data.urls.slice(0, 2);
    if ((await Promise.all(current.map(url => cache.match(url)))).every(Boolean)) {
      const keys = await cache.keys();
      for (const key of keys) if (!current.includes(new URL(key.url).pathname + new URL(key.url).search)) await cache.delete(key);
    }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.pathname.startsWith('/api/media/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) return response;
    } catch { /* Use the prefetched copy if available. */ }
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url.href);
    if (!cached) return new Response('Video unavailable offline', { status: 503 });
    const range = event.request.headers.get('range');
    if (!range) return cached;
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416 });
    const blob = await cached.blob();
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
    if (start >= blob.size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
    return new Response(blob.slice(start, end + 1), { status: 206, headers: {
      'Content-Type': cached.headers.get('content-type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    } });
  })());
});
