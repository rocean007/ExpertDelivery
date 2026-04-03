import { kv } from '@vercel/kv';
import type { RunRecord, Stop } from '@/types';

const RUN_TTL_SECONDS = 86400; // 24 hours
const ARCHIVE_TTL_SECONDS = 172800; // 48 hours

export async function getRun(runId: string): Promise<RunRecord | null> {
  try {
    const data = await kv.get<RunRecord>(`run:${runId}`);
    return data ?? null;
  } catch (error) {
    console.error('[KV] getRun error:', error);
    return null;
  }
}

export async function saveRun(
  run: RunRecord,
  ttlSeconds: number = RUN_TTL_SECONDS
): Promise<void> {
  try {
    await kv.set(`run:${run.runId}`, run, { ex: ttlSeconds });
  } catch (error) {
    console.error('[KV] saveRun error:', error);
    throw new Error('Failed to save run to KV store');
  }
}

export async function updateStopStatus(
  runId: string,
  stopId: string,
  status: Stop['status']
): Promise<RunRecord> {
  const run = await getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const now = new Date().toISOString();
  const updatedStops = run.stops.map((stop) => {
    if (stop.id !== stopId) return stop;

    const updated: Stop = { ...stop, status };

    if (status === 'arrived') {
      updated.arrivedAt = now;
    } else if (status === 'delivered') {
      updated.deliveredAt = now;
      if (!updated.arrivedAt) {
        updated.arrivedAt = now;
      }
    }

    return updated;
  });

  const allDone = updatedStops.every(
    (s) => s.status === 'delivered' || s.status === 'skipped'
  );

  const updatedRun: RunRecord = {
    ...run,
    stops: updatedStops,
    status: allDone ? 'completed' : run.status,
  };

  await saveRun(updatedRun);
  return updatedRun;
}

export async function archiveRun(runId: string): Promise<RunRecord> {
  const run = await getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const updatedRun: RunRecord = { ...run, status: 'archived' };
  await saveRun(updatedRun, ARCHIVE_TTL_SECONDS);
  return updatedRun;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await kv.get<T>(key);
    return data ?? null;
  } catch (error) {
    console.error('[KV] cacheGet error:', key, error);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    await kv.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.error('[KV] cacheSet error:', key, error);
  }
}
