import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  getLastPushedLocation,
  getStoredTripId,
  setLastPushedLocation,
} from '@/lib/async-storage';
import { shouldPush } from '@/lib/gps-filter';
import {
  flushQueueQuick,
  insertWithRetry,
  saveToQueue,
} from '@/lib/location-queue';
import { startQueueAutoFlush } from '@/lib/queue-auto-flush';

export const LOCATION_TRACKING_TASK_NAME = 'LOCATION_TRACKING';

type LocationTaskData = { locations: Location.LocationObject[] };

async function handleBackgroundLocation({
  data,
  error,
}: TaskManager.TaskManagerTaskBody): Promise<void> {
  // Trong chế độ headless (app bị kill nhưng service vẫn chạy) React không
  // render nên _layout không chạy effect. Bật listener ở đây để vẫn flush
  // ngay khi có mạng trở lại, kể cả khi người dùng đứng yên.
  startQueueAutoFlush();

  if (error) {
    console.error('[BackgroundTask] Error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as LocationTaskData;
  if (!locations?.length) return;

  const tripId = await getStoredTripId();
  if (!tripId) {
    console.warn('[BackgroundTask] No tripId in storage — skipping push');
    return;
  }

  const lastPushed = await getLastPushedLocation();
  let candidate = lastPushed;

  const rows: {
    trip_id: string;
    lat: number;
    lng: number;
    speed: number | null;
    timestamp: string;
  }[] = [];

  for (const loc of locations) {
    const { latitude, longitude, speed } = loc.coords;

    if (shouldPush(latitude, longitude, candidate)) {
      rows.push({
        trip_id: tripId,
        lat: latitude,
        lng: longitude,
        speed: speed ?? null,
        timestamp: new Date(loc.timestamp).toISOString(),
      });
      candidate = { lat: latitude, lng: longitude };
    }
  }

  const filtered = locations.length - rows.length;
  if (filtered > 0) {
    console.log(`[BackgroundTask] Filtered ${filtered} GPS drift point(s)`);
  }

  if (rows.length === 0) return;

  // Quick flush any previously queued locations (best-effort, single attempt)
  await flushQueueQuick();

  const insertOk = await insertWithRetry(rows);
  if (insertOk) {
    // Chỉ update filter state SAU khi insert thành công.
    // candidate luôn non-null ở đây (rows.length > 0 → đã gán ít nhất 1 lần).
    await setLastPushedLocation(candidate!);
    console.log(`[BackgroundTask] Pushed ${rows.length} location(s)`);
  } else {
    await saveToQueue(rows);
    console.warn(
      `[BackgroundTask] Insert failed after retries, queued ${rows.length} location(s)`,
    );
  }
}

// ─── Background task (global scope) ────────────────────────────
// Phải được define ở module scope và module này phải được import từ app root
// (xem src/app/_layout.tsx) để task vẫn tồn tại khi JS context khởi động lại
// ở chế độ headless (app bị kill nhưng service vẫn chạy).
TaskManager.defineTask(LOCATION_TRACKING_TASK_NAME, (body) =>
  handleBackgroundLocation(body).catch((err) => {
    // Không để rejection từ task thành lỗi "Uncaught (in promise)".
    console.error('[BackgroundTask] Unexpected error:', err);
  }),
);
