import { NextRequest, NextResponse } from 'next/server';
import { geocodeSuggestions } from '@/lib/geocode';
import type { ApiResponse, GeocodeLookupResult } from '@/types';

export const runtime = 'nodejs';

function success<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

function failure(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<GeocodeLookupResult>>> {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 5;
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(8, parsedLimit)) : 5;

  if (!q || q.trim().length < 3) {
    return failure('Query parameter "q" is required and must be at least 3 characters');
  }

  try {
    const suggestions = await geocodeSuggestions(q.trim(), limit);
    const best = suggestions[0] ?? null;
    return success({
      bestMatch: best ? { lat: best.lat, lng: best.lng } : null,
      suggestions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Geocoding failed';
    return failure(msg, 500);
  }
}
