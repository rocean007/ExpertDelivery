import { cacheGet, cacheSet } from './kv';
import type { LatLng, TripOptimizationResult, OsrmTripResponse, OsrmRouteResponse } from '@/types';
import { createHash } from 'crypto';

const OSRM_BASE = 'https://router.project-osrm.org';
const MATRIX_TTL = 3600; // 1 hour
const POLYLINE_TTL = 21600; // 6 hours
const MAX_RETRIES = 3;

function coordString(coords: LatLng[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(';');
}

function hashCoords(coords: LatLng[]): string {
  const str = coords.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join('|');
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'OTDeliveryRouter/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`OSRM HTTP ${response.status}`);
      }
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }
  throw new Error('OSRM: Max retries exceeded');
}

export async function getTripOptimization(
  coords: LatLng[]
): Promise<TripOptimizationResult> {
  if (coords.length < 2) {
    throw new Error('Need at least 2 coordinates for trip optimization');
  }

  const cacheKey = `osrm:trip:${hashCoords(coords)}`;
  const cached = await cacheGet<TripOptimizationResult>(cacheKey);
  if (cached) return cached;

  const coordStr = coordString(coords);
  const url = `${OSRM_BASE}/trip/v1/driving/${coordStr}?roundtrip=false&source=first&destination=last&overview=full&geometries=polyline`;

  const response = await fetchWithRetry(url);
  const data = (await response.json()) as OsrmTripResponse;

  if (data.code !== 'Ok' || !data.trips || data.trips.length === 0) {
    throw new Error(`OSRM trip failed: ${data.code}`);
  }

  const trip = data.trips[0];
  const waypoints = data.waypoints.map((w) => w.waypoint_index);

  const distances: number[] = [];
  const durations: number[] = [];
  for (const leg of trip.legs) {
    distances.push(leg.distance / 1000); // convert to km
    durations.push(leg.duration / 60);   // convert to minutes
  }

  const result: TripOptimizationResult = {
    waypoints,
    polyline: trip.geometry,
    distances,
    durations,
  };

  await cacheSet(cacheKey, result, POLYLINE_TTL);
  return result;
}

export async function getRoutePolyline(coords: LatLng[]): Promise<string> {
  if (coords.length < 2) {
    throw new Error('Need at least 2 coordinates for route');
  }

  const cacheKey = `osrm:route:${hashCoords(coords)}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  const coordStr = coordString(coords);
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=polyline`;

  const response = await fetchWithRetry(url);
  const data = (await response.json()) as OsrmRouteResponse;

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM route failed: ${data.code}`);
  }

  const polyline = data.routes[0].geometry;
  await cacheSet(cacheKey, polyline, POLYLINE_TTL);
  return polyline;
}

export async function getDistanceMatrix(
  coords: LatLng[]
): Promise<number[][]> {
  const cacheKey = `osrm:matrix:${hashCoords(coords)}`;
  const cached = await cacheGet<number[][]>(cacheKey);
  if (cached) return cached;

  const coordStr = coordString(coords);
  const url = `${OSRM_BASE}/table/v1/driving/${coordStr}?annotations=duration,distance`;

  const response = await fetchWithRetry(url);
  const data = (await response.json()) as {
    code: string;
    distances?: number[][];
    durations?: number[][];
  };

  if (data.code !== 'Ok') {
    throw new Error(`OSRM table failed: ${data.code}`);
  }

  // Prefer distances, fallback to durations for TSP
  const matrix = data.distances || data.durations;
  if (!matrix) {
    throw new Error('OSRM table returned no matrix data');
  }

  await cacheSet(cacheKey, matrix, MATRIX_TTL);
  return matrix;
}

export async function getRouteLegDetails(
  coords: LatLng[]
): Promise<{ distances: number[]; durations: number[] }> {
  if (coords.length < 2) {
    return { distances: [], durations: [] };
  }

  const coordStr = coordString(coords);
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=false`;

  const response = await fetchWithRetry(url);
  const data = (await response.json()) as OsrmRouteResponse;

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM route details failed: ${data.code}`);
  }

  const distances = data.routes[0].legs.map((l) => l.distance / 1000);
  const durations = data.routes[0].legs.map((l) => l.duration / 60);

  return { distances, durations };
}
