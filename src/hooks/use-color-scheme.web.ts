import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const emptySubscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the
 * client side for web. useSyncExternalStore returns 'light' during SSR to
 * avoid hydration mismatch, then the real scheme on the client.
 */
export function useColorScheme() {
  return useSyncExternalStore(emptySubscribe, useRNColorScheme, () => 'light');
}
