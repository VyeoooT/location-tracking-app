import { useState, useCallback, useRef, useEffect } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '@/lib/supabase';
import { getStoredTripId, setStoredTripId, removeStoredTripId } from '@/lib/async-storage';

export const LOCATION_TRACKING_TASK_NAME = 'LOCATION_TRACKING';

// ─── Background task (global scope) ────────────────────────────
// Chạy ngay cả khi app ở background. Tự push location lên Supabase.
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

  const rows = locations.map((loc) => ({
    trip_id: tripId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speed: loc.coords.speed,
    timestamp: new Date(loc.timestamp).toISOString(),
  }));

  const { error: dbError } = await supabase.from('locations').insert(rows as never[]);
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

      // Lưu tripId để background task có thể đọc
      await setStoredTripId(tripId);

      // Foreground watch — cập nhật UI
      watchRef.current?.remove();
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (loc) => {
          setLastLocation(loc);
          countRef.current += 1;
          setLocationCount(countRef.current);
        },
      );
      watchRef.current = subscription;

      // Background task với foreground service notification
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 10,
        timeInterval: 5000,
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

    setIsTracking(false);
    return tripId;
  }, []);

  return {
    isTracking,
    lastLocation,
    locationCount,
    permissionStatus,
    startTracking,
    stopTracking,
  };
}
