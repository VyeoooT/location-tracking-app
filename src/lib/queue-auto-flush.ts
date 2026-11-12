import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { flushQueue } from './location-queue';

let started = false;
let wasConnected: boolean | null = null;

function isConnected(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null | undefined;
}): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Chỉ flush khi OS báo đang có mạng, tránh giữ flush lock vô ích khi offline. */
function flushIfConnected(): void {
  NetInfo.fetch()
    .then((state) => {
      if (isConnected(state)) void flushQueue().catch(() => {});
    })
    .catch(() => {});
}

/**
 * Đồng bộ queue ngay khi thiết bị có mạng trở lại — không cần mở lại app.
 *
 * Trước đây việc flush chỉ xảy ra khi:
 *  - app quay lại foreground, hoặc
 *  - background task nhận được một batch GPS mới.
 * Nếu người dùng đứng yên và app đang ở nền thì queue sẽ nằm im. Listener
 * NetInfo dưới đây chạy độc lập với màn hình/route nên chỉ cần OS báo có mạng
 * là dữ liệu được đẩy lên.
 */
export function startQueueAutoFlush(): () => void {
  if (started) return () => {};
  started = true;

  // Flush phần queue còn sót lại từ phiên trước (nếu có).
  flushIfConnected();

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const connected = isConnected(state);
    const reconnected = connected && wasConnected === false;
    wasConnected = connected;

    if (reconnected) {
      void flushQueue().catch(() => {});
    }
  });

  // Fallback cho một số thiết bị/OEM không gửi NetInfo event khi ở nền:
  // flush lại khi app trở về foreground (idempotent, queue rỗng thì no-op).
  const appStateSubscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      flushIfConnected();
    }
  });

  return () => {
    unsubscribeNetInfo();
    appStateSubscription.remove();
    started = false;
    wasConnected = null;
  };
}
