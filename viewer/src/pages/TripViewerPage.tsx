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

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatSpeed(speed: number | null): string {
  if (speed == null) return '--';
  return (speed * 3.6).toFixed(1);
}

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(2)} km`;
}

export default function TripViewerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { locations, currentLocation, isLoading, isActive, tripName, tripSummary } =
    useTripRealtime(tripId ?? '');

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

  const summaryRow = (label: string, value: string) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderBottom: '1px solid #eee',
    }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#111' }}>{value}</span>
    </div>
  );

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

      {isActive ? (
        /* Active trip — compact info panel */
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12, padding: '12px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          fontFamily: 'system-ui, sans-serif', fontSize: 14, minWidth: 180,
        }}>
          <div style={{ marginBottom: 8, fontWeight: 600, color: '#111', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: '#22c55e', animation: 'pulse 1.5s infinite',
            }} />
            Đang theo dõi
          </div>
          <div style={{ color: '#555' }}>
            📍 {locations.length} điểm
          </div>
          <div style={{ color: '#555' }}>
            🕐 {currentLocation ? formatTime(currentLocation.timestamp) : '--'}
          </div>
          <div style={{ color: '#555' }}>
            🏃 {currentSpeed} km/h
          </div>
        </div>
      ) : (
        /* Ended trip — summary panel */
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(12px)',
          borderRadius: 14, padding: '16px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          fontFamily: 'system-ui, sans-serif', fontSize: 14, minWidth: 240, maxWidth: 300,
        }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 12,
          }}>
            🛑 Hành trình đã kết thúc
          </div>
          {tripName && (
            <div style={{
              marginBottom: 8, color: '#444', fontWeight: 500,
            }}>
              {tripName}
            </div>
          )}
          {tripSummary ? (
            <>
              {summaryRow('📅 Bắt đầu', formatDateTime(tripSummary.startTime))}
              {summaryRow('🏁 Kết thúc', formatDateTime(tripSummary.endTime))}
              {summaryRow('⏱ Thời lượng', formatDuration(tripSummary.durationSeconds))}
              {summaryRow('📏 Quãng đường', formatDistance(tripSummary.totalDistanceKm))}
              {summaryRow('⚡ Tốc độ tối đa', tripSummary.maxSpeedKmh != null ? `${tripSummary.maxSpeedKmh.toFixed(1)} km/h` : '--')}
              {summaryRow('📍 Tổng điểm', `${tripSummary.totalPoints}`)}
            </>
          ) : locations.length > 0 ? (
            <div style={{ color: '#999', marginTop: 8 }}>
              Chỉ có 1 điểm — không đủ dữ liệu tổng hợp
            </div>
          ) : (
            <div style={{ color: '#999', marginTop: 8 }}>
              Không có dữ liệu vị trí
            </div>
          )}
        </div>
      )}
    </div>
  );
}
