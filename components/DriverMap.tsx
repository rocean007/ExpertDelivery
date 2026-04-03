'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, Circle } from 'react-leaflet';
import type { RunRecord, LatLng } from '@/types';
import { decodePolyline } from '@/lib/polyline';
import L from 'leaflet';

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

function createStopIcon(num: number, isCurrent: boolean, status: string) {
  const colorMap: Record<string, string> = {
    pending: isCurrent ? '#fbbf24' : '#4ade80',
    arrived: '#a3e635',
    delivered: '#22c55e',
    skipped: '#4d6b42',
  };
  const color = colorMap[status] ?? '#4ade80';
  const size = isCurrent ? 36 : 28;
  const opacity = status === 'delivered' || status === 'skipped' ? '0.5' : '1';
  const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${color};background:#182210;color:${color};display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:${isCurrent ? 13 : 11}px;font-weight:700;opacity:${opacity};${isCurrent ? 'box-shadow:0 0 0 4px rgba(251,191,36,0.2);' : ''}">${num}</div>`;
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function createDriverIcon() {
  const html = `<div style="width:20px;height:20px;border-radius:50%;background:#4ade80;border:3px solid white;box-shadow:0 0 0 3px rgba(74,222,128,0.4);"></div>`;
  return L.divIcon({ html, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });
}

function createDepotIcon() {
  const html = `<div style="width:32px;height:32px;border-radius:8px;background:#4ade80;border:2px solid #a3e635;display:flex;align-items:center;justify-content:center;font-size:14px;">🏠</div>`;
  return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
}

function PanToDriver({ position }: { position: LatLng | null }) {
  const map = useMap();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!position || hasInitialized.current) return;
    map.setView([position.lat, position.lng], 15);
    hasInitialized.current = true;
  }, [position, map]);

  return null;
}

interface Props {
  run: RunRecord;
  driverPosition: LatLng | null;
  currentStopIndex: number;
}

export default function DriverMap({ run, driverPosition, currentStopIndex }: Props) {
  const routeCoords = decodePolyline(run.polyline);
  const polylinePositions = routeCoords.map((c): [number, number] => [c.lat, c.lng]);

  const defaultCenter: [number, number] = driverPosition
    ? [driverPosition.lat, driverPosition.lng]
    : [run.depot.position.lat, run.depot.position.lng];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={14}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      <PanToDriver position={driverPosition} />

      {/* Driver position */}
      {driverPosition && (
        <>
          <Marker position={[driverPosition.lat, driverPosition.lng]} icon={createDriverIcon()}>
            <Popup><div style={{ fontFamily: 'monospace', fontSize: '12px' }}>📍 Your location</div></Popup>
          </Marker>
          <Circle
            center={[driverPosition.lat, driverPosition.lng]}
            radius={100}
            pathOptions={{ color: '#4ade80', fillColor: '#4ade80', fillOpacity: 0.05, weight: 1, dashArray: '4,4' }}
          />
        </>
      )}

      {/* Route polyline */}
      {polylinePositions.length > 1 && (
        <>
          {/* Shadow */}
          <Polyline positions={polylinePositions} pathOptions={{ color: '#000000', weight: 6, opacity: 0.3 }} />
          {/* Route */}
          <Polyline positions={polylinePositions} pathOptions={{ color: '#4ade80', weight: 3, opacity: 0.75, dashArray: '8,4' }} />
        </>
      )}

      {/* Depot */}
      <Marker position={[run.depot.position.lat, run.depot.position.lng]} icon={createDepotIcon()}>
        <Popup><div style={{ fontFamily: 'monospace', color: '#e8f5e0', background: '#182210', padding: '4px' }}><strong style={{ color: '#4ade80' }}>Depot</strong></div></Popup>
      </Marker>

      {/* Stop markers */}
      {run.stops.map((stop, idx) => (
        <Marker
          key={stop.id}
          position={[stop.position.lat, stop.position.lng]}
          icon={createStopIcon(idx + 1, idx === currentStopIndex, stop.status)}
          zIndexOffset={idx === currentStopIndex ? 1000 : 0}
        >
          <Popup>
            <div style={{ fontFamily: 'monospace', color: '#e8f5e0', background: '#182210', padding: '6px', minWidth: '150px' }}>
              <strong style={{ color: '#4ade80' }}>Stop {idx + 1}: {stop.label}</strong>
              {stop.address && <div style={{ fontSize: '11px', color: '#8aad7a', marginTop: '4px' }}>{stop.address}</div>}
              <div style={{ fontSize: '11px', marginTop: '4px', textTransform: 'capitalize', color: '#fbbf24' }}>{stop.status}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
