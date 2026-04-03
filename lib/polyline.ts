import type { LatLng } from '@/types';

interface GoogleMapsWaypoint {
  position: LatLng;
  query?: string;
}

/**
 * Decode an encoded polyline string into an array of LatLng coordinates.
 * Uses the Google/OSRM encoded polyline format (precision 5).
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = Math.pow(10, precision);
  const coords: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coords.push({
      lat: lat / factor,
      lng: lng / factor,
    });
  }

  return coords;
}

export function encodePolyline(coords: LatLng[], precision = 5): string {
  const factor = Math.pow(10, precision);
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coords) {
    const lat = Math.round(coord.lat * factor);
    const lng = Math.round(coord.lng * factor);

    output += encodeNumber(lat - prevLat);
    output += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

function encodeNumber(num: number): string {
  let value = num < 0 ? ~(num << 1) : num << 1;
  let output = '';

  while (value >= 0x20) {
    output += String.fromCharCode(((0x20 | (value & 0x1f)) + 63));
    value >>= 5;
  }

  output += String.fromCharCode(value + 63);
  return output;
}

export function buildGoogleMapsUrl(
  origin: LatLng,
  destination: GoogleMapsWaypoint,
  waypoints: GoogleMapsWaypoint[] = []
): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: destination.query?.trim() || `${destination.position.lat},${destination.position.lng}`,
    travelmode: 'driving',
  });

  if (waypoints.length > 0) {
    params.set(
      'waypoints',
      waypoints
        .map((w) => w.query?.trim() || `${w.position.lat},${w.position.lng}`)
        .join('|')
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
