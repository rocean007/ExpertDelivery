import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { geocodeTopResult } from '@/lib/geocode';
import { buildGoogleMapsDirectionsUrl } from '@/lib/directions-url';
import { getTripOptimization, getDistanceMatrix, getRoutePolyline, getRouteLegDetails } from '@/lib/osrm';
import { optimizeTSP } from '@/lib/tsp';
import { saveRun } from '@/lib/kv';
import type { Stop, RunRecord, CreateRunRequest, ApiResponse, LatLng } from '@/types';

const HANDOFF_MINUTES = 3;

export const runtime = 'nodejs';
export const maxDuration = 60;

function success<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() }, { status });
}

function failure(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<RunRecord>>> {
  let body: CreateRunRequest;

  try {
    body = (await req.json()) as CreateRunRequest;
  } catch {
    return failure('Invalid JSON body');
  }

  if (!body.depot) return failure('depot is required');
  if (!body.stops || !Array.isArray(body.stops) || body.stops.length === 0) {
    return failure('stops array is required and must not be empty');
  }
  if (body.stops.length > 20) {
    return failure('Maximum 20 stops per run');
  }

  const runId = body.runId || uuidv4();

  // Resolve depot coordinates (same top hit as /geocode suggestions — Nominatim relevance order)
  let depotPosition: LatLng | null = null;
  let depotAddressResolved: string | undefined;
  if (body.depot.lat !== undefined && body.depot.lng !== undefined) {
    depotPosition = { lat: body.depot.lat, lng: body.depot.lng };
  } else if (body.depot.address) {
    const hit = await geocodeTopResult(body.depot.address);
    if (hit) {
      depotPosition = { lat: hit.lat, lng: hit.lng };
      depotAddressResolved = hit.displayName;
    }
  }

  if (!depotPosition) {
    return failure('Could not resolve depot coordinates. Provide lat/lng or a valid address.');
  }

  const depot: Stop = {
    id: 'depot',
    label: body.depot.label,
    address: depotAddressResolved ?? body.depot.address,
    position: depotPosition,
    status: 'pending',
  };

  // Resolve stop coordinates
  const resolvedStops: Stop[] = [];
  for (const s of body.stops) {
    let position: LatLng | null = null;

    let stopAddressResolved: string | undefined;
    if (s.lat !== undefined && s.lng !== undefined) {
      position = { lat: s.lat, lng: s.lng };
    } else if (s.address) {
      const hit = await geocodeTopResult(s.address);
      if (hit) {
        position = { lat: hit.lat, lng: hit.lng };
        stopAddressResolved = hit.displayName;
      }
    }

    if (!position) {
      return failure(`Could not resolve coordinates for stop "${s.label}" (id: ${s.id})`);
    }

    resolvedStops.push({
      id: s.id,
      label: s.label,
      address: stopAddressResolved ?? s.address,
      position,
      orderId: s.orderId,
      notes: s.notes,
      status: 'pending',
    });
  }

  // Build coordinate list: depot + stops
  const allCoords: LatLng[] = [depotPosition, ...resolvedStops.map((s) => s.position)];

  let optimizedOrder: number[] = [];
  let polyline = '';
  const legDistances: number[] = [];
  const legDurations: number[] = [];

  if (resolvedStops.length <= 12) {
    // Use OSRM trip optimization
    try {
      const trip = await getTripOptimization(allCoords);
      // OSRM returns waypoint indices in optimized order; index 0 = depot (fixed as source)
      optimizedOrder = trip.waypoints.slice(1).map((wi) => wi - 1); // convert to stop indices
      polyline = trip.polyline;

      for (let i = 0; i < trip.distances.length; i++) {
        legDistances.push(trip.distances[i]);
        legDurations.push(trip.durations[i]);
      }
    } catch (err) {
      console.error('[Runs] OSRM trip failed, falling back to TSP:', err);
      // Fallback to client-side TSP
      const matrix = await getDistanceMatrix(allCoords);
      const route = optimizeTSP(matrix, 0);
      optimizedOrder = route.slice(1).map((i) => i - 1);

      // Get polyline for optimized order
      const orderedCoords = [depotPosition, ...optimizedOrder.map((i) => resolvedStops[i].position)];
      polyline = await getRoutePolyline(orderedCoords);

      const details = await getRouteLegDetails(orderedCoords);
      for (let i = 0; i < details.distances.length; i++) {
        legDistances.push(details.distances[i]);
        legDurations.push(details.durations[i]);
      }
    }
  } else {
    // More than 12 stops: TSP fallback
    const matrix = await getDistanceMatrix(allCoords);
    const route = optimizeTSP(matrix, 0);
    optimizedOrder = route.slice(1).map((i) => i - 1);

    const orderedCoords = [depotPosition, ...optimizedOrder.map((i) => resolvedStops[i].position)];
    polyline = await getRoutePolyline(orderedCoords);

    const details = await getRouteLegDetails(orderedCoords);
    for (let i = 0; i < details.distances.length; i++) {
      legDistances.push(details.distances[i]);
      legDurations.push(details.durations[i]);
    }
  }

  // Build ordered stops with ETAs
  const orderedStops: Stop[] = optimizedOrder.map((stopIdx, seqIdx) => {
    const stop = resolvedStops[stopIdx];
    const distKm = legDistances[seqIdx] ?? 0;
    const driveMins = legDurations[seqIdx] ?? 0;

    // Cumulative duration for ETA
    const cumulativeMins = legDurations
      .slice(0, seqIdx + 1)
      .reduce((a, b) => a + b, 0) + seqIdx * HANDOFF_MINUTES;

    const eta = new Date(Date.now() + cumulativeMins * 60 * 1000).toISOString();

    return {
      ...stop,
      distanceFromPrevKm: Math.round(distKm * 100) / 100,
      durationFromPrevMin: Math.round(driveMins),
      eta,
    };
  });

  const totalDistanceKm = legDistances.reduce((a, b) => a + b, 0);
  const totalDurationMin =
    legDurations.reduce((a, b) => a + b, 0) + orderedStops.length * HANDOFF_MINUTES;

  const directionsUrl =
    buildGoogleMapsDirectionsUrl(depot.position, orderedStops.map((s) => s.position)) ?? undefined;

  const run: RunRecord = {
    runId,
    createdAt: new Date().toISOString(),
    depot,
    stops: orderedStops,
    polyline,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    totalDurationMin: Math.round(totalDurationMin),
    directionsUrl,
    status: 'active',
    driverName: body.driverName,
    driverPhone: body.driverPhone,
    vehicleType: body.vehicleType,
  };

  await saveRun(run);

  return success(run, 201);
}
