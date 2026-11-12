import { useState, useCallback, useRef, useEffect } from 'react';
import * as Location from 'expo-location';
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
  removeLastPushedLocation,
} from '@/lib/async-storage';
import { insertWithRetry, saveToQueue, flushQueue } from '@/lib/location-queue';
import { LOCATION_TRACKING_TASK_NAME } from '@/lib/location-background-task';
import { shouldPush } from '@/lib/gps-filter';

export { LOCATION_TRACKING_TASK_NAME };

/** GPS/timeout dùng chung cho các lần lấy vị trí một lần (không phải watch). */
const ONE_SHOT_TIMEOUT_MS = 8_000;

/**
 * Location services có thể bị tắt ở cài đặt máy dù app đã có quyền. Hàm này
 * không throw: nếu API lỗi thì coi như còn bật để không chặn tracking oan.
 */
async function isLocationServiceEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch (err) {
    console.warn('[Location] Could not check location services:', err);
    return true;
  }
}

/**
 * Yêu cầu người dùng bật GPS. Trên Android, `enableNetworkProviderAsync` mở
 * dialog hệ thống để bật location services / chế độ "High accuracy".
 * Trả về trạng thái GPS sau khi người dùng chọn.
 */
async function requestLocationServicesEnabled(): Promise<boolean> {
  try {
    await Location.enableNetworkProviderAsync();
  } catch (err) {
    console.warn('[Location] User did not enable location services:', err);
  }
  return isLocationServiceEnabled();
}

/** `getCurrentPositionAsync` có thể treo vô hạn khi không có GPS fix. */
async function getCurrentPositionWithTimeout(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('getCurrentPositionAsync timed out')),
          ONE_SHOT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Cấu hình dùng chung cho cả lúc start và resume để không lệch nhau. */
const LOCATION_UPDATES_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 30,
  foregroundService: {
    notificationTitle: 'Đang theo dõi hành trình',
    notificationBody: 'Ứng dụng đang ghi nhận vị trí của bạn…',
    notificationColor: '#208AEF',
    killServiceOnDestroy: false,
  },
};

/** Chuyển 1 LocationObject thành dòng để ghi vào bảng `locations`. */
function buildLocationRow(tripId: string, loc: Location.LocationObject) {
  return {
    trip_id: tripId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speed: loc.coords.speed ?? null,
    timestamp: new Date(loc.timestamp).toISOString(),
  };
}

// ─── Hook ──────────────────────────────────────────────────────

export type TrackingFailureReason =
  'permission_denied' | 'location_unavailable' | 'start_failed';

export type TrackingResult =
  { success: true } | { success: false; reason: TrackingFailureReason };

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
  // Trip cần bổ sung điểm bắt đầu bằng vị trí watch đầu tiên (khi fix ban
  // đầu thất bại/chậm). Chỉ áp dụng cho foreground watch hiện tại.
  const pendingStartTripRef = useRef<string | null>(null);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      pendingStartTripRef.current = null;
    };
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== Location.PermissionStatus.GRANTED) {
        setPermissionStatus(foreground.status);
        return false;
      }

      const background = await Location.requestBackgroundPermissionsAsync();
      setPermissionStatus(background.status);
      return background.status === Location.PermissionStatus.GRANTED;
    } catch (err) {
      console.warn(
        '[Permissions] Could not request location permissions:',
        err,
      );
      return false;
    }
  }, []);

  // Foreground watch — chỉ đếm điểm đủ điều kiện push, đọc filter state từ
  // storage để đồng bộ với background task (có thể khác JS context).
  const handleWatchLocation = useCallback((loc: Location.LocationObject) => {
    setLastLocation(loc);

    // Fix ban đầu thất bại → dùng vị trí watch đầu tiên làm điểm bắt đầu để
    // không mất điểm start (đặc biệt khi GPS cold-start quá 8s).
    const pendingTripId = pendingStartTripRef.current;
    if (pendingTripId) {
      pendingStartTripRef.current = null;
      const row = buildLocationRow(pendingTripId, loc);

      void insertWithRetry([row])
        .then(async (ok) => {
          if (!ok) {
            await saveToQueue([row]);
          }
        })
        .catch((err) => {
          console.warn('[watchPosition] Could not save start point:', err);
        });

      // Cập nhật filter state ngay để background task không push lại điểm
      // này hoặc GPS drift gần đó.
      void setLastPushedLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      }).catch(() => {});

      countRef.current = Math.max(countRef.current, 1);
      setLocationCount(countRef.current);
      setDisplayLocation(loc);
      return;
    }

    getLastPushedLocation()
      .then((lastPushed) => {
        if (shouldPush(loc.coords.latitude, loc.coords.longitude, lastPushed)) {
          countRef.current += 1;
          setLocationCount(countRef.current);
          setDisplayLocation(loc);
        }
      })
      .catch((err) => {
        console.warn('[watchPosition] Could not read filter state:', err);
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

      // Quyền đã cấp vẫn có thể bị tắt GPS (location services) ở cài đặt máy.
      // Kiểm tra trước để trả lỗi có kiểm soát thay vì để
      // getCurrentPositionAsync reject thành unhandled rejection.
      let servicesEnabled = await isLocationServiceEnabled();
      if (!servicesEnabled) {
        // Yêu cầu người dùng bật GPS bằng dialog hệ thống.
        servicesEnabled = await requestLocationServicesEnabled();
      }
      if (!servicesEnabled) {
        return { success: false, reason: 'location_unavailable' };
      }

      // Lưu tripId và startTime để background task + resume có thể đọc
      await setStoredTripId(tripId);
      await setTripStartTime(Date.now());
      // Xóa filter state cũ từ trip trước để điểm đầu tiên của trip mới luôn
      // được push, kể cả khi xuất phát gần vị trí kết thúc trip trước.
      await removeLastPushedLocation();
      pendingStartTripRef.current = null;

      // Push điểm xuất phát ngay lập tức (không chờ distanceInterval).
      // Best-effort: thiết bị chưa có GPS fix có thể reject/treo, nhưng watch
      // phía dưới vẫn đủ để bắt đầu hành trình.
      try {
        const startPos = await getCurrentPositionWithTimeout();
        const { latitude, longitude } = startPos.coords;
        console.log(
          '[startTracking] Pushing start point:',
          latitude.toFixed(6),
          longitude.toFixed(6),
        );

        const startRow = buildLocationRow(tripId, startPos);

        const startOk = await insertWithRetry([startRow]);

        // Cập nhật filter state dù insert thành công hay thất bại. Nếu không
        // set, lastPushedLocation = null → background task sẽ coi mọi điểm
        // GPS drift là điểm mới và push hết, tạo nhiều điểm giả.
        await setLastPushedLocation({ lat: latitude, lng: longitude });

        if (startOk) {
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
      } catch (err) {
        console.warn('[startTracking] Could not capture start point:', err);
        // Không có fix ngay → điểm watch đầu tiên sẽ trở thành điểm bắt đầu.
        pendingStartTripRef.current = tripId;
      }

      // Foreground watch + background updates. Nếu không khởi động được thì
      // rollback state đã lưu để lần sau vào màn hình coi như start mới.
      watchRef.current?.remove();
      watchRef.current = null;
      try {
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
      } catch (err) {
        console.warn('[startTracking] Could not start location updates:', err);
        watchRef.current?.remove();
        watchRef.current = null;
        await Location.stopLocationUpdatesAsync(
          LOCATION_TRACKING_TASK_NAME,
        ).catch(() => {});
        await removeStoredTripId();
        await removeTripStartTime();
        countRef.current = 0;
        setLocationCount(0);
        setIsTracking(false);
        return { success: false, reason: 'start_failed' };
      }

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
      let fgStatus: Location.PermissionStatus;
      try {
        const permissions = await Location.getForegroundPermissionsAsync();
        fgStatus = permissions.status;
      } catch (err) {
        console.warn('[resumeTracking] Could not read permissions:', err);
        return { success: false, reason: 'permission_denied' };
      }
      if (fgStatus !== Location.PermissionStatus.GRANTED) {
        return { success: false, reason: 'permission_denied' };
      }

      let servicesEnabled = await isLocationServiceEnabled();
      if (!servicesEnabled) {
        servicesEnabled = await requestLocationServicesEnabled();
      }
      if (!servicesEnabled) {
        return { success: false, reason: 'location_unavailable' };
      }

      // Restore locationCount + filter state từ DB + local queue cho trip này.
      // Lỗi mạng ở bước này không nên chặn việc nối lại watch.
      try {
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
      } catch (err) {
        console.warn('[resumeTracking] Could not restore trip state:', err);
      }

      // Foreground watch — cập nhật UI (chỉ đếm điểm được push)
      watchRef.current?.remove();
      watchRef.current = null;
      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 30,
          },
          handleWatchLocation,
        );
        watchRef.current = subscription;
      } catch (err) {
        console.warn('[resumeTracking] Could not start watch:', err);
        watchRef.current?.remove();
        watchRef.current = null;
        setIsTracking(false);
        return { success: false, reason: 'start_failed' };
      }

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
        const endOk = await insertWithRetry([endRow]);
        if (!endOk) {
          // Không để mất điểm kết thúc khi offline — đưa vào queue để lần
          // flush sau (khi có mạng) đẩy lên.
          await saveToQueue([endRow]);
          console.warn('[stopTracking] End point insert failed, queued');
        }
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
