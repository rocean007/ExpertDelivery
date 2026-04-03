import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geocode';
import type { ApiResponse, LatLng } from '@/types';

export const runtime = 'nodejs';

function success<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

function failure(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<LatLng | null>>> {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q');

  if (!q || q.trim().length < 3) {
    return failure('Query parameter "q" is required and must be at least 3 characters');
  }

  try {
    const result = await geocodeAddress(q.trim());
    return success(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Geocoding failed';
    return failure(msg, 500);
  }
}
