'use client';

import React, { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { RunRecord, LatLng } from '@/types';

const PlannerMap = dynamic(() => import('@/components/PlannerMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-surface-1">
      <div className="text-center">
        <div className="flex gap-2 justify-center mb-3">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
        <p className="text-sm font-mono text-green-400 uppercase tracking-widest">Loading map</p>
      </div>
    </div>
  ),
});

interface StopInput {
  id: string;
  label: string;
  address: string;
  geocoding: boolean;
  position: LatLng | null;
  error: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export default function PlannerPage() {
  const [depotAddress, setDepotAddress] = useState('');
  const [depotPosition, setDepotPosition] = useState<LatLng | null>(null);
  const [depotGeocoding, setDepotGeocoding] = useState(false);
  const [stops, setStops] = useState<StopInput[]>([
    { id: generateId(), label: '', address: '', geocoding: false, position: null, error: '' },
  ]);
  const [driverName, setDriverName] = useState('');
  const [vehicleType, setVehicleType] = useState<'bike' | 'car' | 'van'>('bike');
  const [optimizing, setOptimizing] = useState(false);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const geocodeDebounced = useRef(
    debounce(async (query: string, onResult: (pos: LatLng | null) => void, onLoading: (v: boolean) => void) => {
      if (query.trim().length < 4) { onResult(null); return; }
      onLoading(true);
      try {
        const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(query)}`);
        const json = await res.json() as { success: boolean; data: LatLng | null };
        onResult(json.success ? json.data : null);
      } catch {
        onResult(null);
      } finally {
        onLoading(false);
      }
    }, 500)
  );

  const handleDepotChange = useCallback((val: string) => {
    setDepotAddress(val);
    geocodeDebounced.current(
      val,
      (pos) => setDepotPosition(pos),
      (v) => setDepotGeocoding(v)
    );
  }, []);

  const handleStopChange = useCallback((id: string, field: 'label' | 'address', val: string) => {
    setStops((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, [field]: val };
        if (field === 'address') {
          geocodeDebounced.current(
            val,
            (pos) => setStops((p) => p.map((x) => x.id === id ? { ...x, position: pos, error: pos ? '' : 'Address not found' } : x)),
            (v) => setStops((p) => p.map((x) => x.id === id ? { ...x, geocoding: v } : x))
          );
        }
        return updated;
      })
    );
  }, []);

  const addStop = useCallback(() => {
    if (stops.length >= 20) return;
    setStops((prev) => [...prev, { id: generateId(), label: '', address: '', geocoding: false, position: null, error: '' }]);
  }, [stops.length]);

  const removeStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleOptimize = useCallback(async () => {
    setError('');
    if (!depotAddress.trim()) { setError('Please enter a depot address'); return; }
    const validStops = stops.filter((s) => s.address.trim() || s.label.trim());
    if (validStops.length === 0) { setError('Please add at least one stop'); return; }

    setOptimizing(true);
    try {
      const payload = {
        depot: depotPosition
          ? { label: 'Depot', lat: depotPosition.lat, lng: depotPosition.lng, address: depotAddress }
          : { label: 'Depot', address: depotAddress },
        stops: validStops.map((s) => ({
          id: s.id,
          label: s.label || s.address,
          ...(s.position ? { lat: s.position.lat, lng: s.position.lng } : { address: s.address }),
        })),
        driverName: driverName || undefined,
        vehicleType,
      };

      const body = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));

      // For demo/planner, we skip HMAC and use direct call
      const res = await fetch('/api/v1/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-timestamp': timestamp,
          'x-signature': await computeHmac(body),
        },
        body,
      });

      const json = await res.json() as { success: boolean; data?: RunRecord; error?: string };
      if (!json.success || !json.data) {
        setError(json.error || 'Optimization failed');
        return;
      }
      setRun(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setOptimizing(false);
    }
  }, [depotAddress, depotPosition, stops, driverName, vehicleType]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'w-96' : 'w-0 overflow-hidden'}`}
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-secondary)', minWidth: sidebarOpen ? '384px' : '0' }}
        aria-label="Route planner"
      >
        <div className="p-5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl">🗺</span>
            <h1 className="font-mono font-bold text-base uppercase tracking-widest" style={{ color: 'var(--accent-green)' }}>
              OT Delivery Router
            </h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plan & optimize delivery routes</p>
        </div>

        <div className="flex-1 p-5 space-y-5 overflow-y-auto">
          {/* Depot */}
          <section>
            <label className="block text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              🏠 Depot / Warehouse
            </label>
            <div className="relative">
              <input
                className="input-field"
                placeholder="Main Warehouse, Kathmandu..."
                value={depotAddress}
                onChange={(e) => handleDepotChange(e.target.value)}
                aria-label="Depot address"
              />
              {depotGeocoding && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  <span className="loading-dot w-1.5 h-1.5" />
                  <span className="loading-dot w-1.5 h-1.5" />
                  <span className="loading-dot w-1.5 h-1.5" />
                </div>
              )}
              {depotPosition && !depotGeocoding && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--accent-green)' }}>✓</span>
              )}
            </div>
          </section>

          {/* Stops */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                📦 Stops ({stops.length}/20)
              </label>
              <button onClick={addStop} disabled={stops.length >= 20} className="btn-secondary text-xs px-3 py-1.5" aria-label="Add stop">
                + Add
              </button>
            </div>
            <div className="space-y-3">
              {stops.map((stop, idx) => (
                <div key={stop.id} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold w-5 text-center rounded" style={{ color: 'var(--accent-green)', background: 'rgba(74,222,128,0.1)', padding: '1px 4px' }}>{idx + 1}</span>
                    <input
                      className="input-field flex-1 text-sm py-1.5"
                      placeholder="Customer name"
                      value={stop.label}
                      onChange={(e) => handleStopChange(stop.id, 'label', e.target.value)}
                      aria-label={`Stop ${idx + 1} name`}
                    />
                    <button
                      onClick={() => removeStop(stop.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--text-muted)', background: 'transparent' }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--accent-red)'; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
                      aria-label={`Remove stop ${idx + 1}`}
                    >✕</button>
                  </div>
                  <div className="relative">
                    <input
                      className="input-field text-sm py-1.5"
                      placeholder="Delivery address..."
                      value={stop.address}
                      onChange={(e) => handleStopChange(stop.id, 'address', e.target.value)}
                      aria-label={`Stop ${idx + 1} address`}
                    />
                    {stop.geocoding && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                        <span className="loading-dot w-1 h-1" />
                        <span className="loading-dot w-1 h-1" />
                        <span className="loading-dot w-1 h-1" />
                      </div>
                    )}
                    {stop.position && !stop.geocoding && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--accent-green)' }}>✓</span>
                    )}
                  </div>
                  {stop.error && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{stop.error}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* Driver info */}
          <section className="space-y-2">
            <label className="block text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              🚗 Driver Info (optional)
            </label>
            <input
              className="input-field"
              placeholder="Driver name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              aria-label="Driver name"
            />
            <select
              className="input-field"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as 'bike' | 'car' | 'van')}
              aria-label="Vehicle type"
            >
              <option value="bike">🏍 Motorbike</option>
              <option value="car">🚗 Car</option>
              <option value="van">🚐 Van</option>
            </select>
          </section>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--accent-red)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleOptimize}
            disabled={optimizing}
            className="btn-primary w-full py-3 text-sm"
            aria-label="Optimize route"
          >
            {optimizing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
                Optimizing...
              </span>
            ) : '⚡ Optimize Route'}
          </button>
        </div>

        {/* Results sidebar */}
        {run && (
          <div className="border-t p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--accent-green)' }}>
                Optimized Route
              </h2>
              <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                {run.totalDistanceKm} km · {run.totalDurationMin} min
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {run.stops.map((stop, idx) => (
                <div key={stop.id} className="flex items-start gap-3 p-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold" style={{ background: 'rgba(74,222,128,0.2)', color: 'var(--accent-green)' }}>{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{stop.label}</p>
                    {stop.distanceFromPrevKm !== undefined && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        +{stop.distanceFromPrevKm}km · {stop.durationFromPrevMin}min
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <a
              href={`/run/${run.runId}`}
              className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 no-underline"
            >
              🚀 Start Run
            </a>
          </div>
        )}
      </aside>

      {/* Toggle sidebar button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-12 flex items-center justify-center rounded-r-lg transition-all"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderLeft: 'none',
          color: 'var(--accent-green)',
          left: sidebarOpen ? '384px' : '0',
        }}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>

      {/* Map */}
      <main className="flex-1 relative">
        <PlannerMap
          run={run}
          depotPosition={depotPosition}
          stopPositions={stops.map((s) => ({ id: s.id, position: s.position, label: s.label || s.address }))}
        />
      </main>
    </div>
  );
}

async function computeHmac(body: string): Promise<string> {
  const secret = process.env.NEXT_PUBLIC_HMAC_SECRET || 'dev-secret';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
