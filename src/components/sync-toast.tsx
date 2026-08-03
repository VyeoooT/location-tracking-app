import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
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
      style={[
        styles.banner,
        { backgroundColor: COLORS[status] },
        { transform: [{ translateY: slideAnim }], opacity },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{LABELS[status](count)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    zIndex: 1000,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
