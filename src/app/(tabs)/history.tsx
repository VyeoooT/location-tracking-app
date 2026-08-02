import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Share,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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
    setLoading(true);
    setError(null);

    // 1. Fetch trip metadata (không nested select — tránh 1000-row limit)
    const { data: tripsData, error: tripsError } = await supabase
      .from('trips')
      .select('id, created_at, name, is_active')
      .order('created_at', { ascending: false });

    console.log('[History] Trips fetch:', {
      count: tripsData?.length,
      error: tripsError?.message,
    });

    if (tripsError) {
      setError(tripsError.message);
      setLoading(false);
      return;
    }

    if (!tripsData || tripsData.length === 0) {
      setTrips([]);
      setLoading(false);
      return;
    }

    // 2. For each trip, run parallel aggregate queries (count + first/last timestamp)
    //    3 queries per trip, each bypasses 1000-row limit:
    //    - count dùng head:true → không fetch rows
    //    - first/last dùng .limit(1) → luôn chỉ 1 row
    const summaries = await Promise.all(
      tripsData.map(async (trip: any) => {
        const [countResult, firstResult, lastResult] = await Promise.all([
          supabase
            .from('locations')
            .select('id', { count: 'exact', head: true } as any)
            .eq('trip_id', trip.id),
          supabase
            .from('locations')
            .select('timestamp')
            .eq('trip_id', trip.id)
            .order('timestamp', { ascending: true })
            .limit(1)
            .single(),
          supabase
            .from('locations')
            .select('timestamp')
            .eq('trip_id', trip.id)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single(),
        ]);

        return {
          id: trip.id,
          created_at: trip.created_at,
          name: trip.name,
          is_active: trip.is_active,
          point_count: countResult.count ?? 0,
          first_ts: firstResult.data?.timestamp ?? null,
          last_ts: lastResult.data?.timestamp ?? null,
        } satisfies TripSummary;
      }),
    );

    setTrips(summaries);
    setLoading(false);
    console.log(
      '[History] Summaries:',
      summaries.map((s) => ({
        id: s.id,
        point_count: s.point_count,
        first_ts: s.first_ts,
        last_ts: s.last_ts,
        duration: computeDurationFriendly(s.first_ts, s.last_ts),
      })),
    );
  }, []);

  useEffect(() => {
    fetchTrips();
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
    await Share.share({ message: `Theo dõi hành trình của tôi: ${url}`, url });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
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
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#208AEF" />
        <ThemedText style={styles.loadingText}>Đang tải lịch sử…</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.errorText}>⚠️ Lỗi tải dữ liệu</ThemedText>
        <ThemedText style={styles.errorDetail}>{error}</ThemedText>
        <Pressable style={styles.retryButton} onPress={handleRefresh}>
          <ThemedText style={styles.retryText}>Thử lại</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#208AEF']}
              tintColor="#208AEF"
            />
          }
          ListHeaderComponent={
            <ThemedView style={styles.header}>
              <ThemedText type="subtitle">Lịch sử hành trình</ThemedText>
              <ThemedText style={styles.headerSub}>
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
          ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

// ─── Empty State ──────────────────────────────────────────

function EmptyState() {
  return (
    <ThemedView style={styles.emptyContainer}>
      <ThemedText style={styles.emptyEmoji}>🗺️</ThemedText>
      <ThemedText style={styles.emptyTitle}>Chưa có hành trình nào</ThemedText>
      <ThemedText style={styles.emptySub}>
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
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={trip.is_active ? onResume : onOpen}
    >
      <ThemedView type="backgroundElement" style={styles.cardInner}>
        {/* Row 1: date + active badge */}
        <ThemedView style={styles.cardRow}>
          <ThemedView style={styles.dateBlock}>
            <ThemedText style={styles.dateText}>{startDate}</ThemedText>
            <ThemedText style={styles.timeText}>{startTime}</ThemedText>
          </ThemedView>
          {trip.is_active && (
            <ThemedView style={styles.activeBadge}>
              <ThemedText style={styles.activeBadgeText}>
                ● Đang chạy
              </ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        {/* Row 2: stats */}
        <ThemedView style={styles.statsRow}>
          <StatItem label="⏱ Thời lượng" value={duration} />
          <StatItem label="📍 Điểm GPS" value={`${trip.point_count}`} />
        </ThemedView>

        {/* Row 3: actions */}
        <ThemedView style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              trip.is_active ? onResume() : onOpen();
            }}
          >
            <ThemedText style={styles.actionBtnText}>
              {trip.is_active ? '📡 Tiếp tục theo dõi' : '🌐 Xem trên bản đồ'}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onShare();
            }}
          >
            <ThemedText style={styles.actionBtnText}>📤 Chia sẻ</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
    </Pressable>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView style={styles.statItem}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
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

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  headerSub: {
    opacity: 0.6,
    fontSize: 14,
  },
  separator: {
    height: Spacing.two,
  },

  // Card
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardInner: {
    padding: Spacing.four,
    gap: Spacing.three,
    borderRadius: Spacing.three,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateBlock: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'baseline',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 14,
    opacity: 0.6,
  },
  activeBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  statItem: {
    flexDirection: 'row',
    gap: Spacing.one,
    alignItems: 'baseline',
  },
  statLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    alignItems: 'center',
  },
  actionBtnPressed: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Loading / Error
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  loadingText: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorDetail: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  retryButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
    gap: Spacing.three,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
  },
});
