import { useEffect, useRef, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';

export type NetworkStatus =
  'connected' | 'connecting' | 'disconnected' | 'unknown';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const RETRY_INTERVAL_MS = 8000;

async function pingSupabase(): Promise<boolean> {
  if (!SUPABASE_URL) return true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
  const netInfo = useNetInfo();
  const raw = derive(netInfo);

  const [status, setStatus] = useState<NetworkStatus>('unknown');
  const rawRef = useRef(raw);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    rawRef.current = raw;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      if (cancelled || !mountedRef.current || pendingRef.current) return;
      pendingRef.current = true;
      setStatus('connecting');

      pingSupabase().then((reachable) => {
        if (cancelled || !mountedRef.current) return;
        pendingRef.current = false;
        if (reachable) {
          setStatus('connected');
        } else {
          setStatus('disconnected');
          if (rawRef.current !== 'disconnected' && !cancelled) {
            retryTimer = setTimeout(check, RETRY_INTERVAL_MS);
          }
        }
      });
    };

    if (raw === 'disconnected') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('disconnected');
      return () => {
        cancelled = true;
      };
    }

    if (raw === 'connecting') {
      setStatus('connecting');
      return () => {
        cancelled = true;
      };
    }

    check();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [raw]);

  return { status };
}

function derive(net: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null | undefined;
}): NetworkStatus {
  if (net.isConnected === false) return 'disconnected';
  if (net.isConnected === true && net.isInternetReachable === true)
    return 'connected';
  if (net.isConnected === true && net.isInternetReachable === false)
    return 'disconnected';
  return 'connecting';
}
