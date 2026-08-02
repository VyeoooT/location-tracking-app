import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VIEWER_BASE_URL } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import {
  LOCATION_TRACKING_TASK_NAME,
  useLocationTracking,
} from '@/hooks/useLocationTracking';
import { getTripStartTime } from '@/lib/async-storage';
import { supabase } from '@/lib/supabase';

export default function TrackingScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const {
    isTracking,
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

  // Bắt đầu hoặc nối lại tracking khi vào màn hình
  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;

    async function init() {
      // Kiểm tra xem background task đã đang chạy chưa
      const isTaskRunning = await TaskManager.isTaskRegisteredAsync(
        LOCATION_TRACKING_TASK_NAME,
      );

      if (isTaskRunning) {
        // Resume — background task đang chạy, chỉ cần foreground watch
        const result = await resumeTracking(tripId);
        if (!result.success || cancelled) return;

        // Tính elapsed từ thời điểm bắt đầu thật sự
        const storedStart = await getTripStartTime();
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
        const result = await startTracking(tripId);
        if (!result.success || cancelled) return;

        startTimeRef.current = Date.now();
        intervalRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

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
            const storedTripId = await stopTracking();
            if (storedTripId) {
              // Đánh dấu trip không còn active
              await supabase
                .from('trips')
                .update({ is_active: false })
                .eq('id', storedTripId);
            }
            router.replace('/(tabs)');
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

  const speedKmh =
    lastLocation?.coords.speed != null
      ? (lastLocation.coords.speed * 3.6).toFixed(1)
      : '--';
  const lat = lastLocation?.coords.latitude.toFixed(6) ?? '--';
  const lng = lastLocation?.coords.longitude.toFixed(6) ?? '--';
  const elapsedStr = formatElapsed(elapsed);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <ThemedView style={styles.header}>
          <ThemedView style={styles.headerLeft}>
            <ThemedText type="subtitle" style={styles.headerTitle}>
              Đang theo dõi
            </ThemedText>
            <ThemedView style={styles.statusDot} />
          </ThemedView>
          <ThemedView style={styles.headerNav}>
            <Pressable
              style={({ pressed }) => [
                styles.navBtn,
                pressed && styles.navBtnPressed,
              ]}
              onPress={() => router.replace('/(tabs)')}
            >
              <ThemedText style={styles.navBtnText}>🏠</ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.navBtn,
                pressed && styles.navBtnPressed,
              ]}
              onPress={() => router.replace('/(tabs)/history')}
            >
              <ThemedText style={styles.navBtnText}>📋</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {/* Thông số chính */}
        <ThemedView style={styles.mainStats}>
          {/* Tốc độ */}
          <ThemedView style={styles.statCard}>
            <ThemedText style={styles.statValue}>{speedKmh}</ThemedText>
            <ThemedText style={styles.statLabel}>km/h</ThemedText>
          </ThemedView>

          {/* Thời gian */}
          <ThemedView style={styles.statCard}>
            <ThemedText style={styles.statValue}>{elapsedStr}</ThemedText>
            <ThemedText style={styles.statLabel}>thời gian</ThemedText>
          </ThemedView>

          {/* Số điểm */}
          <ThemedView style={styles.statCard}>
            <ThemedText style={styles.statValue}>{locationCount}</ThemedText>
            <ThemedText style={styles.statLabel}>điểm GPS</ThemedText>
          </ThemedView>
        </ThemedView>

        {/* Toạ độ */}
        <ThemedView type="backgroundElement" style={styles.coordsCard}>
          <View style={styles.coordRow}>
            <ThemedText style={styles.coordLabel}>Vĩ độ</ThemedText>
            <ThemedText style={styles.coordValue}>{lat}</ThemedText>
          </View>
          <View style={styles.coordDivider} />
          <View style={styles.coordRow}>
            <ThemedText style={styles.coordLabel}>Kinh độ</ThemedText>
            <ThemedText style={styles.coordValue}>{lng}</ThemedText>
          </View>
        </ThemedView>

        {/* Share link row */}
        <View style={styles.shareRow}>
          <Pressable
            style={({ pressed }) => [
              styles.copyButton,
              pressed && styles.copyButtonPressed,
            ]}
            onPress={handleCopyLink}
          >
            <ThemedText style={styles.copyButtonText}>{copyLabel}</ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.shareButtonPressed,
            ]}
            onPress={handleShareLink}
          >
            <ThemedText style={styles.shareButtonText}>
              📤 Share link
            </ThemedText>
          </Pressable>
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Nút dừng */}
        <Pressable
          style={({ pressed }) => [
            styles.stopButton,
            pressed && styles.stopButtonPressed,
          ]}
          onPress={handleStop}
        >
          <ThemedText style={styles.stopButtonText}>
            🛑 Dừng hành trình
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.five,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerTitle: {
    fontSize: 28,
    lineHeight: 36,
  },
  headerNav: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnPressed: {
    opacity: 0.6,
  },
  navBtnText: {
    fontSize: 18,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
  },
  mainStats: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: '#208AEF',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: Spacing.half,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coordsCard: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    marginBottom: Spacing.four,
  },
  coordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  coordLabel: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.7,
  },
  coordValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  coordDivider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    marginVertical: Spacing.one,
  },
  shareRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  copyButton: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#208AEF',
    alignItems: 'center',
  },
  copyButtonPressed: {
    opacity: 0.6,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#208AEF',
  },
  shareButton: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: '#208AEF',
    alignItems: 'center',
  },
  shareButtonPressed: {
    opacity: 0.7,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stopButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  stopButtonPressed: {
    opacity: 0.7,
  },
  stopButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
