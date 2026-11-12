import { renderHook } from '@testing-library/react-native';

import { useLocationTracking } from '@/hooks/useLocationTracking';
import { insertWithRetry, saveToQueue } from '@/lib/location-queue';

const mockGetCurrentPosition = jest.fn();
const mockStopUpdates = jest.fn();
const mockGetStoredTripId = jest.fn();
const mockWatchPosition = jest.fn();
const mockStartUpdates = jest.fn();
const mockHasServicesEnabled = jest.fn();
const mockEnableNetworkProvider = jest.fn();
const mockRequestForeground = jest.fn();
const mockRequestBackground = jest.fn();
const mockRemoveStoredTripId = jest.fn();

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, BestForNavigation: 6 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
  getCurrentPositionAsync: (...args: unknown[]) =>
    mockGetCurrentPosition(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStopUpdates(...args),
  watchPositionAsync: (...args: unknown[]) => mockWatchPosition(...args),
  startLocationUpdatesAsync: (...args: unknown[]) => mockStartUpdates(...args),
  hasServicesEnabledAsync: (...args: unknown[]) =>
    mockHasServicesEnabled(...args),
  enableNetworkProviderAsync: (...args: unknown[]) =>
    mockEnableNetworkProvider(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForeground(...args),
  requestBackgroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestBackground(...args),
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
  removeStoredTripId: (...args: unknown[]) => mockRemoveStoredTripId(...args),
  removeTripStartTime: jest.fn().mockResolvedValue(undefined),
  setStoredTripId: jest.fn().mockResolvedValue(undefined),
  setTripStartTime: jest.fn().mockResolvedValue(undefined),
  getLastPushedLocation: jest.fn().mockResolvedValue(null),
  setLastPushedLocation: jest.fn().mockResolvedValue(undefined),
  removeLastPushedLocation: jest.fn().mockResolvedValue(undefined),
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

describe('useLocationTracking.startTracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestForeground.mockResolvedValue({ status: 'granted' });
    mockRequestBackground.mockResolvedValue({ status: 'granted' });
    mockHasServicesEnabled.mockResolvedValue(true);
    mockEnableNetworkProvider.mockResolvedValue(undefined);
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 10.5, longitude: 106.6, speed: 0.2 },
      timestamp: 1_700_000_000_000,
    });
    mockWatchPosition.mockResolvedValue({ remove: jest.fn() });
    mockStartUpdates.mockResolvedValue(undefined);
    mockStopUpdates.mockResolvedValue(undefined);
  });

  it('returns location_unavailable without storing the trip when GPS is off', async () => {
    mockHasServicesEnabled.mockResolvedValue(false);

    const { result } = await renderHook(() => useLocationTracking());

    const startResult = await result.current.startTracking('trip-1');

    expect(mockEnableNetworkProvider).toHaveBeenCalledTimes(1);
    expect(startResult).toEqual({
      success: false,
      reason: 'location_unavailable',
    });
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it('asks the user to enable GPS and continues when they do', async () => {
    // Lần kiểm tra đầu: GPS tắt; sau dialog hệ thống: đã bật.
    mockHasServicesEnabled
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { result } = await renderHook(() => useLocationTracking());

    const startResult = await result.current.startTracking('trip-1');

    expect(mockEnableNetworkProvider).toHaveBeenCalledTimes(1);
    expect(startResult).toEqual({ success: true });
    expect(mockWatchPosition).toHaveBeenCalled();
  });

  it('starts tracking even when the initial GPS fix fails', async () => {
    mockGetCurrentPosition.mockRejectedValue(
      new Error(
        'Current location is unavailable. Make sure that location services are enabled',
      ),
    );

    const { result } = await renderHook(() => useLocationTracking());

    const startResult = await result.current.startTracking('trip-1');

    expect(startResult).toEqual({ success: true });
    expect(mockWatchPosition).toHaveBeenCalled();
    expect(mockStartUpdates).toHaveBeenCalled();
  });

  it('rolls back stored trip state when location updates cannot start', async () => {
    mockWatchPosition.mockRejectedValue(new Error('watch failed'));

    const { result } = await renderHook(() => useLocationTracking());

    const startResult = await result.current.startTracking('trip-1');

    expect(startResult).toEqual({ success: false, reason: 'start_failed' });
    expect(mockRemoveStoredTripId).toHaveBeenCalled();
    expect(mockStartUpdates).not.toHaveBeenCalled();
  });
});

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

  it('queues the final location when the insert fails', async () => {
    (insertWithRetry as jest.Mock).mockResolvedValueOnce(false);
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 10.5, longitude: 106.6, speed: 0.2 },
      timestamp: 1_700_000_000_000,
    });

    const { result } = await renderHook(() => useLocationTracking());

    await result.current.stopTracking();

    expect(saveToQueue).toHaveBeenCalledWith([
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
