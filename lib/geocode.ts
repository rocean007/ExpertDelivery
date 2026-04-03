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

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function firstAddressSegment(value: string): string {
  const i = value.indexOf(',');
  return i >= 0 ? value.slice(0, i).trim() : value.trim();
}

function dedupeByNameAndApproxPosition(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const deduped: GeocodeResult[] = [];

  for (const item of results) {
    const name = normalizeText(item.displayName || '');
    const key = `${name}:${item.lat.toFixed(5)}:${item.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function rankGeocodeResults(query: string, results: GeocodeResult[], countryCodes?: string): GeocodeResult[] {
  const q = normalizeText(query);
  const qTokens = tokenize(query);
  const firstToken = qTokens[0] || '';
  const countryHints = (countryCodes || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  const scored = results.map((item) => {
    const name = item.displayName || '';
    const n = normalizeText(name);
    const nTokens = tokenize(name);

    let score = 0;

    // Keep provider relevance as a baseline.
    score += (item.importance ?? 0) * 6;

    // Strong signal for exact and prefix matches.
    if (n === q) score += 12;
    if (n.startsWith(q)) score += 7;
    if (q.length >= 5 && n.includes(q)) score += 3;

    // Reward how many query tokens are represented.
    const tokenMatches = qTokens.filter((t) => nTokens.some((nt) => nt === t || nt.startsWith(t))).length;
    const coverage = qTokens.length > 0 ? tokenMatches / qTokens.length : 0;
    score += coverage * 8;

    // Query's first token usually carries the place identity.
    if (firstToken && nTokens.some((t) => t === firstToken || t.startsWith(firstToken))) {
      score += 2.5;
    }

    // Mild country bias when caller requests one.
    if (countryHints.length > 0) {
      const hasCountryHint = countryHints.some((c) => n.includes(c));
      if (hasCountryHint) score += 1.2;
    }

    // Penalize very long noisy labels for short queries.
    if (q.length <= 8 && n.length > 90) {
      score -= 1.4;
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
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
  const upstreamLimit = Math.max(safeLimit, Math.min(20, safeLimit * 3));
  let url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${upstreamLimit}&addressdetails=1&dedupe=1`;
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

  const mapped = results.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.display_name,
    importance: typeof item.importance === 'number' ? item.importance : undefined,
  }));

  const deduped = dedupeByNameAndApproxPosition(mapped);
  return rankGeocodeResults(query, deduped, countryCodes).slice(0, safeLimit);
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

async function fetchGoogleSuggestions(
  query: string,
  limit: number,
  countryCodes?: string
): Promise<GeocodeResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    address: query,
    key: apiKey,
  });

  const firstCountry = countryCodes?.split(',')[0]?.trim().toLowerCase();
  if (firstCountry) {
    params.set('components', `country:${firstCountry}`);
    params.set('region', firstCountry);
  }

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Google geocode returned ${response.status}`);
  }

  const data = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (data.status !== 'OK' || !Array.isArray(data.results)) return [];

  return data.results
    .slice(0, Math.max(1, Math.min(10, Math.floor(limit))))
    .map((result) => {
      const lat = result.geometry?.location?.lat;
      const lng = result.geometry?.location?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        displayName: result.formatted_address || `${lat},${lng}`,
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

    // If many results look weak, try with the first segment (often the POI/street core).
    const core = firstAddressSegment(normalized);
    if (core.length >= 3 && core !== normalized) {
      const coreResults = await enqueueRequest(() => fetchNominatimSuggestions(core, safeLimit, cc));
      const merged = dedupeByNameAndApproxPosition([...coreResults, ...results]);
      results = rankGeocodeResults(normalized, merged, cc).slice(0, safeLimit);
    }

    // If country bias is too strict, retry globally before giving up.
    if (results.length === 0 && cc) {
      results = await enqueueRequest(() =>
        fetchNominatimSuggestions(normalized, safeLimit)
      );
    }

    // Optional higher-accuracy fallback when GOOGLE_MAPS_API_KEY is available.
    if (results.length === 0) {
      results = await fetchGoogleSuggestions(normalized, safeLimit, cc);
    }

    // Last fallback: OpenRouteService geocoder when configured.
    if (results.length === 0) {
      results = await fetchOrsSuggestions(normalized, safeLimit, cc);
    }

    if (results.length > 0) {
      results = rankGeocodeResults(normalized, dedupeByNameAndApproxPosition(results), cc).slice(0, safeLimit);
    }

    await cacheSet(cacheKey, results, GEOCODE_TTL);
    return results;
  } catch (error) {
    console.error('[Geocode] Error fetching suggestions:', address, error);
    return [];
  }
}
