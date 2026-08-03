import type { NetworkStatus } from '@/hooks/use-network-status';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

const BANNER_CONFIG: Record<
  Exclude<NetworkStatus, 'unknown'>,
  { label: string; bg: string }
> = {
  disconnected: { label: 'Mất kết nối', bg: '#E74C3C' },
  connecting: { label: 'Đang kết nối…', bg: '#F39C12' },
  connected: { label: 'Đã kết nối', bg: '#27AE60' },
};

interface Props {
  status: NetworkStatus;
}

export function NetworkStatusBanner({ status }: Props) {
  const slideAnim = useMemo(() => new Animated.Value(-50), []);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    const show = () => {
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
    };

    const hide = () => {
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
      ]).start();
    };

    if (status === 'unknown') {
      slideAnim.setValue(-50);
      opacity.setValue(0);
      return;
    }

    show();

    if (status === 'connected') {
      hideTimer.current = setTimeout(hide, 2500);
    }

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [status, slideAnim, opacity]);

  if (status === 'unknown') return null;

  const config = BANNER_CONFIG[status];

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: config.bg },
        {
          transform: [{ translateY: slideAnim }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{config.label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
