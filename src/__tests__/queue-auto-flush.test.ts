import { waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { startQueueAutoFlush } from '@/lib/queue-auto-flush';

const netListeners: ((state: unknown) => void)[] = [];
const mockFlushQueue = jest.fn().mockResolvedValue(0);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: () =>
      Promise.resolve({ isConnected: true, isInternetReachable: true }),
    addEventListener: (listener: (state: unknown) => void) => {
      netListeners.push(listener);
      return () => {};
    },
  },
}));

jest.mock('@/lib/location-queue', () => ({
  flushQueue: () => mockFlushQueue(),
}));

describe('startQueueAutoFlush', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netListeners.length = 0;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flushes the queue once on startup when connected', async () => {
    const stop = startQueueAutoFlush();

    await waitFor(() => expect(mockFlushQueue).toHaveBeenCalledTimes(1));
    stop();
  });

  it('flushes when connectivity is restored', () => {
    const stop = startQueueAutoFlush();
    mockFlushQueue.mockClear();

    netListeners[0]({ isConnected: false, isInternetReachable: false });
    expect(mockFlushQueue).not.toHaveBeenCalled();

    netListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(mockFlushQueue).toHaveBeenCalledTimes(1);

    stop();
  });

  it('does not flush again while already connected', () => {
    const stop = startQueueAutoFlush();
    mockFlushQueue.mockClear();

    netListeners[0]({ isConnected: true, isInternetReachable: true });
    netListeners[0]({ isConnected: true, isInternetReachable: true });
    expect(mockFlushQueue).not.toHaveBeenCalled();

    stop();
  });

  it('treats unknown internet reachability as connected', () => {
    const stop = startQueueAutoFlush();
    mockFlushQueue.mockClear();

    netListeners[0]({ isConnected: false, isInternetReachable: false });
    netListeners[0]({ isConnected: true, isInternetReachable: null });
    expect(mockFlushQueue).toHaveBeenCalledTimes(1);

    stop();
  });
});
