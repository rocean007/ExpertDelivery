import { createClient } from 'redis';
import type { RunRecord, Stop } from '@/types';

const RUN_TTL_SECONDS = 86400; // 24 hours
const ARCHIVE_TTL_SECONDS = 172800; // 48 hours

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient> | null = null;

async function getRedis(): Promise<RedisClient> {
  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisConnectPromise) {
    return redisConnectPromise;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  const client = createClient({ url });
  client.on('error', (error: unknown) => {
    console.error('[Redis] client error:', error);
  });

  redisConnectPromise = client.connect().then(() => {
    redisClient = client;
    return client;
  }).finally(() => {
    redisConnectPromise = null;
  });

  return redisConnectPromise;
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  try {
    const redis = await getRedis();
    const data = await redis.get(`run:${runId}`);
    return data ? (JSON.parse(data) as RunRecord) : null;
  } catch (error) {
    console.error('[Redis] getRun error:', error);
    return null;
  }
}

export async function saveRun(
  run: RunRecord,
  ttlSeconds: number = RUN_TTL_SECONDS
): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(`run:${run.runId}`, JSON.stringify(run), { EX: ttlSeconds });
  } catch (error) {
    console.error('[Redis] saveRun error:', error);
    throw new Error('Failed to save run to Redis store');
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
    const redis = await getRedis();
    const data = await redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch (error) {
    console.error('[Redis] cacheGet error:', key, error);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error('[Redis] cacheSet error:', key, error);
  }
}
