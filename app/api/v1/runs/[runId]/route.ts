import { NextRequest, NextResponse } from 'next/server';
import { getRun, archiveRun } from '@/lib/kv';
import type { ApiResponse, RunRecord } from '@/types';

export const runtime = 'nodejs';

function success<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

function failure(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse<ApiResponse<RunRecord>>> {
  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) return failure(`Run ${runId} not found`, 404);
  return success(run);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse<ApiResponse<RunRecord>>> {
  const { runId } = await params;
  try {
    const run = await archiveRun(runId);
    return success(run);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return failure(msg, 404);
  }
}
