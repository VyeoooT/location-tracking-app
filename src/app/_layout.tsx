import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { NetworkStatusBanner } from '@/components/network-status-banner';
import { useNetworkStatus } from '@/hooks/use-network-status';
// Import side-effect: đăng ký TaskManager task ở app root để task vẫn tồn tại
// khi JS context khởi động headless (app bị kill nhưng foreground service chạy).
import '@/lib/location-background-task';
import { startQueueAutoFlush } from '@/lib/queue-auto-flush';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { status } = useNetworkStatus();

  // Flush queue ngay khi có mạng trở lại, kể cả khi app đang ở nền và người
  // dùng không mở lại app.
  useEffect(() => startQueueAutoFlush(), []);

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
