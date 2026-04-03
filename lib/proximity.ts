import type { LatLng, Stop, RunRecord } from '@/types';

const EARTH_RADIUS_M = 6371000;

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function findNextUndeliveredStop(
  run: RunRecord,
  currentPosition: LatLng
): { stop: Stop; distance: number; index: number } | null {
  for (let i = 0; i < run.stops.length; i++) {
    const stop = run.stops[i];
    if (stop.status === 'pending' || stop.status === 'arrived') {
      const distance = calculateDistance(
        currentPosition.lat,
        currentPosition.lng,
        stop.position.lat,
        stop.position.lng
      );
      return { stop, distance, index: i };
    }
  }
  return null;
}

export function shouldTriggerAlert(
  previousDistance: number,
  currentDistance: number,
  thresholdMeters: number
): boolean {
  return previousDistance > thresholdMeters && currentDistance <= thresholdMeters;
}

export function findAllRemainingStops(
  run: RunRecord
): Array<{ stop: Stop; index: number }> {
  return run.stops
    .map((stop, index) => ({ stop, index }))
    .filter(
      ({ stop }) => stop.status === 'pending' || stop.status === 'arrived'
    );
}

export function isOffRoute(
  currentPosition: LatLng,
  routeCoords: LatLng[],
  thresholdMeters = 200
): boolean {
  if (routeCoords.length === 0) return false;

  let minDistance = Infinity;
  for (const coord of routeCoords) {
    const d = calculateDistance(
      currentPosition.lat,
      currentPosition.lng,
      coord.lat,
      coord.lng
    );
    if (d < minDistance) minDistance = d;
  }

  return minDistance > thresholdMeters;
}
