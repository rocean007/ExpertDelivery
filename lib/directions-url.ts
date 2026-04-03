import type { LatLng } from '@/types';

export interface GoogleMapsTarget {
  position: LatLng;
  query?: string;
}

const COORD_PRECISION = 6;

function fmt(c: LatLng): string {
  return `${c.lat.toFixed(COORD_PRECISION)},${c.lng.toFixed(COORD_PRECISION)}`;
}

function queryText(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toGoogleMapsValue(target: GoogleMapsTarget): string {
  return queryText(target.query) ?? fmt(target.position);
}

/**
 * Opens Google Maps with the same stop order as our optimized run (driving).
 * Uses the official Maps URLs API (no API key).
 * @see https://developers.google.com/maps/documentation/urls/get-started
 */
export function buildGoogleMapsDirectionsUrl(
  depot: GoogleMapsTarget,
  orderedStops: GoogleMapsTarget[]
): string | null {
  if (orderedStops.length === 0) return null;

  const origin = toGoogleMapsValue(depot);
  const destination = toGoogleMapsValue(orderedStops[orderedStops.length - 1]);

  if (orderedStops.length === 1) {
    const p = new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'driving',
    });
    return `https://www.google.com/maps/dir/?${p.toString()}`;
  }

  const middle = orderedStops.slice(0, -1).map(toGoogleMapsValue);
  const p = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
    waypoints: middle.join('|'),
  });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/**
 * Opens a single coordinate in Google Maps (no API key).
 */
export function buildGoogleMapsLocationUrl(target: GoogleMapsTarget): string {
  const p = new URLSearchParams({
    api: '1',
    query: toGoogleMapsValue(target),
  });

  return `https://www.google.com/maps/search/?${p.toString()}`;
}
