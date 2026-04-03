import type { LatLng } from '@/types';

export function livePathStorageKey(runId: string): string {
  return `ot-live-gps:${runId}`;
}

export function loadLivePath(runId: string): LatLng[] {
  try {
    const raw = localStorage.getItem(livePathStorageKey(runId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LatLng[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLivePath(runId: string, path: LatLng[]): void {
  try {
    localStorage.setItem(livePathStorageKey(runId), JSON.stringify(path));
  } catch {
    /* quota / private mode */
  }
}

export function clearLivePath(runId: string): void {
  try {
    localStorage.removeItem(livePathStorageKey(runId));
  } catch {
    /* noop */
  }
}
