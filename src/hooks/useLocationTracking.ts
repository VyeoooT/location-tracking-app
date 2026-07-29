import { useState, useCallback, useRef, useEffect } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '@/lib/supabase';
import {
  getStoredTripId,
  setStoredTripId,
  removeStoredTripId,
  setTripStartTime,
  getTripStartTime,
  removeTripStartTime,
} from '@/lib/async-storage';

export const LOCATION_TRACKING_TASK_NAME = 'LOCATION_TRACKING';

// ─── GPS filtering helpers (global scope) ──────────────────────

/** Tính khoảng cách Haversine giữa 2 điểm (mét) */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Bán kính trái đất (mét)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Lưu điểm cuối cùng đã push để tính khoảng cách
let lastPushedLat: number | null = null;
let lastPushedLng: number | null = null;

const MIN_SPEED_MPS = 1.0; // 3.6 km/h — dưới ngưỡng này coi là đứng yên
const MIN_DISTANCE_M = 20; // 20 mét — dịch chuyển tối thiểu mới push

/**
 * Kiểm tra xem location có đáng push không.
 * Logic: speed cao → push luôn. Speed thấp → kiểm tra khoảng cách.
 */
function shouldPush(lat: number, lng: number, speed: number | null): boolean {
  // Speed cao → chắc chắn đang di chuyển
  if (speed != null && speed >= MIN_SPEED_MPS) return true;

  // Speed thấp / null → kiểm tra khoảng cách với điểm cuối
  if (lastPushedLat == null || lastPushedLng == null) return true; // điểm đầu tiên luôn push

  const dist = haversineDistance(lastPushedLat, lastPushedLng, lat, lng);
  return dist > MIN_DISTANCE_M;
}

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

  const rows: Array<{
    trip_id: string;
    lat: number;
    lng: number;
    speed: number | null;
    timestamp: string;
  }> = [];

  for (const loc of locations) {
    const { latitude, longitude, speed } = loc.coords;

    if (shouldPush(latitude, longitude, speed ?? null)) {
      rows.push({
        trip_id: tripId,
        lat: latitude,
        lng: longitude,
        speed: speed ?? null,
        timestamp: new Date(loc.timestamp).toISOString(),
      });
      lastPushedLat = latitude;
      lastPushedLng = longitude;
    }
  }

  const filtered = locations.length - rows.length;
  if (filtered > 0) {
    console.log(`[BackgroundTask] Filtered ${filtered} GPS drift point(s)`);
  }

  if (rows.length === 0) return;

  const { error: dbError } = await supabase.from('locations').insert(rows);
  if (dbError) {
    console.error('[BackgroundTask] Supabase insert error:', dbError.message);
  } else {
    console.log(`[BackgroundTask] Pushed ${rows.length} location(s)`);
  }
});

// ─── Hook ──────────────────────────────────────────────────────

export type TrackingResult =
  | { success: true }
  | { success: false; reason: 'permission_denied' | 'permission_foreground_only' };

export function useLocationTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<Location.LocationObject | null>(null);
  const [locationCount, setLocationCount] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
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
      console.log('[startTracking] Pushing start point:', latitude.toFixed(6), longitude.toFixed(6));

      const { error: startError } = await supabase.from('locations').insert({
       trip_id: tripId,
       lat: latitude,
       lng: longitude,
       speed: speed ?? null,
       timestamp: new Date(startPos.timestamp).toISOString(),
      });

      if (startError) {
       console.error('[startTracking] Start point insert error:', startError.message);
      } else {
       lastPushedLat = latitude;
       lastPushedLng = longitude;
       countRef.current = 1;
       setLocationCount(1);
       setLastLocation(startPos);
      }

      // Foreground watch — cập nhật UI (chỉ đếm điểm được push)
      watchRef.current?.remove();
      const subscription = await Location.watchPositionAsync(
       {
         accuracy: Location.Accuracy.BestForNavigation,
         distanceInterval: 30,
       },
       (loc) => {
         setLastLocation(loc);
         // Chỉ tăng count nếu điểm này đủ điều kiện push (đồng bộ với BG task)
         if (shouldPush(loc.coords.latitude, loc.coords.longitude, loc.coords.speed ?? null)) {
           countRef.current += 1;
           setLocationCount(countRef.current);
         }
       },
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
          killServiceOnDestroy: true,
        },
      });

      setIsTracking(true);
      return { success: true };
    },
    [requestPermissions],
  );

  /**
   * Nối lại tracking khi quay lại màn hình — background task vẫn đang chạy.
   * Chỉ khởi động lại foreground watch + restore locationCount.
   * @param tripId — UUID của trip đang active
   */
  const resumeTracking = useCallback(
    async (tripId: string): Promise<TrackingResult> => {
      // Kiểm tra quyền (có thể đã bị thu hồi)
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== Location.PermissionStatus.GRANTED) {
        return { success: false, reason: 'permission_denied' };
      }

      // Restore locationCount từ DB cho trip này
      const { count, error: countError } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true } as any)
        .eq('trip_id', tripId);

      if (!countError && count != null) {
        countRef.current = count;
        setLocationCount(count);
      }

      // Foreground watch — cập nhật UI (chỉ đếm điểm được push)
      watchRef.current?.remove();
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 30,
        },
        (loc) => {
          setLastLocation(loc);
          if (shouldPush(loc.coords.latitude, loc.coords.longitude, loc.coords.speed ?? null)) {
            countRef.current += 1;
            setLocationCount(countRef.current);
          }
        },
      );
      watchRef.current = subscription;

      setIsTracking(true);
      return { success: true };
    },
    [],
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

    setIsTracking(false);
    return tripId;
  }, []);

  return {
    isTracking,
    lastLocation,
    locationCount,
    permissionStatus,
    startTracking,
    resumeTracking,
    stopTracking,
  };
}
