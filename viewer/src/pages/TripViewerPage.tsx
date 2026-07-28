import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import MapView from '../components/MapView';
import { useTripRealtime } from '../hooks/useTripRealtime';

// Default center (Hanoi)
const DEFAULT_CENTER: [number, number] = [21.0285, 105.8542];

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatSpeed(speed: number | null): string {
  if (speed == null) return '--';
  // speed from DB is in m/s, convert to km/h
  return (speed * 3.6).toFixed(1);
}

export default function TripViewerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { locations, currentLocation, isLoading } = useTripRealtime(tripId ?? '');

  const trailPositions: [number, number][] = useMemo(
    () => locations.map((loc) => [loc.lat, loc.lng] as [number, number]),
    [locations],
  );

  const mapCenter: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : DEFAULT_CENTER;

  const currentSpeed = currentLocation ? formatSpeed(currentLocation.speed) : '--';

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#555',
      }}>
        Đang tải hành trình…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <MapView
        center={mapCenter}
        trailPositions={trailPositions}
        currentPosition={
          currentLocation
            ? [currentLocation.lat, currentLocation.lng]
            : null
        }
        currentSpeed={currentSpeed}
      />

      {/* Info overlay */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        minWidth: 180,
      }}>
        <div style={{ marginBottom: 8, fontWeight: 600, color: '#111' }}>
          📍 {locations.length} điểm
        </div>
        <div style={{ color: '#555' }}>
          🕐 Cập nhật: {currentLocation ? formatTime(currentLocation.timestamp) : '--'}
        </div>
        <div style={{ color: '#555' }}>
          🏃 Tốc độ: {currentSpeed} km/h
        </div>
      </div>
    </div>
  );
}
