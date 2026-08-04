import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import HomeScreen from '@/app/(tabs)/index';

const mockReplace = jest.fn();
const mockHasStartedLocationUpdates = jest.fn();
const mockGetStoredTripId = jest.fn();
const mockTripCountThen = jest.fn();
const mockInsertSingle = jest.fn();
const mockUseFocusEffect = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) =>
    mockUseFocusEffect(callback),
}));

jest.mock('expo-location', () => ({
  hasStartedLocationUpdatesAsync: () => mockHasStartedLocationUpdates(),
}));

jest.mock('@/hooks/useLocationTracking', () => ({
  LOCATION_TRACKING_TASK_NAME: 'LOCATION_TRACKING',
}));

jest.mock('@/lib/async-storage', () => ({
  getStoredTripId: () => mockGetStoredTripId(),
}));

jest.mock('@/lib/supabase', () => {
  const chain: any = {
    select: jest.fn(() => ({ then: mockTripCountThen })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({ single: mockInsertSingle })),
    })),
    eq: jest.fn(() => chain),
    update: jest.fn(() => chain),
  };
  return {
    supabase: {
      from: jest.fn(() => chain),
    },
  };
});

describe('HomeScreen handleStartTrip error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFocusEffect.mockImplementation(
      (callback: () => void | (() => void)) => {
        useEffect(callback, [callback]);
      },
    );
    mockTripCountThen.mockImplementation(
      (cb: (r: { count: number }) => void) => {
        cb({ count: 3 });
        return undefined;
      },
    );
    mockHasStartedLocationUpdates.mockResolvedValue(false);
    mockGetStoredTripId.mockResolvedValue(null);
  });

  it('shows an Alert when trip insert fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockInsertSingle.mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    });

    const { getByText } = await render(<HomeScreen />);

    const startButton = await waitFor(() => getByText('🚀 Bắt đầu hành trình'));
    await fireEvent.press(startButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to tracking screen when trip insert succeeds', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockInsertSingle.mockResolvedValue({
      data: { id: 'trip-1', is_active: true },
      error: null,
    });

    const { getByText } = await render(<HomeScreen />);

    const startButton = await waitFor(() => getByText('🚀 Bắt đầu hành trình'));
    await fireEvent.press(startButton);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tracking?tripId=trip-1');
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
