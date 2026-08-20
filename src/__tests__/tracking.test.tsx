import { render, waitFor } from '@testing-library/react-native';

import TrackingScreen from '@/app/tracking';
import { useLocalSearchParams } from 'expo-router';

const mockReplace = jest.fn();
const mockIsTaskRegistered = jest.fn().mockResolvedValue(false);
const mockGetTripStartTime = jest.fn().mockResolvedValue(null);

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-task-manager', () => ({
  isTaskRegisteredAsync: () => mockIsTaskRegistered(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/hooks/useLocationTracking', () => ({
  LOCATION_TRACKING_TASK_NAME: 'LOCATION_TRACKING',
  useLocationTracking: () => ({
    isTracking: false,
    lastLocation: null,
    displayLocation: null,
    locationCount: 0,
    startTracking: jest.fn().mockResolvedValue({ success: true }),
    resumeTracking: jest.fn().mockResolvedValue({ success: true }),
    stopTracking: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock('@/lib/async-storage', () => ({
  getTripStartTime: () => mockGetTripStartTime(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

describe('TrackingScreen tripId validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to home when tripId is missing from params', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});

    await render(<TrackingScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('does not redirect when tripId is present', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ tripId: 'abc-123' });

    await render(<TrackingScreen />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
