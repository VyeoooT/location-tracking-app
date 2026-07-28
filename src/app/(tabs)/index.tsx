import { useState, useCallback } from 'react';
import { StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getStoredTripId } from '@/lib/async-storage';
import { LOCATION_TRACKING_TASK_NAME } from '@/hooks/useLocationTracking';

export default function HomeScreen() {
  const router = useRouter();
  const [tripCount, setTripCount] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [checkingTrip, setCheckingTrip] = useState(true);

  // Fetch tổng số chuyến đã thực hiện + kiểm tra trip active mỗi lần tab focus
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        // Fetch trip count
        supabase
          .from('trips')
          .select('id', { count: 'exact', head: true } as any)
          .then(({ count }: { count: number | null }) => {
            if (!cancelled) setTripCount(count ?? 0);
          });

        // Check active trip
        try {
          const hasStarted = await Location.hasStartedLocationUpdatesAsync(
            LOCATION_TRACKING_TASK_NAME,
          );
          if (!hasStarted) {
            if (!cancelled) {
              setActiveTripId(null);
              setCheckingTrip(false);
            }
            return;
          }

          const storedId = await getStoredTripId();
          if (!storedId) {
            if (!cancelled) {
              setActiveTripId(null);
              setCheckingTrip(false);
            }
            return;
          }

          // Verify với Supabase
          const { data } = await supabase
            .from('trips')
            .select('id, is_active')
            .eq('id', storedId)
            .single();

          if (!cancelled) {
            setActiveTripId(data?.is_active ? storedId : null);
            setCheckingTrip(false);
          }
        } catch {
          if (!cancelled) {
            setActiveTripId(null);
            setCheckingTrip(false);
          }
        }
      }

      load();
      return () => { cancelled = true; };
    }, []),
  );

  const handleStartTrip = useCallback(async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .insert({ is_active: true })
        .select('id, is_active')
        .single();

      if (error || !data) {
        console.error('[Home] Failed to create trip:', error?.message);
        return;
      }

      console.log('[Home] Trip created:', JSON.stringify(data));
      setActiveTripId(data.id);
      router.replace(`/tracking?tripId=${data.id}`);
    } finally {
      setStarting(false);
    }
  }, [router]);

  const handleResumeTrip = useCallback(() => {
    if (activeTripId) {
      router.replace(`/tracking?tripId=${activeTripId}`);
    }
  }, [router, activeTripId]);

  const handleViewHistory = useCallback(() => {
    router.push('/(tabs)/history');
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Hero */}
        <ThemedView style={styles.heroSection}>
          <ThemedText type="title" style={styles.heroEmoji}>
            📍
          </ThemedText>
          <ThemedText type="subtitle" style={styles.heroTitle}>
            Location Tracker
          </ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Theo dõi hành trình của bạn và chia sẻ với người thân
          </ThemedText>
        </ThemedView>

        {/* Nút chính */}
        {checkingTrip ? (
          <ThemedView style={[styles.startButton, styles.startButtonChecking]}>
            <ActivityIndicator color="#FFFFFF" size="small" />
          </ThemedView>
        ) : activeTripId ? (
          <Pressable
            style={({ pressed }) => [
              styles.resumeButton,
              pressed && styles.resumeButtonPressed,
            ]}
            onPress={handleResumeTrip}>
            <ThemedText style={styles.resumeButtonText}>📍 Đang trong hành trình</ThemedText>
            <ThemedText style={styles.resumeButtonSub}>Chạm để xem</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.startButtonPressed,
              starting && styles.startButtonDisabled,
            ]}
            onPress={handleStartTrip}
            disabled={starting}>
            {starting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <ThemedText style={styles.startButtonText}>🚀 Bắt đầu hành trình</ThemedText>
            )}
          </Pressable>
        )}

        {/* Thống kê */}
        <ThemedView type="backgroundElement" style={styles.statsCard}>
          <ThemedText style={styles.statsCount}>
            {tripCount != null ? tripCount : '--'}
          </ThemedText>
          <ThemedText style={styles.statsLabel}>chuyến đã thực hiện</ThemedText>
        </ThemedView>

        {/* Nút phụ */}
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={handleViewHistory}>
          <ThemedText style={styles.secondaryButtonText}>📋 Xem lịch sử</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  heroEmoji: {
    fontSize: 64,
    lineHeight: 72,
  },
  heroTitle: {
    textAlign: 'center',
  },
  heroSubtitle: {
    textAlign: 'center',
    opacity: 0.7,
    maxWidth: 280,
  },
  startButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  startButtonPressed: {
    opacity: 0.7,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonChecking: {
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resumeButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  resumeButtonPressed: {
    opacity: 0.7,
  },
  resumeButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resumeButtonSub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: Spacing.half,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  statsCount: {
    fontSize: 24,
    fontWeight: '700',
  },
  statsLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
