import { renderHook } from '@testing-library/react-native';

import { useLocationTracking } from '@/hooks/useLocationTracking';
import { insertWithRetry } from '@/lib/location-queue';

const mockGetCurrentPosition = jest.fn();
const mockStopUpdates = jest.fn();
const mockGetStoredTripId = jest.fn();

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, BestForNavigation: 6 },
  getCurrentPositionAsync: (...args: unknown[]) =>
    mockGetCurrentPosition(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStopUpdates(...args),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  getForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted' }),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/async-storage', () => ({
  getStoredTripId: () => mockGetStoredTripId(),
  removeStoredTripId: jest.fn().mockResolvedValue(undefined),
  removeTripStartTime: jest.fn().mockResolvedValue(undefined),
  setStoredTripId: jest.fn().mockResolvedValue(undefined),
  setTripStartTime: jest.fn().mockResolvedValue(undefined),
  getLastPushedLocation: jest.fn().mockResolvedValue(null),
  setLastPushedLocation: jest.fn().mockResolvedValue(undefined),
  getQueuedLocationCountForTrip: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/lib/location-queue', () => ({
  insertWithRetry: jest.fn().mockResolvedValue(true),
  saveToQueue: jest.fn().mockResolvedValue(undefined),
  flushQueueQuick: jest.fn().mockResolvedValue(undefined),
  flushQueue: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

describe('useLocationTracking.stopTracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStoredTripId.mockResolvedValue('trip-1');
    mockStopUpdates.mockResolvedValue(undefined);
  });

  it('pushes a final location on stop so History duration reflects start→stop', async () => {
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 10.5, longitude: 106.6, speed: 0.2 },
      timestamp: 1_700_000_000_000,
    });

    const { result } = await renderHook(() => useLocationTracking());

    await result.current.stopTracking();

    expect(mockGetCurrentPosition).toHaveBeenCalled();
    expect(insertWithRetry).toHaveBeenCalledWith([
      expect.objectContaining({
        trip_id: 'trip-1',
        lat: 10.5,
        lng: 106.6,
        speed: 0.2,
      }),
    ]);
  });

  it('still returns the tripId when the end-point capture fails', async () => {
    mockGetCurrentPosition.mockRejectedValue(new Error('no gps fix'));

    const { result } = await renderHook(() => useLocationTracking());

    const tripId = await result.current.stopTracking();

    expect(tripId).toBe('trip-1');
    expect(insertWithRetry).not.toHaveBeenCalled();
  });
});
