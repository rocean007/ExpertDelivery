import { cacheGet, cacheSet } from './kv';
import type { GeocodeResult, LatLng } from '@/types';

const GEOCODE_TTL = 86400; // 24 hours
const RATE_LIMIT_MS = 1000; // 1 request per second

let lastRequestTime = 0;
const requestQueue: Array<() => void> = [];
let isProcessingQueue = false;

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[,]+/g, ',');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;

    if (timeSinceLast < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - timeSinceLast);
    }

    const next = requestQueue.shift();
    if (next) {
      lastRequestTime = Date.now();
      next();
    }
  }

  isProcessingQueue = false;
}

function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    processQueue();
  });
}

async function fetchNominatim(query: string): Promise<GeocodeResult | null> {
  const suggestions = await fetchNominatimSuggestions(query, 1);
  return suggestions[0] ?? null;
}

async function fetchNominatimSuggestions(query: string, limit: number): Promise<GeocodeResult[]> {
  const encoded = encodeURIComponent(query);
  const safeLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${safeLimit}&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OTDeliveryRouter/1.0 (contact@oceantarkari.com)',
      'Accept-Language': 'en',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  const results = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!results || results.length === 0) return [];

  return results.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.display_name,
  }));
}

async function fetchReverseNominatim(
  lat: number,
  lng: number
): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OTDeliveryRouter/1.0 (contact@oceantarkari.com)',
      'Accept-Language': 'en',
    },
  });

  if (!response.ok) return null;

  const result = (await response.json()) as { display_name?: string };
  return result?.display_name ?? null;
}

export async function geocodeAddress(
  address: string
): Promise<LatLng | null> {
  const normalized = normalizeQuery(address);
  const cacheKey = `geocode:${normalized}`;

  const cached = await cacheGet<GeocodeResult>(cacheKey);
  if (cached) {
    return { lat: cached.lat, lng: cached.lng };
  }

  try {
    const result = await enqueueRequest(() => fetchNominatim(normalized));
    if (!result) return null;

    await cacheSet(cacheKey, result, GEOCODE_TTL);
    return { lat: result.lat, lng: result.lng };
  } catch (error) {
    console.error('[Geocode] Error geocoding address:', address, error);
    return null;
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const cacheKey = `reverse-geocode:${lat.toFixed(4)},${lng.toFixed(4)}`;

  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  try {
    const result = await enqueueRequest(() =>
      fetchReverseNominatim(lat, lng)
    );
    if (!result) return null;

    await cacheSet(cacheKey, result, GEOCODE_TTL);
    return result;
  } catch (error) {
    console.error('[Geocode] Error reverse geocoding:', lat, lng, error);
    return null;
  }
}

export async function geocodeSuggestions(
  address: string,
  limit = 5
): Promise<GeocodeResult[]> {
  const normalized = normalizeQuery(address);
  const safeLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const cacheKey = `geocode:suggest:${normalized}:${safeLimit}`;

  const cached = await cacheGet<GeocodeResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const results = await enqueueRequest(() =>
      fetchNominatimSuggestions(normalized, safeLimit)
    );
    await cacheSet(cacheKey, results, GEOCODE_TTL);
    return results;
  } catch (error) {
    console.error('[Geocode] Error fetching suggestions:', address, error);
    return [];
  }
}
