import { useState, useCallback, useRef, useEffect } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '@/lib/supabase';
import {
  getStoredTripId,
  setStoredTripId,
  removeStoredTripId,
  setTripStartTime,
  removeTripStartTime,
  getQueuedLocationCountForTrip,
  getLastPushedLocation,
  setLastPushedLocation,
} from '@/lib/async-storage';
import {
  insertWithRetry,
  saveToQueue,
  flushQueueQuick,
  flushQueue,
} from '@/lib/location-queue';
import { shouldPush } from '@/lib/gps-filter';

export const LOCATION_TRACKING_TASK_NAME = 'LOCATION_TRACKING';

// Lưu điểm cuối cùng đã push để tính khoảng cách — persist trong AsyncStorage
// để foreground hook và background task (có thể khác JS context) dùng chung.

// ─── Background task (global scope) ────────────────────────────
// Chạy ngay cả khi app ở background. Tự push location lên Supabase (có filter).
TaskManager.defineTask(LOCATION_TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundTask] Error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
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
});

// ─── Hook ──────────────────────────────────────────────────────

export type TrackingResult =
  | { success: true }
  | {
      success: false;
      reason: 'permission_denied' | 'permission_foreground_only';
    };

export function useLocationTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] =
    useState<Location.LocationObject | null>(null);
  // Vị trí hiển thị — chỉ cập nhật khi điểm đủ điều kiện push, nên đứng yên
  // thì tọa độ không bị nhảy theo GPS drift.
  const [displayLocation, setDisplayLocation] = useState<{
    coords: { latitude: number; longitude: number };
  } | null>(null);
  const [locationCount, setLocationCount] = useState(0);
  const [permissionStatus, setPermissionStatus] =
    useState<Location.PermissionStatus | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const countRef = useRef(0);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== Location.PermissionStatus.GRANTED) {
      setPermissionStatus(foreground.status);
      return false;
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    setPermissionStatus(background.status);
    return background.status === Location.PermissionStatus.GRANTED;
  }, []);

  // Foreground watch — chỉ đếm điểm đủ điều kiện push, đọc filter state từ
  // storage để đồng bộ với background task (có thể khác JS context).
  const handleWatchLocation = useCallback((loc: Location.LocationObject) => {
    setLastLocation(loc);
    getLastPushedLocation().then((lastPushed) => {
      if (shouldPush(loc.coords.latitude, loc.coords.longitude, lastPushed)) {
        countRef.current += 1;
        setLocationCount(countRef.current);
        setDisplayLocation(loc);
      }
    });
  }, []);

  /**
   * Bắt đầu tracking.
   * @param tripId — UUID của trip từ Supabase
   */
  const startTracking = useCallback(
    async (tripId: string): Promise<TrackingResult> => {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        return { success: false, reason: 'permission_denied' };
      }

      // Lưu tripId và startTime để background task + resume có thể đọc
      await setStoredTripId(tripId);
      await setTripStartTime(Date.now());

      // Push điểm xuất phát ngay lập tức (không chờ distanceInterval)
      const startPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const { latitude, longitude, speed } = startPos.coords;
      console.log(
        '[startTracking] Pushing start point:',
        latitude.toFixed(6),
        longitude.toFixed(6),
      );

      const startRow = {
        trip_id: tripId,
        lat: latitude,
        lng: longitude,
        speed: speed ?? null,
        timestamp: new Date(startPos.timestamp).toISOString(),
      };

      const startOk = await insertWithRetry([startRow]);

      if (startOk) {
        // Chỉ update filter state SAU khi insert thành công
        await setLastPushedLocation({ lat: latitude, lng: longitude });
        countRef.current = 1;
        setLocationCount(1);
        setLastLocation(startPos);
        setDisplayLocation(startPos);
      } else {
        await saveToQueue([startRow]);
        console.warn(
          '[startTracking] Start point insert failed after retries, queued',
        );
      }

      // Foreground watch — cập nhật UI (chỉ đếm điểm được push)
      watchRef.current?.remove();
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 30,
        },
        handleWatchLocation,
      );
      watchRef.current = subscription;

      // Background task với foreground service notification
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 30,
        foregroundService: {
          notificationTitle: 'Đang theo dõi hành trình',
          notificationBody: 'Ứng dụng đang ghi nhận vị trí của bạn…',
          notificationColor: '#208AEF',
          killServiceOnDestroy: false,
        },
      });

      setIsTracking(true);
      return { success: true };
    },
    [requestPermissions, handleWatchLocation],
  );

  /**
   * Nối lại tracking khi quay lại màn hình — background task vẫn đang chạy.
   * Chỉ khởi động lại foreground watch + restore locationCount.
   * @param tripId — UUID của trip đang active
   */
  const resumeTracking = useCallback(
    async (tripId: string): Promise<TrackingResult> => {
      // Kiểm tra quyền (có thể đã bị thu hồi)
      const { status: fgStatus } =
        await Location.getForegroundPermissionsAsync();
      if (fgStatus !== Location.PermissionStatus.GRANTED) {
        return { success: false, reason: 'permission_denied' };
      }

      // Restore locationCount + filter state từ DB + local queue cho trip này
      const [
        { count, error: countError },
        queuedCount,
        { data: lastLoc, error: lastLocError },
      ] = await Promise.all([
        supabase
          .from('locations')
          .select('id', { count: 'exact', head: true } as any)
          .eq('trip_id', tripId),
        getQueuedLocationCountForTrip(tripId),
        supabase
          .from('locations')
          .select('lat, lng')
          .eq('trip_id', tripId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!countError && count != null) {
        countRef.current = count + queuedCount;
        setLocationCount(count + queuedCount);
      }

      // Restore filter state: lấy điểm cuối cùng đã push lên DB làm reference
      // để điểm đầu tiên sau resume không bị push lại (lastPushed = null).
      if (!lastLocError && lastLoc) {
        await setLastPushedLocation({ lat: lastLoc.lat, lng: lastLoc.lng });
        setDisplayLocation({
          coords: { latitude: lastLoc.lat, longitude: lastLoc.lng },
        });
      }

      // Foreground watch — cập nhật UI (chỉ đếm điểm được push)
      watchRef.current?.remove();
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 30,
        },
        handleWatchLocation,
      );
      watchRef.current = subscription;

      setIsTracking(true);
      return { success: true };
    },
    [handleWatchLocation],
  );

  /**
   * Dừng tracking.
   * Trả về tripId đã lưu để caller có thể update is_active = false trên Supabase.
   */
  const stopTracking = useCallback(async (): Promise<string | null> => {
    watchRef.current?.remove();
    watchRef.current = null;

    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME);
    } catch {
      // ignore
    }

    const tripId = await getStoredTripId();
    await removeStoredTripId();
    await removeTripStartTime();

    // Push điểm kết thúc để History tính duration = start → stop chính xác.
    // Trước đây chỉ có điểm xuất phát nên trip đứng yên hiển thị "0 phút".
    if (tripId) {
      let endPosTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const endPos = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          // Giới hạn thời gian chờ fix GPS để không treo luồng "Dừng"
          new Promise<never>((_, reject) => {
            endPosTimer = setTimeout(
              () => reject(new Error('getCurrentPositionAsync timed out')),
              8_000,
            );
          }),
        ]).finally(() => clearTimeout(endPosTimer));
        const endRow = {
          trip_id: tripId,
          lat: endPos.coords.latitude,
          lng: endPos.coords.longitude,
          speed: endPos.coords.speed ?? null,
          timestamp: new Date(endPos.timestamp).toISOString(),
        };
        await insertWithRetry([endRow]);
      } catch (err) {
        console.warn('[stopTracking] Không chụp được điểm kết thúc:', err);
      }
    }

    // Best-effort flush leftover queue (fire-and-forget, không chặn UI)
    flushQueue().catch(() => {});

    setIsTracking(false);
    return tripId;
  }, []);

  return {
    isTracking,
    lastLocation,
    displayLocation,
    locationCount,
    permissionStatus,
    startTracking,
    resumeTracking,
    stopTracking,
  };
}
