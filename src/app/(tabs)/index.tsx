import { useState, useCallback } from 'react';
import { Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
        // Fetch trip count — lỗi thì giữ '--', không làm hỏng flow active trip
        try {
          const { count } = await supabase
            .from('trips')
            .select('id', { count: 'exact', head: true } as any);
          if (!cancelled) setTripCount(count ?? 0);
        } catch (err) {
          console.warn('[Home] Trip count fetch failed:', err);
        }

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

          // Verify với Supabase — offline (query error) thì coi trip vẫn active
          const { data, error } = await supabase
            .from('trips')
            .select('id, is_active')
            .eq('id', storedId)
            .single();

          if (!cancelled) {
            const stillActive = error != null ? true : data?.is_active === true;
            setActiveTripId(stillActive ? storedId : null);
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
      return () => {
        cancelled = true;
      };
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
        Alert.alert(
          'Không thể bắt đầu hành trình',
          'Đã có lỗi khi tạo hành trình mới. Vui lòng kiểm tra kết nối và thử lại.',
        );
        return;
      }

      console.log('[Home] Trip created:', JSON.stringify(data));
      setActiveTripId(data.id);
      router.replace(`/tracking?tripId=${data.id}`);
    } catch (error) {
      console.error('[Home] Unexpected error creating trip:', error);
      Alert.alert(
        'Không thể bắt đầu hành trình',
        'Đã có lỗi không mong muốn. Vui lòng thử lại.',
      );
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
    <ThemedView className="flex-1 flex-row justify-center">
      <SafeAreaView className="ios:pb-[66px] android:pb-24 flex max-w-[800px] flex-1 items-center justify-center gap-6 px-6">
        {/* Hero */}
        <ThemedView className="mb-4 items-center gap-4">
          <ThemedText type="title" className="text-[64px] leading-[72px]">
            📍
          </ThemedText>
          <ThemedText type="subtitle" className="text-center">
            Location Tracker
          </ThemedText>
          <ThemedText className="max-w-[280px] text-center opacity-70">
            Theo dõi hành trình của bạn và chia sẻ với người thân
          </ThemedText>
        </ThemedView>

        {/* Nút chính */}
        {checkingTrip ? (
          <ThemedView className="min-h-[64px] items-center justify-center self-stretch rounded-2xl bg-brand py-6 opacity-50">
            <ActivityIndicator color="#FFFFFF" size="small" />
          </ThemedView>
        ) : activeTripId ? (
          <Pressable
            className="items-center justify-center self-stretch rounded-2xl bg-success py-6 active:opacity-70"
            onPress={handleResumeTrip}
          >
            <ThemedText className="text-xl font-bold text-white">
              📍 Đang trong hành trình
            </ThemedText>
            <ThemedText className="mt-0.5 text-[13px] text-white/80">
              Chạm để xem
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            className={`min-h-[64px] items-center justify-center self-stretch rounded-2xl bg-brand py-6 active:opacity-70${starting ? 'opacity-50' : ''}`}
            onPress={handleStartTrip}
            disabled={starting}
          >
            {starting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <ThemedText className="text-xl font-bold text-white">
                🚀 Bắt đầu hành trình
              </ThemedText>
            )}
          </Pressable>
        )}

        {/* Thống kê */}
        <ThemedView
          type="backgroundElement"
          className="flex-row items-center gap-2 rounded-2xl px-6 py-4"
        >
          <ThemedText className="text-2xl font-bold">
            {tripCount != null ? tripCount : '--'}
          </ThemedText>
          <ThemedText className="text-sm opacity-70">
            chuyến đã thực hiện
          </ThemedText>
        </ThemedView>

        {/* Nút phụ */}
        <Pressable
          className="items-center self-stretch rounded-2xl border border-neutral-500/30 py-4 active:opacity-60"
          onPress={handleViewHistory}
        >
          <ThemedText className="text-base font-semibold">
            📋 Xem lịch sử
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}
