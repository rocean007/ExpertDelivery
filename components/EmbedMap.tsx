'use client';

import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import type { RunRecord } from '@/types';
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

function createSmallIcon(num: number, delivered: boolean) {
  const color = delivered ? '#4d6b42' : '#4ade80';
  const html = `<div style="width:22px;height:22px;border-radius:50%;border:1.5px solid ${color};background:#182210;color:${color};display:flex;align-items:center;justify-content:center;font-size:9px;font-family:monospace;font-weight:700;opacity:${delivered ? 0.5 : 1}">${delivered ? '✓' : num}</div>`;
  return L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
}

function createDepotSmallIcon() {
  const html = `<div style="width:24px;height:24px;border-radius:6px;background:#4ade80;border:1.5px solid #a3e635;display:flex;align-items:center;justify-content:center;font-size:12px;">🏠</div>`;
  return L.divIcon({ html, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
}

interface Props {
  run: RunRecord;
}

export default function EmbedMap({ run }: Props) {
  const routeCoords = decodePolyline(run.polyline);
  const polylinePositions = routeCoords.map((c): [number, number] => [c.lat, c.lng]);
  const center: [number, number] = [run.depot.position.lat, run.depot.position.lng];

  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ width: '100%', height: '250px' }}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {polylinePositions.length > 1 && (
        <Polyline positions={polylinePositions} pathOptions={{ color: '#4ade80', weight: 2, opacity: 0.7 }} />
      )}

      <Marker position={[run.depot.position.lat, run.depot.position.lng]} icon={createDepotSmallIcon()}>
        <Popup><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Depot</span></Popup>
      </Marker>

      {run.stops.map((stop, idx) => (
        <Marker
          key={stop.id}
          position={[stop.position.lat, stop.position.lng]}
          icon={createSmallIcon(idx + 1, stop.status === 'delivered')}
        >
          <Popup><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{stop.label}</span></Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
