import { NextRequest, NextResponse } from 'next/server';
import { updateStopStatus } from '@/lib/kv';
import type { ApiResponse, RunRecord, Stop } from '@/types';

export const runtime = 'nodejs';

function success<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

function failure(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });
}

const VALID_STATUSES: Stop['status'][] = ['pending', 'arrived', 'delivered', 'skipped'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; stopId: string }> }
): Promise<NextResponse<ApiResponse<RunRecord>>> {
  const { runId, stopId } = await params;

  let body: { status: Stop['status'] };
  try {
    body = (await req.json()) as { status: Stop['status'] };
  } catch {
    return failure('Invalid JSON body');
  }

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return failure(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  try {
    const run = await updateStopStatus(runId, stopId, body.status);
    return success(run);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return failure(msg, 404);
  }
}
