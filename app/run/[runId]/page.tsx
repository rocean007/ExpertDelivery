'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { use } from 'react';
import { calculateDistance, findNextUndeliveredStop, isOffRoute } from '@/lib/proximity';
import { speakText } from '@/lib/elevenlabs';
import { decodePolyline, buildGoogleMapsUrl } from '@/lib/polyline';
import {
  applyStopStatusLocally,
  enqueueStopPatch,
  flushStopPatchQueue,
  loadRunSnapshot,
  pendingPatchesForRun,
  saveRunSnapshot,
} from '@/lib/offline-run';
import { generateSignature } from '@/lib/signing';
import type { RunRecord, LatLng, Stop } from '@/types';

const DriverMap = dynamic(() => import('@/components/DriverMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
    <div className="flex gap-2"><span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" /></div>
  </div>,
});

const STATUS_LABELS: Record<Stop['status'], string> = {
  pending: 'Pending',
  arrived: 'Arrived',
  delivered: 'Delivered',
  skipped: 'Skipped',
};

const STATUS_COLORS: Record<Stop['status'], string> = {
  pending: '#fbbf24',
  arrived: '#a3e635',
  delivered: '#4ade80',
  skipped: '#4d6b42',
};

export default function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [driverPosition, setDriverPosition] = useState<LatLng | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [notification, setNotification] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [updatingStop, setUpdatingStop] = useState<string | null>(null);
  const [loadedFromSnapshot, setLoadedFromSnapshot] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const prevDistancesRef = useRef<Map<string, number>>(new Map());
  const alertCooldownRef = useRef<Map<string, number>>(new Map());
  const watchIdRef = useRef<number | null>(null);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 5000);
  }, []);

  const triggerVoiceAlert = useCallback(async (text: string, stopId: string) => {
    const now = Date.now();
    const lastAlert = alertCooldownRef.current.get(stopId) ?? 0;
    if (now - lastAlert < 30000) return; // 30s cooldown per stop
    alertCooldownRef.current.set(stopId, now);

    showNotification(text);

    if (voiceEnabled) {
      try {
        await speakText(text);
      } catch (e) {
        console.warn('[Voice] Alert failed:', e);
      }
    }

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Delivery Alert', { body: text, icon: '/favicon.ico' });
    }
  }, [voiceEnabled, showNotification]);

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/runs/${runId}`);

      if (!res.ok) {
        const cached = loadRunSnapshot(runId);
        if (cached) {
          setRun(cached);
          setLoadedFromSnapshot(true);
          setError('');
          const firstPending = cached.stops.findIndex(
            (s) => s.status === 'pending' || s.status === 'arrived'
          );
          if (firstPending >= 0) setCurrentStopIndex(firstPending);
        } else {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          setError(json.error || 'Run not found');
        }
        setLoading(false);
        return;
      }

      const json = await res.json() as { success: boolean; data?: RunRecord; error?: string };
      if (json.success && json.data) {
        setRun(json.data);
        saveRunSnapshot(json.data);
        setLoadedFromSnapshot(false);
        setError('');
        const firstPending = json.data.stops.findIndex(
          (s) => s.status === 'pending' || s.status === 'arrived'
        );
        if (firstPending >= 0) setCurrentStopIndex(firstPending);
      } else {
        const cached = loadRunSnapshot(runId);
        if (cached) {
          setRun(cached);
          setLoadedFromSnapshot(true);
          setError('');
          const fp = cached.stops.findIndex(
            (s) => s.status === 'pending' || s.status === 'arrived'
          );
          if (fp >= 0) setCurrentStopIndex(fp);
        } else {
          setError(json.error || 'Run not found');
        }
      }
    } catch {
      const cached = loadRunSnapshot(runId);
      if (cached) {
        setRun(cached);
        setLoadedFromSnapshot(true);
        setError('');
        const fp = cached.stops.findIndex(
          (s) => s.status === 'pending' || s.status === 'arrived'
        );
        if (fp >= 0) setCurrentStopIndex(fp);
      } else {
        setError('Failed to load run');
      }
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    setPendingSync(pendingPatchesForRun(runId));
    flushStopPatchQueue()
      .catch(() => {})
      .finally(() => setPendingSync(pendingPatchesForRun(runId)));
  }, [runId]);

  useEffect(() => {
    const syncOnline = () => setIsOnline(true);
    const syncOffline = () => setIsOnline(false);
    const onOnline = () => {
      syncOnline();
      fetchRun();
      flushStopPatchQueue()
        .catch(() => {})
        .finally(() => setPendingSync(pendingPatchesForRun(runId)));
    };
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', syncOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', syncOffline);
    };
  }, [fetchRun, runId]);

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.warn('[Geo]', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Proximity detection
  useEffect(() => {
    if (!run || !driverPosition) return;

    const result = findNextUndeliveredStop(run, driverPosition);
    if (!result) return;

    const { stop, distance, index } = result;
    const prevDist = prevDistancesRef.current.get(stop.id) ?? Infinity;

    // Approaching: cross 100m threshold
    if (prevDist > 100 && distance <= 100) {
      const text = `Delivery alert. You are now within 100 meters of Stop ${index + 1}: ${stop.label}. ${stop.orderId ? `Order ${stop.orderId}.` : ''}`;
      triggerVoiceAlert(text, `approach-${stop.id}`);
    }

    // Very close: cross 20m threshold
    if (prevDist > 20 && distance <= 20 && stop.status === 'pending') {
      triggerVoiceAlert(`You have arrived. Mark as arrived to continue.`, `arrive-${stop.id}`);
    }

    prevDistancesRef.current.set(stop.id, distance);

    // Check route deviation
    if (run.polyline) {
      const routeCoords = decodePolyline(run.polyline);
      if (isOffRoute(driverPosition, routeCoords, 200)) {
        triggerVoiceAlert('You have deviated from the optimal route. Please check your navigation.', 'deviation');
      }
    }
  }, [driverPosition, run, triggerVoiceAlert]);

  const announceAfterDelivered = useCallback(
    (prevRun: RunRecord, newRun: RunRecord, stopId: string) => {
      const completedIdx = newRun.stops.findIndex((s) => s.id === stopId);
      const nextStop = newRun.stops.find(
        (s, i) => i > completedIdx && s.status === 'pending'
      );
      const stop = prevRun.stops.find((s) => s.id === stopId);
      if (stop && nextStop) {
        const dist = driverPosition
          ? Math.round(
              calculateDistance(
                driverPosition.lat,
                driverPosition.lng,
                nextStop.position.lat,
                nextStop.position.lng
              )
            )
          : 0;
        speakText(
          `Stop ${stop.label} completed. Next stop is ${nextStop.label}${dist > 0 ? ` in ${dist} meters` : ''}.`
        ).catch(() => {});
      }
      if (newRun.status === 'completed') {
        speakText('All deliveries complete! Great work today.').catch(() => {});
        showNotification('🎉 All deliveries completed!');
      }
    },
    [driverPosition, showNotification]
  );

  const updateStop = useCallback(
    async (stopId: string, status: Stop['status']) => {
      if (!run) return;
      setUpdatingStop(stopId);

      const body = JSON.stringify({ status });
      const secret = process.env.NEXT_PUBLIC_HMAC_SECRET || 'dev-secret';
      const applyLocal = (reason: 'offline' | 'queued') => {
        const nowIso = new Date().toISOString();
        const updated = applyStopStatusLocally(run, stopId, status, nowIso);
        setRun(updated);
        saveRunSnapshot(updated);
        enqueueStopPatch({ runId, stopId, status });
        setPendingSync(pendingPatchesForRun(runId));
        const nextPending = updated.stops.findIndex(
          (s) => s.status === 'pending' || s.status === 'arrived'
        );
        if (nextPending >= 0) setCurrentStopIndex(nextPending);
        if (status === 'delivered') {
          announceAfterDelivered(run, updated, stopId);
        }
        showNotification(
          reason === 'offline'
            ? 'Offline — stop saved on device. Will sync when you are back online.'
            : 'Could not reach server — saved on device. Will retry automatically.'
        );
      };

      try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const sig = await generateSignature(body, secret);

        const res = await fetch(`/api/v1/runs/${runId}/stops/${stopId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-timestamp': timestamp,
            'x-signature': sig,
          },
          body,
        });

        if (res.status === 401) {
          showNotification('Could not authorize update. Check your connection and try again.');
          return;
        }

        const json = (await res.json()) as { success: boolean; data?: RunRecord; error?: string };
        if (json.success && json.data) {
          setRun(json.data);
          saveRunSnapshot(json.data);
          setPendingSync(pendingPatchesForRun(runId));
          const nextPending = json.data.stops.findIndex(
            (s) => s.status === 'pending' || s.status === 'arrived'
          );
          if (nextPending >= 0) setCurrentStopIndex(nextPending);

          if (status === 'delivered') {
            announceAfterDelivered(run, json.data, stopId);
          }
          return;
        }

        const retryAsOffline =
          !navigator.onLine || res.status >= 500 || res.status === 408 || res.status === 0;
        if (retryAsOffline) {
          applyLocal('queued');
        } else {
          showNotification(json.error || 'Could not update stop');
        }
      } catch (e) {
        console.error('[Stop update]', e);
        applyLocal('offline');
      } finally {
        setUpdatingStop(null);
      }
    },
    [run, runId, announceAfterDelivered, showNotification]
  );

  const enableVoice = useCallback(async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
    setVoiceEnabled(true);
    speakText('Voice alerts enabled. Drive safe!').catch(() => {});
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="text-center space-y-4">
        <div className="flex gap-2 justify-center"><span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" /></div>
        <p className="font-mono text-sm uppercase tracking-widest" style={{ color: 'var(--accent-green)' }}>Loading run...</p>
      </div>
    </div>
  );

  if (error || !run) return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="text-center space-y-4 p-8">
        <p className="text-4xl">⚠️</p>
        <p className="font-mono" style={{ color: 'var(--accent-red)' }}>{error || 'Run not found'}</p>
        <a href="/planner" className="btn-secondary">← Back to Planner</a>
      </div>
    </div>
  );

  const currentStop = run.stops[currentStopIndex];
  const remainingStops = run.stops.filter((s) => s.status === 'pending' || s.status === 'arrived');
  const completedCount = run.stops.filter((s) => s.status === 'delivered').length;
  const progress = Math.round((completedCount / run.stops.length) * 100);

  const googleMapsUrl = currentStop && driverPosition
    ? buildGoogleMapsUrl(
        driverPosition,
        currentStop.position,
        remainingStops.slice(1).map((s) => s.position)
      )
    : currentStop
    ? buildGoogleMapsUrl(
        run.depot.position,
        currentStop.position,
        remainingStops.slice(1).map((s) => s.position)
      )
    : '#';

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map - full screen */}
      <div className="absolute inset-0">
        <DriverMap run={run} driverPosition={driverPosition} currentStopIndex={currentStopIndex} />
      </div>

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 flex flex-col gap-2">
        {(!isOnline || loadedFromSnapshot || pendingSync > 0) && (
          <div
            className="rounded-xl px-3 py-2 text-xs font-mono leading-snug"
            style={{
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.35)',
              color: '#fbbf24',
            }}
            role="status"
          >
            {!isOnline && (
              <span>
                Offline mode — GPS still works. Route and map tiles use data cached from your last visit.
              </span>
            )}
            {isOnline && loadedFromSnapshot && (
              <span>Showing saved copy while reconnecting — pull to refresh or wait for sync. </span>
            )}
            {pendingSync > 0 && (
              <span>
                {pendingSync} stop update{pendingSync === 1 ? '' : 's'} pending sync to server.
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 w-full">
        <div className="flex-1 rounded-xl px-4 py-2 flex items-center gap-4" style={{ background: 'rgba(10,15,13,0.92)', border: '1px solid var(--border-default)', backdropFilter: 'blur(12px)' }}>
          <div className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--accent-green)' }}>
            {run.driverName || 'Driver'}
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: 'var(--accent-green)' }} />
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {completedCount}/{run.stops.length}
          </div>
        </div>
        <button
          onClick={enableVoice}
          className={`rounded-xl p-2.5 transition-all ${voiceEnabled ? 'opacity-100' : 'opacity-60'}`}
          style={{ background: voiceEnabled ? 'rgba(74,222,128,0.2)' : 'rgba(10,15,13,0.92)', border: `1px solid ${voiceEnabled ? 'var(--accent-green)' : 'var(--border-default)'}`, backdropFilter: 'blur(12px)' }}
          aria-label={voiceEnabled ? 'Voice enabled' : 'Enable voice alerts'}
          title={voiceEnabled ? 'Voice alerts on' : 'Enable voice alerts'}
        >
          🔊
        </button>
        </div>
      </div>

      {/* Notification toast */}
      {notification && (
        <div className="absolute top-16 left-4 right-4 z-30 rounded-xl px-4 py-3 text-sm font-mono animate-slide-up"
          style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', backdropFilter: 'blur(12px)' }}>
          🔔 {notification}
        </div>
      )}

      {/* Stop list panel */}
      <div className="absolute right-3 top-20 bottom-52 z-20 w-72 overflow-y-auto rounded-xl" style={{ background: 'rgba(10,15,13,0.9)', border: '1px solid var(--border-default)', backdropFilter: 'blur(12px)' }}>
        <div className="p-3 border-b text-xs font-mono uppercase tracking-widest" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
          Route Stops
        </div>
        <div className="p-2 space-y-1">
          {run.stops.map((stop, idx) => (
            <div
              key={stop.id}
              className={`rounded-lg p-2 transition-all cursor-pointer ${idx === currentStopIndex ? 'ring-1' : ''}`}
              style={{
                background: idx === currentStopIndex ? 'rgba(74,222,128,0.1)' : 'var(--bg-card)',
                border: idx === currentStopIndex ? '1px solid var(--accent-green)' : '1px solid transparent',
              }}
              onClick={() => setCurrentStopIndex(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setCurrentStopIndex(idx)}
              aria-label={`Stop ${idx + 1}: ${stop.label}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold w-5 text-center" style={{ color: STATUS_COLORS[stop.status] }}>{idx + 1}</span>
                <span className="flex-1 text-xs font-medium truncate" style={{ color: stop.status === 'delivered' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: stop.status === 'delivered' ? 'line-through' : 'none' }}>
                  {stop.label}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: `${STATUS_COLORS[stop.status]}20`, color: STATUS_COLORS[stop.status] }}>
                  {STATUS_LABELS[stop.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom card - current stop */}
      {currentStop && run.status !== 'completed' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3">
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(10,15,13,0.95)', border: '1px solid var(--border-strong)', backdropFilter: 'blur(16px)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
                  Stop {currentStopIndex + 1} of {run.stops.length}
                  {currentStop.orderId && ` · Order ${currentStop.orderId}`}
                </div>
                <h3 className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>{currentStop.label}</h3>
                {currentStop.address && (
                  <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{currentStop.address}</p>
                )}
                {currentStop.eta && (
                  <p className="text-xs mt-1 font-mono" style={{ color: 'var(--accent-amber)' }}>
                    ETA: {new Date(currentStop.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {driverPosition && ` · ${Math.round(calculateDistance(driverPosition.lat, driverPosition.lng, currentStop.position.lat, currentStop.position.lng))}m away`}
                  </p>
                )}
                {currentStop.notes && (
                  <p className="text-xs mt-1 italic" style={{ color: 'var(--accent-amber)' }}>📝 {currentStop.notes}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1 no-underline"
                  style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid var(--border-default)', color: 'var(--accent-green)' }}
                  aria-label="Open in Google Maps to next stops"
                >
                  🗺 Next
                </a>
                {run.directionsUrl && (
                  <a
                    href={run.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider no-underline"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                    aria-label="Open full optimized route in Google Maps"
                  >
                    Full route
                  </a>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {currentStop.status === 'pending' && (
                <button
                  onClick={() => updateStop(currentStop.id, 'arrived')}
                  disabled={updatingStop === currentStop.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-mono font-bold uppercase tracking-wider transition-all"
                  style={{ background: 'rgba(163,230,53,0.15)', border: '1px solid rgba(163,230,53,0.4)', color: '#a3e635' }}
                  aria-label="Mark as arrived"
                >
                  {updatingStop === currentStop.id ? '...' : '📍 Arrived'}
                </button>
              )}
              {(currentStop.status === 'pending' || currentStop.status === 'arrived') && (
                <button
                  onClick={() => updateStop(currentStop.id, 'delivered')}
                  disabled={updatingStop === currentStop.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-mono font-bold uppercase tracking-wider transition-all"
                  style={{ background: 'rgba(74,222,128,0.2)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
                  aria-label="Mark as delivered"
                >
                  {updatingStop === currentStop.id ? '...' : '✓ Delivered'}
                </button>
              )}
              <button
                onClick={() => updateStop(currentStop.id, 'skipped')}
                disabled={updatingStop === currentStop.id}
                className="px-4 py-2.5 rounded-xl text-sm font-mono font-bold uppercase tracking-wider"
                style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--accent-red)' }}
                aria-label="Skip this stop"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed state */}
      {run.status === 'completed' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(10,15,13,0.95)', border: '1px solid var(--accent-green)', backdropFilter: 'blur(16px)' }}>
            <p className="text-3xl mb-2">🎉</p>
            <h3 className="font-mono font-bold text-lg" style={{ color: 'var(--accent-green)' }}>All Deliveries Complete!</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{run.stops.length} stops · {run.totalDistanceKm} km · {run.totalDurationMin} min</p>
            <a href="/planner" className="btn-secondary mt-4 inline-block">← New Run</a>
          </div>
        </div>
      )}
    </div>
  );
}

