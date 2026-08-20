import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { NetworkStatusBanner } from '@/components/network-status-banner';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { flushQueue } from '@/lib/location-queue';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { status } = useNetworkStatus();
  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current !== 'connected' && status === 'connected') {
      flushQueue().then((count) => {
        if (count > 0) {
          console.log(
            `[Network] Flushed ${count} queued locations after reconnect`,
          );
        }
      });
    }
    prevStatus.current = status;
  }, [status]);

  return (
    <>
      <NetworkStatusBanner status={status} />
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="tracking"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
