import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NetworkStatusBanner } from '@/components/network-status-banner';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { flushQueue } from '@/lib/location-queue';

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
