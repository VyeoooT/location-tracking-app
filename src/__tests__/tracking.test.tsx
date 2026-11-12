import { render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import TrackingScreen from '@/app/tracking';
import { useLocalSearchParams } from 'expo-router';

const mockReplace = jest.fn();
const mockIsTaskRegistered = jest.fn().mockResolvedValue(false);
const mockGetTripStartTime = jest.fn().mockResolvedValue(null);
const mockStartTracking = jest.fn();
const mockResumeTracking = jest.fn();
const mockStopTracking = jest.fn();

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
    startTracking: (...args: unknown[]) => mockStartTracking(...args),
    resumeTracking: (...args: unknown[]) => mockResumeTracking(...args),
    stopTracking: (...args: unknown[]) => mockStopTracking(...args),
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
    mockIsTaskRegistered.mockResolvedValue(false);
    mockGetTripStartTime.mockResolvedValue(null);
    mockStartTracking.mockResolvedValue({ success: true });
    mockResumeTracking.mockResolvedValue({ success: true });
    mockStopTracking.mockResolvedValue(null);
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

  it('offers to enable GPS and returns home when tracking cannot start', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ tripId: 'abc-123' });
    mockStartTracking.mockResolvedValue({
      success: false,
      reason: 'location_unavailable',
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<TrackingScreen />);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('GPS đang tắt');
    expect(message).toContain('GPS');

    const buttonList = buttons as
      { text?: string; onPress?: () => void }[] | undefined;
    expect(buttonList?.map((button) => button.text)).toEqual([
      'Huỷ',
      'Bật GPS',
    ]);

    // Huỷ → đánh dấu trip inactive và về trang chủ
    buttonList?.[0]?.onPress?.();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');

    alertSpy.mockRestore();
  });

  it('retries starting tracking when the user taps "Bật GPS"', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ tripId: 'abc-123' });
    mockStartTracking.mockResolvedValue({
      success: false,
      reason: 'location_unavailable',
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<TrackingScreen />);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockStartTracking).toHaveBeenCalledTimes(1);

    const buttons = alertSpy.mock.calls[0][2] as
      { text?: string; onPress?: () => void }[] | undefined;
    buttons?.[1]?.onPress?.();

    await waitFor(() => expect(mockStartTracking).toHaveBeenCalledTimes(2));

    alertSpy.mockRestore();
  });

  it('shows an alert when tracking startup throws unexpectedly', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ tripId: 'abc-123' });
    mockStartTracking.mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<TrackingScreen />);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    const [title] = alertSpy.mock.calls[0];
    expect(title).toBe('Không thể bắt đầu theo dõi');

    alertSpy.mockRestore();
  });
});
