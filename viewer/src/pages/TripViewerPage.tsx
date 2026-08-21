import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import MapView from '../components/MapView';
import { useTripRealtime } from '../hooks/useTripRealtime';

// Default center (Hanoi)
const DEFAULT_CENTER: [number, number] = [21.0285, 105.8542];

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  const { locations, currentLocation, isLoading, isActive, tripSummary } =
    useTripRealtime(tripId ?? '');

  const [isExpanded, setIsExpanded] = useState(false);

  const trailPositions: [number, number][] = useMemo(
    () => locations.map((loc) => [loc.lat, loc.lng] as [number, number]),
    [locations],
  );

  const mapCenter: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : DEFAULT_CENTER;

  const currentSpeed = currentLocation
    ? formatSpeed(currentLocation.speed)
    : '--';

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-lg text-neutral-500">
        Đang tải hành trình…
      </div>
    );
  }

  const summaryRow = (label: string, value: string) => (
    <div className="flex sm:flex-row flex-col gap-2">
      <span className="text-neutral-500">{label}:</span>
      <span className="font-semibold text-neutral-900">{value}</span>
    </div>
  );

  // Collapsed → shrink-wrap content; expanded → stretch to the configured max width
  const panelSizing =
    isActive && isExpanded ? 'sm:w-full sm:max-w-1/3' : 'w-fit';

  return (
    <div className="relative h-screen w-screen">
      <MapView
        center={mapCenter}
        trailPositions={trailPositions}
        currentPosition={
          currentLocation ? [currentLocation.lat, currentLocation.lng] : null
        }
        currentSpeed={currentSpeed}
      />

      <div
        className={`absolute sm:top-4 top-2 left-0 right-0 z-[1000] border-[1.8px] border-white overflow-hidden mx-auto max-w-[95%] ${panelSizing} ${isActive ? 'rounded-full' : 'rounded-xl'}`}
      >
        <div className="absolute inset-0 size-full bg-gray-400/10 bg-clip-padding backdrop-filter backdrop-blur-sm"></div>
        <div className="relative px-3 pt-3.5 pb-3">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-controls="trip-info-body"
            className="mx-auto flex cursor-pointer select-none items-center justify-center gap-2 rounded-lg font-semibold text-neutral-900 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <span
              className={`inline-block size-2.5 rounded-full ${
                isActive ? 'animate-pulse bg-green-600' : 'bg-red-600'
              }`}
            />
            {isActive ? 'Đang hoạt động' : 'Hành trình đã kết thúc'}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={`size-4 shrink-0 text-neutral-700 transition-transform duration-300 ${
                isExpanded ? '' : 'rotate-180'
              }`}
            >
              <path
                d="M5 12.5 L10 7.5 L15 12.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div
            id="trip-info-body"
            aria-hidden={!isExpanded}
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="overflow-hidden">
              {isActive ? (
                /* Active trip — compact info panel */
                <div className="flex justify-center gap-6 mt-3.5">
                  <div className="text-neutral-700/80">
                    📍 {locations.length} điểm
                  </div>
                  <div className="text-neutral-700/80">
                    🕐{' '}
                    {currentLocation
                      ? formatTime(currentLocation.timestamp)
                      : '--'}
                  </div>
                  <div className="text-neutral-700/80">
                    🏃 {currentSpeed} km/h
                  </div>
                </div>
              ) : (
                /* Ended trip — summary panel */
                <>
                  {tripSummary ? (
                    <div className="grid grid-cols-2 gap-y-3 gap-x-6 mt-3.5">
                      {summaryRow(
                        '📅 Bắt đầu',
                        formatDateTime(tripSummary.startTime),
                      )}
                      {summaryRow(
                        '🏁 Kết thúc',
                        formatDateTime(tripSummary.endTime),
                      )}
                      {summaryRow(
                        '⏱ Thời gian',
                        formatDuration(tripSummary.durationSeconds),
                      )}
                      {summaryRow(
                        '📏 Quãng đường',
                        formatDistance(tripSummary.totalDistanceKm),
                      )}
                      {summaryRow(
                        '⚡ Tốc độ tối đa',
                        tripSummary.maxSpeedKmh != null
                          ? `${tripSummary.maxSpeedKmh.toFixed(1)} km/h`
                          : '--',
                      )}
                      {summaryRow('📍 Tổng điểm', `${tripSummary.totalPoints}`)}
                    </div>
                  ) : locations.length > 0 ? (
                    <div className="mt-3.5 text-center text-sm text-neutral-600/80">
                      Không phát sinh dữ liệu di chuyển <br /> (Chỉ có một điểm
                      vị trí duy trí duy nhất)
                    </div>
                  ) : (
                    <div className="mt-3.5 text-center text-sm text-neutral-600/80">
                      Không có dữ liệu vị trí
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
