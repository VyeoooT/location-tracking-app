import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { onSyncStatus, SyncStatus } from '@/lib/sync-events';

const COLORS: Record<SyncStatus, string> = {
  syncing: '#F39C12',
  done: '#27AE60',
  failed: '#E74C3C',
};

const LABELS: Record<SyncStatus, (count?: number) => string> = {
  syncing: (count) =>
    count != null ? `Đang đồng bộ ${count} điểm GPS…` : 'Đang đồng bộ dữ liệu…',
  done: (count) =>
    count != null ? `Đã đồng bộ ${count} điểm GPS` : 'Đã đồng bộ',
  failed: () => 'Đồng bộ thất bại, đã lưu để thử lại sau',
};

export function SyncToast() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [count, setCount] = useState<number>();
  const slideAnim = useMemo(() => new Animated.Value(-50), []);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = onSyncStatus((nextStatus, nextCount) => {
      setStatus(nextStatus);
      setCount(nextCount);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (status == null) return;

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    if (status !== 'syncing') {
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: -50,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setStatus(null);
        });
      }, 2000);
    }

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [status, slideAnim, opacity]);

  if (status == null) return null;

  return (
    <Animated.View
      className="elevation-4 absolute inset-x-4 top-[100px] z-[1000] items-center rounded-xl px-4 py-3 shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
      style={[
        {
          backgroundColor: COLORS[status],
          transform: [{ translateY: slideAnim }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Text className="text-sm font-semibold text-white">
        {LABELS[status](count)}
      </Text>
    </Animated.View>
  );
}
