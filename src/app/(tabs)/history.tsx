import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Share,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VIEWER_BASE_URL } from '@/constants/config';
import { supabase } from '@/lib/supabase';

interface TripSummary {
  id: string;
  created_at: string;
  name: string | null;
  is_active: boolean;
  point_count: number;
  first_ts: string | null;
  last_ts: string | null;
}

export default function TripHistoryScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrips = useCallback(async () => {
    // View trip_summaries gộp count + first/last timestamp trong 1 query
    // (không còn 3N queries như trước — xem scripts/init.sql)
    const { data, error } = await supabase
      .from('trip_summaries')
      .select('id, created_at, name, is_active, point_count, first_ts, last_ts')
      .order('created_at', { ascending: false });

    console.log('[History] Summaries fetch:', {
      count: data?.length,
      error: error?.message,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setTrips((data ?? []) as TripSummary[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await fetchTrips();
    })();
  }, [fetchTrips]);

  const handleOpenViewer = useCallback((tripId: string) => {
    const url = `${VIEWER_BASE_URL}/${tripId}`;
    Linking.openURL(url).catch(() => {
      // fallback: copy to clipboard
      Clipboard.setStringAsync(url);
    });
  }, []);

  const handleShare = useCallback(async (tripId: string) => {
    const url = `${VIEWER_BASE_URL}/${tripId}`;
    await Share.share({
      message: `Bé yêu theo dõi Anh trên maps nha: ${url}`,
      url,
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    await fetchTrips();
    setRefreshing(false);
  }, [fetchTrips]);

  const handleResume = useCallback(
    (tripId: string) => {
      router.replace(`/tracking?tripId=${tripId}`);
    },
    [router],
  );

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <ThemedView className="ios:pb-[50px] android:pb-20 flex flex-1 items-center justify-center gap-4">
        <ActivityIndicator size="large" color="#208AEF" />
        <ThemedText className="opacity-60">Đang tải lịch sử…</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView className="ios:pb-[50px] android:pb-20 flex flex-1 items-center justify-center gap-4">
        <ThemedText className="text-lg font-bold">
          ⚠️ Lỗi tải dữ liệu
        </ThemedText>
        <ThemedText className="px-6 text-center text-[13px] opacity-60">
          {error}
        </ThemedText>
        <Pressable
          className="rounded-2xl bg-brand px-8 py-4 active:opacity-70"
          onPress={handleRefresh}
        >
          <ThemedText className="font-bold text-white">Thử lại</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView className="flex-1">
      <SafeAreaView className="flex-1">
        <View className="w-full max-w-[800px] self-center px-6">
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#208AEF']}
                tintColor="#208AEF"
              />
            }
            ListHeaderComponent={
              <ThemedView className="gap-1 pb-6 pt-8">
                <ThemedText type="subtitle">Lịch sử hành trình</ThemedText>
                <ThemedText className="text-sm opacity-60">
                  {trips.length} chuyến đã thực hiện
                </ThemedText>
              </ThemedView>
            }
            ListEmptyComponent={<EmptyState />}
            renderItem={({ item }) => (
              <TripCard
                trip={item}
                onOpen={() => handleOpenViewer(item.id)}
                onResume={() => handleResume(item.id)}
                onShare={() => handleShare(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <ThemedView className="h-2" />}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

// ─── Empty State ──────────────────────────────────────────

function EmptyState() {
  return (
    <ThemedView className="items-center gap-4 py-16">
      <ThemedText className="text-5xl">🗺️</ThemedText>
      <ThemedText className="text-lg font-bold">
        Chưa có hành trình nào
      </ThemedText>
      <ThemedText className="text-center text-sm opacity-50">
        Hãy bắt đầu hành trình đầu tiên từ màn hình Home!
      </ThemedText>
    </ThemedView>
  );
}

// ─── Trip Card ────────────────────────────────────────────

function TripCard({
  trip,
  onOpen,
  onResume,
  onShare,
}: {
  trip: TripSummary;
  onOpen: () => void;
  onResume: () => void;
  onShare: () => void;
}) {
  const startDate = new Date(trip.created_at).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const startTime = new Date(trip.created_at).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const duration = computeDurationFriendly(trip.first_ts, trip.last_ts);

  return (
    <Pressable
      className="overflow-hidden rounded-2xl active:opacity-80"
      onPress={trip.is_active ? onResume : onOpen}
    >
      <ThemedView type="backgroundElement" className="gap-4 rounded-2xl p-6">
        {/* Row 1: date + active badge */}
        <ThemedView className="flex-row items-center justify-between">
          <ThemedView className="flex-row items-baseline gap-2">
            <ThemedText className="text-base font-bold">{startDate}</ThemedText>
            <ThemedText className="text-sm opacity-60">{startTime}</ThemedText>
          </ThemedView>
          {trip.is_active && (
            <ThemedView className="rounded-lg bg-success px-2 py-0.5">
              <ThemedText className="text-xs font-bold text-white">
                ● Đang chạy
              </ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        {/* Row 2: stats */}
        <ThemedView className="flex-row gap-8">
          <StatItem label="⏱ Thời lượng" value={duration} />
          <StatItem label="📍 Điểm GPS" value={`${trip.point_count}`} />
        </ThemedView>

        {/* Row 3: actions */}
        <ThemedView className="flex-row gap-2">
          <Pressable
            className="flex-1 items-center rounded-lg border border-neutral-500/30 py-2 active:opacity-60"
            onPress={(e) => {
              e.stopPropagation();
              if (trip.is_active) {
                onResume();
              } else {
                onOpen();
              }
            }}
          >
            <ThemedText className="text-[13px] font-semibold">
              {trip.is_active ? '📡 Tiếp tục theo dõi' : '🌐 Xem trên bản đồ'}
            </ThemedText>
          </Pressable>
          <Pressable
            className="flex-1 items-center rounded-lg border border-neutral-500/30 py-2 active:opacity-60"
            onPress={(e) => {
              e.stopPropagation();
              onShare();
            }}
          >
            <ThemedText className="text-[13px] font-semibold">
              📤 Chia sẻ
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
    </Pressable>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView className="flex-row items-baseline gap-1">
      <ThemedText className="text-[13px] opacity-60">{label}</ThemedText>
      <ThemedText className="text-sm font-semibold">{value}</ThemedText>
    </ThemedView>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function computeDurationFriendly(
  firstTs: string | null,
  lastTs: string | null,
): string {
  if (!firstTs || !lastTs) return '--';
  const diffMs = new Date(lastTs).getTime() - new Date(firstTs).getTime();
  if (diffMs <= 0) return '--';

  const totalSeconds = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);

  if (h > 0) return `${h}h ${m}m`;
  return `${m} phút`;
}
