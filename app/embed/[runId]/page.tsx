'use client';

import React, { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import type { RunRecord, Stop } from '@/types';

const EmbedMap = dynamic(() => import('@/components/EmbedMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center" style={{ height: '250px', background: 'var(--bg-secondary)' }}>
      <div className="flex gap-1"><span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" /></div>
    </div>
  ),
});

const STATUS_COLORS: Record<Stop['status'], string> = {
  pending: '#fbbf24',
  arrived: '#a3e635',
  delivered: '#4ade80',
  skipped: '#4d6b42',
};

const STATUS_LABELS: Record<Stop['status'], string> = {
  pending: 'Pending',
  arrived: 'En route',
  delivered: 'Delivered',
  skipped: 'Skipped',
};

export default function EmbedPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchRun = async () => {
    try {
      const res = await fetch(`/api/v1/runs/${runId}`);
      const json = await res.json() as { success: boolean; data?: RunRecord; error?: string };
      if (json.success && json.data) {
        setRun(json.data);
        setLastUpdated(new Date());
      } else {
        setError(json.error || 'Run not found');
      }
    } catch {
      setError('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRun();
    const interval = setInterval(fetchRun, 15000);
    return () => clearInterval(interval);
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-primary)' }}>
      <div className="flex gap-1"><span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" /></div>
    </div>
  );

  if (error || !run) return (
    <div className="flex items-center justify-center p-6" style={{ height: '100vh', background: 'var(--bg-primary)' }}>
      <div className="text-center space-y-2">
        <p style={{ color: 'var(--accent-red)', fontFamily: 'monospace', fontSize: '13px' }}>{error || 'Run not found'}</p>
      </div>
    </div>
  );

  const nextUndelivered = run.stops.find((s) => s.status === 'pending' || s.status === 'arrived');
  const deliveredCount = run.stops.filter((s) => s.status === 'delivered').length;
  const progress = Math.round((deliveredCount / run.stops.length) * 100);

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', fontFamily: 'var(--font-body)', background: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-default)' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🚚</span>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-green)' }}>
              Live Tracking
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {run.driverName || 'Delivery Driver'}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: run.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-amber)', textTransform: 'uppercase' }}>
            {run.status}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Mini map */}
      <div style={{ height: '250px', overflow: 'hidden' }}>
        <EmbedMap run={run} />
      </div>

      {/* Progress bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{deliveredCount} of {run.stops.length} delivered</span>
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent-green)' }}>{progress}%</span>
        </div>
        <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-green)', borderRadius: '2px', transition: 'width 0.5s ease' }} />
        </div>

        {nextUndelivered?.eta && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent-amber)', fontFamily: 'monospace' }}>
            Next ETA: {new Date(nextUndelivered.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Stop list */}
      <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px' }}>
        {run.stops.map((stop, idx) => (
          <div key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', marginBottom: '4px', background: 'var(--bg-card)' }}>
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', border: `1.5px solid ${STATUS_COLORS[stop.status]}`,
              background: '#182210', color: STATUS_COLORS[stop.status], display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontFamily: 'monospace', fontWeight: '700', flexShrink: 0,
            }}>
              {stop.status === 'delivered' ? '✓' : idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: '500', color: stop.status === 'delivered' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: stop.status === 'delivered' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stop.label}
              </div>
              {stop.deliveredAt && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Delivered {new Date(stop.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: `${STATUS_COLORS[stop.status]}18`, color: STATUS_COLORS[stop.status], fontFamily: 'monospace', flexShrink: 0 }}>
              {STATUS_LABELS[stop.status]}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {run.totalDistanceKm} km · {run.totalDurationMin} min total
        </div>
        <a
          href={`/run/${run.runId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '11px', color: 'var(--accent-green)', fontFamily: 'monospace', textDecoration: 'none', padding: '4px 10px', border: '1px solid var(--border-default)', borderRadius: '6px' }}
        >
          Full map →
        </a>
      </div>
    </div>
  );
}
