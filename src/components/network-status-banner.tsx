import type { NetworkStatus } from '@/hooks/use-network-status';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Text } from 'react-native';

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
      className="absolute inset-x-0 top-0 z-[999] items-center px-4 pb-2.5 pt-11"
      style={[
        {
          backgroundColor: config.bg,
          transform: [{ translateY: slideAnim }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Text className="text-sm font-semibold text-white">{config.label}</Text>
    </Animated.View>
  );
}
