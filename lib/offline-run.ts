import type { RunRecord, Stop } from '@/types';
import { getSignedHeaders } from '@/lib/client-signing';
import { withBasePath } from '@/lib/base-path';

const SNAPSHOT_PREFIX = 'ot-run-snapshot:';
const SYNC_QUEUE_KEY = 'ot-stop-sync-queue';

export type QueuedStopPatch = { runId: string; stopId: string; status: Stop['status'] };

export function saveRunSnapshot(run: RunRecord): void {
  try {
    localStorage.setItem(SNAPSHOT_PREFIX + run.runId, JSON.stringify(run));
  } catch (e) {
    console.warn('[Offline] Could not save run snapshot', e);
  }
}

export function loadRunSnapshot(runId: string): RunRecord | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + runId);
    if (!raw) return null;
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

export function readStopPatchQueue(): QueuedStopPatch[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedStopPatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pendingPatchesForRun(runId: string): number {
  return readStopPatchQueue().filter((q) => q.runId === runId).length;
}

export function enqueueStopPatch(item: QueuedStopPatch): void {
  const queue = readStopPatchQueue();
  queue.push(item);
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[Offline] Could not enqueue stop patch', e);
  }
}

function writeStopPatchQueue(queue: QueuedStopPatch[]): void {
  if (queue.length === 0) {
    localStorage.removeItem(SYNC_QUEUE_KEY);
    return;
  }
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function applyStopStatusLocally(
  run: RunRecord,
  stopId: string,
  status: Stop['status'],
  nowIso: string
): RunRecord {
  const stops = run.stops.map((s) => {
    if (s.id !== stopId) return s;
    const updated: Stop = { ...s, status };
    if (status === 'arrived') {
      updated.arrivedAt = nowIso;
    } else if (status === 'delivered') {
      updated.deliveredAt = nowIso;
      if (!updated.arrivedAt) {
        updated.arrivedAt = nowIso;
      }
    }
    return updated;
  });

  const allDone = stops.every(
    (s) => s.status === 'delivered' || s.status === 'skipped'
  );

  return {
    ...run,
    stops,
    status: allDone ? 'completed' : run.status,
  };
}

export async function flushStopPatchQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const queue = readStopPatchQueue();
  if (queue.length === 0) return;

  const remaining: QueuedStopPatch[] = [];

  for (const item of queue) {
    try {
      const body = JSON.stringify({ status: item.status });
      const signedHeaders = await getSignedHeaders(body);
      const res = await fetch(withBasePath(`/api/v1/runs/${item.runId}/stops/${item.stopId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...signedHeaders,
        },
        body,
      });

      if (!res.ok) {
        remaining.push(item);
        continue;
      }

      const json = (await res.json()) as { success: boolean; data?: RunRecord };
      if (json.success && json.data) {
        saveRunSnapshot(json.data);
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  writeStopPatchQueue(remaining);
}
