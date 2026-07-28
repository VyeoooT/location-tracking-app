import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issue with bundlers
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface MapViewProps {
  center: [number, number];
  zoom?: number;
  trailPositions?: [number, number][];
  currentPosition?: [number, number] | null;
  currentSpeed?: string;
}

function MapCenterUpdater({ position }: { position: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, map.getZoom(), { duration: 1 });
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

      {trailPositions.length > 1 && (
        <Polyline positions={trailPositions} color="#208AEF" weight={4} />
      )}

      {currentPosition && (
        <Marker position={currentPosition}>
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
