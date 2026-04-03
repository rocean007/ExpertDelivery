/* OT Delivery Router — offline shell, tiles, and cached GET run responses */
const VERSION = 'ot-delivery-offline-v1';
const CACHE_STATIC = `${VERSION}-static`;
const CACHE_PAGES = `${VERSION}-pages`;
const CACHE_API = `${VERSION}-api`;
const CACHE_TILES = `${VERSION}-tiles`;
const MAX_TILE_ENTRIES = 400;
const BASE_PATH = '/expertdelivery';

function stripBasePath(pathname) {
  if (pathname.startsWith(BASE_PATH + '/')) {
    return pathname.slice(BASE_PATH.length);
  }
  return pathname;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

const KEEP_CACHES = new Set([CACHE_STATIC, CACHE_PAGES, CACHE_API, CACHE_TILES]);

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP_CACHES.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstApi(request) {
  const cache = await caches.open(CACHE_API);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error('Offline and no cached API response');
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_PAGES);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === 'GET') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error('Offline and no cached page');
  }
}

let tileTrimPromise = null;
async function trimTileCache() {
  if (tileTrimPromise) return tileTrimPromise;
  tileTrimPromise = (async () => {
    const cache = await caches.open(CACHE_TILES);
    const keys = await cache.keys();
    if (keys.length <= MAX_TILE_ENTRIES) return;
    const toDrop = keys.length - MAX_TILE_ENTRIES;
    for (let i = 0; i < toDrop; i += 1) {
      await cache.delete(keys[i]);
    }
  })().finally(() => {
    tileTrimPromise = null;
  });
  return tileTrimPromise;
}

async function tileCacheStrategy(request) {
  const cache = await caches.open(CACHE_TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await trimTileCache();
    }
    return response;
  } catch (e) {
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  const path = stripBasePath(url.pathname);

  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(tileCacheStrategy(request));
    return;
  }

  if (path === '/sw.js' || path === '/manifest.webmanifest') {
    return;
  }

  if (url.origin !== self.location.origin) {
    if (url.hostname === 'unpkg.com' && url.pathname.includes('leaflet')) {
      event.respondWith(cacheFirst(request, CACHE_STATIC));
    }
    return;
  }

  if (path.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  if (path.startsWith('/api/v1/runs/') && !path.includes('/stops/')) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstPage(request));
    return;
  }
});
