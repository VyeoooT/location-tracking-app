import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

// ─── Custom cute marker icon (SVG duck) ───────────────────────

const currentLocationIcon = L.divIcon({
  className: '',
  iconSize: [40, 48],
  iconAnchor: [20, 46],
  popupAnchor: [0, -42],
  html: `
    <svg width="40" height="48" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="drop" x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.25"/>
        </filter>
      </defs>
      <!-- Body -->
      <ellipse cx="20" cy="30" rx="14" ry="11" fill="#FFD700" filter="url(#drop)" stroke="#E6BE00" stroke-width="1.5"/>
      <!-- Tail -->
      <path d="M6 30 Q-2 34 4 38 Q8 33 6 30Z" fill="#FFD700" stroke="#E6BE00" stroke-width="1.5"/>
      <!-- Wing -->
      <ellipse cx="18" cy="31" rx="8" ry="5" fill="#FFC107" stroke="#E6BE00" stroke-width="0.8"/>
      <!-- Head -->
      <circle cx="27" cy="18" r="10" fill="#FFD700" stroke="#E6BE00" stroke-width="1.5"/>
      <!-- Eye -->
      <circle cx="30" cy="16" r="3" fill="white"/>
      <circle cx="31" cy="16" r="1.8" fill="#333"/>
      <circle cx="31.5" cy="14.5" r="0.5" fill="white"/>
      <!-- Beak -->
      <path d="M36 18 L43 19 L36 21 Z" fill="#FF8C00" stroke="#E07B00" stroke-width="0.8" stroke-linejoin="round"/>
      <!-- Cheek blush -->
      <circle cx="24" cy="21" r="2.5" fill="#FFB6C1" opacity="0.6"/>
      <!-- Feet -->
      <path d="M14 40 L10 46 M14 40 L14 46 M14 40 L18 46" stroke="#FF8C00" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M24 40 L20 46 M24 40 L24 46 M24 40 L28 46" stroke="#FF8C00" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>
  `,
});

// ─── Helpers ──────────────────────────────────────────────────

/** Haversine distance in meters between two lat/lng points */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Downsample trail to at most `maxPoints` for smooth Leaflet rendering */
function downsampleTrail(
  trail: [number, number][],
  maxPoints: number,
): [number, number][] {
  if (trail.length <= maxPoints) return trail;
  const step = trail.length / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(trail[Math.round(i * step)]);
  }
  // Always include the last point
  result.push(trail[trail.length - 1]);
  return result;
}

interface MapViewProps {
  center: [number, number];
  zoom?: number;
  trailPositions?: [number, number][];
  currentPosition?: [number, number] | null;
  currentSpeed?: string;
}

function MapCenterUpdater({ position }: { position: [number, number] | null }) {
  const map = useMap();
  const prevRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (position) {
      // Chỉ panTo khi điểm mới đủ khác biệt (tránh rung liên tục)
      const prev = prevRef.current;
      if (
        !prev ||
        haversineMeters(prev[0], prev[1], position[0], position[1]) > 10
      ) {
        map.panTo(position, { animate: false });
        prevRef.current = position;
      }
    }
  }, [position, map]);

  return null;
}

export default function MapView({
  center,
  zoom = 15,
  trailPositions = [],
  currentPosition = null,
  currentSpeed = '--',
}: MapViewProps) {
  // Downsample trail for smooth rendering when > 2000 points
  const displayTrail = useMemo(
    () =>
      trailPositions.length > 2000
        ? downsampleTrail(trailPositions, 2000)
        : trailPositions,
    [trailPositions],
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapCenterUpdater position={currentPosition} />

      {displayTrail.length > 1 && (
        <Polyline positions={displayTrail} color="#208AEF" weight={4} />
      )}

      {currentPosition && (
        <Marker position={currentPosition} icon={currentLocationIcon}>
          <Popup>
            📍 {currentPosition[0].toFixed(5)}, {currentPosition[1].toFixed(5)}
            <br />
            🏃 {currentSpeed} km/h
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
