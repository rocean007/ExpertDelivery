import { cacheGet, cacheSet } from './kv';
import type { GeocodeBestMatch, GeocodeMatchConfidence, GeocodeResult, LatLng } from '@/types';

const GEOCODE_TTL = 86400; // 24 hours
const RATE_LIMIT_MS = 1000; // 1 request per second

const DEFAULT_COUNTRY_CODES =
  typeof process !== 'undefined' && process.env.NOMINATIM_COUNTRY_CODES
    ? process.env.NOMINATIM_COUNTRY_CODES.trim().toLowerCase()
    : '';

export interface GeocodeRequestOptions {
  /** Comma-separated ISO 3166-1 alpha2 list, e.g. `np,us`. Passed to Nominatim `countrycodes`. */
  countryCodes?: string;
}

function mergeCountryCodes(explicit?: string): string | undefined {
  const fromEnv = DEFAULT_COUNTRY_CODES || undefined;
  const raw = (explicit ?? fromEnv)?.replace(/\s/g, '').toLowerCase();
  return raw && raw.length > 0 ? raw : undefined;
}

function confidenceFromSuggestions(
  suggestions: GeocodeResult[]
): GeocodeMatchConfidence {
  if (suggestions.length <= 1) return 'high';
  const a = suggestions[0].importance ?? 0;
  const b = suggestions[1].importance ?? 0;
  if (a - b >= 0.12 || (b > 0 && a / b >= 1.35)) return 'high';
  if (a - b >= 0.04) return 'medium';
  return 'low';
}

export function toGeocodeBestMatch(
  suggestions: GeocodeResult[]
): GeocodeBestMatch | null {
  const top = suggestions[0];
  if (!top) return null;
  return {
    lat: top.lat,
    lng: top.lng,
    displayName: top.displayName,
    confidence: confidenceFromSuggestions(suggestions),
  };
}

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

async function fetchNominatimSuggestions(
  query: string,
  limit: number,
  countryCodes?: string
): Promise<GeocodeResult[]> {
  const encoded = encodeURIComponent(query);
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  let url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${safeLimit}&addressdetails=1&dedupe=1`;
  if (countryCodes) {
    url += `&countrycodes=${encodeURIComponent(countryCodes)}`;
  }

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
    importance?: number;
  }>;

  if (!results || results.length === 0) return [];

  return results.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.display_name,
    importance: typeof item.importance === 'number' ? item.importance : undefined,
  }));
}

async function fetchOrsSuggestions(
  query: string,
  limit: number,
  countryCodes?: string
): Promise<GeocodeResult[]> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    api_key: apiKey,
    text: query,
    size: String(Math.max(1, Math.min(10, Math.floor(limit)))),
  });

  if (countryCodes) {
    // ORS accepts single ISO2 country code; for comma lists, use the first one.
    const first = countryCodes.split(',')[0]?.trim();
    if (first) params.set('boundary.country', first);
  }

  const response = await fetch(`https://api.openrouteservice.org/geocode/search?${params.toString()}`, {
    headers: {
      'Accept-Language': 'en',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenRouteService geocode returned ${response.status}`);
  }

  const result = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: { label?: string; confidence?: number };
    }>;
  };

  const features = Array.isArray(result.features) ? result.features : [];
  return features
    .map((f) => {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) return null;
      const [lng, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        displayName: f.properties?.label || `${lat},${lng}`,
        importance: typeof f.properties?.confidence === 'number' ? f.properties.confidence : undefined,
      } as GeocodeResult;
    })
    .filter((v): v is GeocodeResult => v !== null);
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
  address: string,
  options?: GeocodeRequestOptions
): Promise<LatLng | null> {
  const resolved = await geocodeTopResult(address, options);
  return resolved ? { lat: resolved.lat, lng: resolved.lng } : null;
}

/** Best Nominatim hit (by relevance), with optional country bias — same source as suggestions. */
export async function geocodeTopResult(
  address: string,
  options?: GeocodeRequestOptions
): Promise<GeocodeResult | null> {
  const results = await geocodeSuggestions(address, 1, options);
  return results[0] ?? null;
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
  limit = 5,
  options?: GeocodeRequestOptions
): Promise<GeocodeResult[]> {
  const normalized = normalizeQuery(address);
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const country = mergeCountryCodes(options?.countryCodes) ?? '';
  const cacheKey = `geocode:suggest:${normalized}:${safeLimit}:${country}`;

  const cached = await cacheGet<GeocodeResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const cc = mergeCountryCodes(options?.countryCodes);
    let results = await enqueueRequest(() =>
      fetchNominatimSuggestions(normalized, safeLimit, cc)
    );

    // If country bias is too strict, retry globally before giving up.
    if (results.length === 0 && cc) {
      results = await enqueueRequest(() =>
        fetchNominatimSuggestions(normalized, safeLimit)
      );
    }

    // Last fallback: OpenRouteService geocoder when configured.
    if (results.length === 0) {
      results = await fetchOrsSuggestions(normalized, safeLimit, cc);
    }

    await cacheSet(cacheKey, results, GEOCODE_TTL);
    return results;
  } catch (error) {
    console.error('[Geocode] Error fetching suggestions:', address, error);
    return [];
  }
}
