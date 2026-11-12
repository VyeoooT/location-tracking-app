import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SyncToast } from '@/components/sync-toast';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VIEWER_BASE_URL } from '@/constants/config';
import {
  LOCATION_TRACKING_TASK_NAME,
  useLocationTracking,
} from '@/hooks/useLocationTracking';
import type {
  TrackingFailureReason,
  TrackingResult,
} from '@/hooks/useLocationTracking';
import { getTripStartTime } from '@/lib/async-storage';
import { supabase } from '@/lib/supabase';

export default function TrackingScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const {
    displayLocation,
    lastLocation,
    locationCount,
    startTracking,
    resumeTracking,
    stopTracking,
  } = useLocationTracking();

  const [elapsed, setElapsed] = useState(0); // seconds
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copyLabel, setCopyLabel] = useState('Sao chép link');
  // Tăng khi người dùng bấm "Bật GPS" để chạy lại toàn bộ init.
  const [startAttempt, setStartAttempt] = useState(0);

  // Redirect về home nếu thiếu tripId — tránh crash khi mở sai link
  useEffect(() => {
    if (!tripId) {
      router.replace('/(tabs)');
    }
  }, [tripId, router]);

  // Bắt đầu hoặc nối lại tracking khi vào màn hình
  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;

    function showStartError(result: TrackingResult, freshStart: boolean) {
      if (result.success || cancelled) return;

      const leave = () => {
        // Hành trình mới tạo nhưng chưa start được → tránh kẹt is_active.
        if (freshStart) markTripInactive();
        router.replace('/(tabs)');
      };

      if (result.reason === 'location_unavailable') {
        // Cho người dùng bật GPS ngay rồi thử lại thay vì đá về home.
        Alert.alert('GPS đang tắt', startErrorMessage(result.reason), [
          { text: 'Huỷ', style: 'cancel', onPress: leave },
          {
            text: 'Bật GPS',
            onPress: () => setStartAttempt((attempt) => attempt + 1),
          },
        ]);
        return;
      }

      Alert.alert(
        'Không thể bắt đầu theo dõi',
        startErrorMessage(result.reason),
        [{ text: 'OK', onPress: leave }],
      );
    }

    /** Hành trình đã tạo trên DB nhưng không start được → tránh kẹt is_active. */
    function markTripInactive() {
      if (!tripId) return;
      void (async () => {
        try {
          const { error } = await supabase
            .from('trips')
            .update({ is_active: false })
            .eq('id', tripId);
          if (error) {
            console.warn(
              '[Tracking] Could not reset trip state:',
              error.message,
            );
          }
        } catch {
          // best-effort — không được làm hỏng luồng báo lỗi chính
        }
      })();
    }

    async function init() {
      let freshStart = false;
      try {
        // Kiểm tra xem background task đã đang chạy chưa
        const isTaskRunning = await TaskManager.isTaskRegisteredAsync(
          LOCATION_TRACKING_TASK_NAME,
        );

        if (isTaskRunning) {
          // Resume — background task đang chạy, chỉ cần foreground watch
          const result = await resumeTracking(tripId);
          if (!result.success) {
            showStartError(result, false);
            return;
          }
          if (cancelled) return;

          // Tính elapsed từ thời điểm bắt đầu thật sự
          const storedStart = await getTripStartTime();
          if (cancelled) return;
          if (storedStart != null) {
            startTimeRef.current = storedStart;
            setElapsed(Math.floor((Date.now() - storedStart) / 1000));
          } else {
            startTimeRef.current = Date.now();
          }

          intervalRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }, 1000);
        } else {
          // Fresh start
          freshStart = true;
          const result = await startTracking(tripId);
          if (!result.success) {
            showStartError(result, true);
            return;
          }
          if (cancelled) return;

          startTimeRef.current = Date.now();
          intervalRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }, 1000);
        }
      } catch (err) {
        // Không được để lỗi biến thành unhandled rejection: màn hình phải
        // báo cho người dùng và đưa họ về trang chủ.
        console.warn('[Tracking] Could not start tracking:', err);
        if (cancelled) return;
        if (freshStart) markTripInactive();
        Alert.alert(
          'Không thể bắt đầu theo dõi',
          'Đã xảy ra lỗi khi khởi động theo dõi vị trí. Vui lòng thử lại.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)'),
            },
          ],
        );
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tripId, resumeTracking, startTracking, router, startAttempt]);

  const handleStop = () => {
    Alert.alert(
      'Dừng hành trình',
      'Bạn có chắc muốn dừng theo dõi hành trình này?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Dừng',
          style: 'destructive',
          onPress: async () => {
            try {
              const storedTripId = await stopTracking();
              if (storedTripId) {
                // Đánh dấu trip không còn active
                await supabase
                  .from('trips')
                  .update({ is_active: false })
                  .eq('id', storedTripId);
              }
            } catch (err) {
              console.warn('[Tracking] Could not stop tracking cleanly:', err);
            } finally {
              router.replace('/(tabs)');
            }
          },
        },
      ],
    );
  };

  const handleCopyLink = async () => {
    if (!tripId) return;
    const link = `${VIEWER_BASE_URL}/${tripId}`;
    await Clipboard.setStringAsync(link);
    setCopyLabel('Đã sao chép!');
    setTimeout(() => setCopyLabel('Sao chép link'), 2000);
  };

  const handleShareLink = async () => {
    if (!tripId) return;
    const link = `${VIEWER_BASE_URL}/${tripId}`;
    try {
      await Share.share({
        message: `Bé yêu theo dõi Anh trên maps nha: ${link}`,
        url: link, // iOS
      });
    } catch {
      // user cancelled — no-op
    }
  };

  // Tọa độ hiển thị dùng displayLocation (chỉ cập nhật khi di chuyển thật sự)
  // để đứng yên không bị nhảy theo GPS drift. Speed dùng lastLocation trực tiếp.
  const speedKmh =
    lastLocation?.coords.speed != null
      ? (lastLocation.coords.speed * 3.6).toFixed(1)
      : '--';
  const lat = displayLocation?.coords.latitude.toFixed(6) ?? '--';
  const lng = displayLocation?.coords.longitude.toFixed(6) ?? '--';
  const elapsedStr = formatElapsed(elapsed);

  // Không render màn hình tracking nếu thiếu tripId
  if (!tripId) return null;

  return (
    <ThemedView className="flex-1">
      <SafeAreaView className="flex-1 px-6 pt-4">
        <SyncToast />
        {/* Header */}
        <ThemedView className="mb-8 flex-row items-center justify-between">
          <ThemedView className="flex-row items-center gap-2">
            <ThemedText type="subtitle" className="text-[28px] leading-9">
              Đang theo dõi
            </ThemedText>
            <ThemedView className="size-2.5 rounded-full bg-success" />
          </ThemedView>
          <ThemedView className="flex-row gap-2">
            <Pressable
              className="h-10 w-10 items-center justify-center rounded-full bg-neutral-500/15 active:opacity-60"
              onPress={() => router.replace('/(tabs)')}
            >
              <ThemedText className="text-lg">🏠</ThemedText>
            </Pressable>
            <Pressable
              className="h-10 w-10 items-center justify-center rounded-full bg-neutral-500/15 active:opacity-60"
              onPress={() => router.replace('/(tabs)/history')}
            >
              <ThemedText className="text-lg">📋</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {/* Thông số chính */}
        <ThemedView className="mb-6 flex-row gap-4">
          {/* Tốc độ */}
          <ThemedView className="flex-1 items-center rounded-2xl bg-brand px-4 py-6">
            <ThemedText className="text-[28px] font-bold tabular-nums text-white">
              {speedKmh}
            </ThemedText>
            <ThemedText className="mt-0.5 text-xs font-medium uppercase tracking-[0.5px] text-white/80">
              km/h
            </ThemedText>
          </ThemedView>

          {/* Thời gian */}
          <ThemedView className="flex-1 items-center rounded-2xl bg-brand px-4 py-6">
            <ThemedText className="text-[28px] font-bold tabular-nums text-white">
              {elapsedStr}
            </ThemedText>
            <ThemedText className="mt-0.5 text-xs font-medium uppercase tracking-[0.5px] text-white/80">
              thời gian
            </ThemedText>
          </ThemedView>

          {/* Số điểm */}
          <ThemedView className="flex-1 items-center rounded-2xl bg-brand px-4 py-6">
            <ThemedText className="text-[28px] font-bold tabular-nums text-white">
              {locationCount}
            </ThemedText>
            <ThemedText className="mt-0.5 text-xs font-medium uppercase tracking-[0.5px] text-white/80">
              điểm GPS
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {/* Toạ độ */}
        <ThemedView type="backgroundElement" className="mb-6 rounded-2xl p-6">
          <View className="flex-row items-center justify-between py-1">
            <ThemedText className="text-sm font-medium opacity-70">
              Vĩ độ
            </ThemedText>
            <ThemedText className="text-base font-semibold tabular-nums">
              {lat}
            </ThemedText>
          </View>
          <View className="my-1 h-px bg-neutral-500/20" />
          <View className="flex-row items-center justify-between py-1">
            <ThemedText className="text-sm font-medium opacity-70">
              Kinh độ
            </ThemedText>
            <ThemedText className="text-base font-semibold tabular-nums">
              {lng}
            </ThemedText>
          </View>
        </ThemedView>

        {/* Share link row */}
        <View className="mb-6 flex-row gap-4">
          <Pressable
            className="flex-1 items-center rounded-2xl border border-brand py-4 active:opacity-60"
            onPress={handleCopyLink}
          >
            <ThemedText className="text-sm font-semibold text-brand">
              {copyLabel}
            </ThemedText>
          </Pressable>
          <Pressable
            className="flex-1 items-center rounded-2xl bg-brand py-4 active:opacity-70"
            onPress={handleShareLink}
          >
            <ThemedText className="text-sm font-semibold text-white">
              📤 Share link
            </ThemedText>
          </Pressable>
        </View>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Nút dừng */}
        <Pressable
          className="items-center self-stretch rounded-2xl bg-danger py-6 active:opacity-70"
          onPress={handleStop}
        >
          <ThemedText className="text-lg font-bold text-white">
            🛑 Dừng hành trình
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function startErrorMessage(reason: TrackingFailureReason): string {
  switch (reason) {
    case 'permission_denied':
      return 'Ứng dụng chưa được cấp quyền truy cập vị trí. Vui lòng cấp quyền vị trí (bao gồm "Luôn cho phép" nếu được hỏi) trong Cài đặt rồi thử lại.';
    case 'location_unavailable':
      return 'Dịch vụ vị trí (GPS) đang tắt. Nhấn "Bật GPS" để bật dịch vụ vị trí rồi thử lại.';
    case 'start_failed':
      return 'Không thể khởi động theo dõi vị trí. Vui lòng kiểm tra GPS và thử lại.';
    default:
      return 'Không thể bắt đầu theo dõi hành trình. Vui lòng thử lại.';
  }
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
