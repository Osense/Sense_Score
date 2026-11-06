import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`))).flat()
}
const files = (await walk('dist')).filter(f => !f.endsWith('/sw.js'))
const hash = createHash('sha256')
for (const file of files.sort()) hash.update(await readFile(file))
const cache = `sense-score-${hash.digest('hex').slice(0, 16)}`
const urls = files.map(f => `./${f.slice(5)}`)
await writeFile('dist/sw.js', `
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sense-score-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); }
      catch { return (await cache.match('./index.html', { ignoreVary: true })) || Response.error(); }
    }
    return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request);
  }));
});
`)
console.log(`Offline cache: ${files.length} local assets`)
