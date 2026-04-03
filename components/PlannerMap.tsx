'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import type { RunRecord, LatLng } from '@/types';
import { decodePolyline } from '@/lib/polyline';
import L from 'leaflet';

// Fix Leaflet default icon in Next.js
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

function createNumberedIcon(num: number, status = 'pending') {
  const colorMap: Record<string, string> = {
    pending: '#4ade80',
    arrived: '#fbbf24',
    delivered: '#22c55e',
    skipped: '#4d6b42',
  };
  const color = colorMap[status] ?? '#4ade80';
  const html = `<div style="width:30px;height:30px;border-radius:50%;border:2px solid ${color};background:#182210;color:${color};display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:11px;font-weight:700;">${num}</div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
}

function createDepotIcon() {
  const html = `<div style="width:36px;height:36px;border-radius:8px;background:#4ade80;border:2px solid #a3e635;display:flex;align-items:center;justify-content:center;font-size:16px;">🏠</div>`;
  return L.divIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });
}

function FitBounds({ positions }: { positions: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [positions, map]);
  return null;
}

interface Props {
  run: RunRecord | null;
  depotPosition: LatLng | null;
  stopPositions: Array<{ id: string; position: LatLng | null; label: string }>;
}

export default function PlannerMap({ run, depotPosition, stopPositions }: Props) {
  const defaultCenter: [number, number] = [27.7172, 85.324]; // Kathmandu

  const routeCoords = run ? decodePolyline(run.polyline) : [];
  const polylinePositions = routeCoords.map((c): [number, number] => [c.lat, c.lng]);

  const allPositions: LatLng[] = [
    ...(depotPosition ? [depotPosition] : []),
    ...stopPositions.filter((s) => s.position !== null).map((s) => s.position as LatLng),
  ];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={12}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {allPositions.length > 0 && <FitBounds positions={allPositions} />}

      {/* Depot marker */}
      {depotPosition && !run && (
        <Marker position={[depotPosition.lat, depotPosition.lng]} icon={createDepotIcon()}>
          <Popup>
            <div style={{ fontFamily: 'monospace', color: '#e8f5e0', background: '#182210', padding: '4px' }}>
              <strong style={{ color: '#4ade80' }}>Depot</strong>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Preview stop markers */}
      {!run && stopPositions.filter((s) => s.position).map((s, idx) => (
        <Marker
          key={s.id}
          position={[s.position!.lat, s.position!.lng]}
          icon={createNumberedIcon(idx + 1)}
        >
          <Popup>
            <div style={{ fontFamily: 'monospace', color: '#e8f5e0', background: '#182210', padding: '4px' }}>
              <strong style={{ color: '#4ade80' }}>Stop {idx + 1}</strong><br />
              {s.label}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Optimized route */}
      {run && (
        <>
          <Marker position={[run.depot.position.lat, run.depot.position.lng]} icon={createDepotIcon()}>
            <Popup><div style={{ fontFamily: 'monospace', color: '#e8f5e0' }}><strong style={{ color: '#4ade80' }}>Depot</strong></div></Popup>
          </Marker>

          {run.stops.map((stop, idx) => (
            <Marker
              key={stop.id}
              position={[stop.position.lat, stop.position.lng]}
              icon={createNumberedIcon(idx + 1, stop.status)}
            >
              <Popup>
                <div style={{ fontFamily: 'monospace', color: '#e8f5e0', background: '#182210', padding: '4px', minWidth: '160px' }}>
                  <strong style={{ color: '#4ade80' }}>Stop {idx + 1}: {stop.label}</strong>
                  {stop.address && <div style={{ fontSize: '11px', color: '#8aad7a', marginTop: '4px' }}>{stop.address}</div>}
                  {stop.eta && <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '4px' }}>ETA: {new Date(stop.eta).toLocaleTimeString()}</div>}
                </div>
              </Popup>
            </Marker>
          ))}

          {polylinePositions.length > 1 && (
            <Polyline positions={polylinePositions} pathOptions={{ color: '#4ade80', weight: 4, opacity: 0.85, dashArray: undefined }} />
          )}
        </>
      )}
    </MapContainer>
  );
}
