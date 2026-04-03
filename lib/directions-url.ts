import type { LatLng } from '@/types';

const COORD_PRECISION = 6;

function fmt(c: LatLng): string {
  return `${c.lat.toFixed(COORD_PRECISION)},${c.lng.toFixed(COORD_PRECISION)}`;
}

/**
 * Opens Google Maps with the same stop order as our optimized run (driving).
 * Uses the official Maps URLs API (no API key).
 * @see https://developers.google.com/maps/documentation/urls/get-started
 */
export function buildGoogleMapsDirectionsUrl(
  depot: LatLng,
  orderedStops: LatLng[]
): string | null {
  if (orderedStops.length === 0) return null;

  const origin = fmt(depot);
  const destination = fmt(orderedStops[orderedStops.length - 1]);

  if (orderedStops.length === 1) {
    const p = new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'driving',
    });
    return `https://www.google.com/maps/dir/?${p.toString()}`;
  }

  const middle = orderedStops.slice(0, -1).map(fmt);
  const p = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
    waypoints: middle.join('|'),
  });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
