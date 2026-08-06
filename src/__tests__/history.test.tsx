import { render, waitFor } from '@testing-library/react-native';

import TripHistoryScreen from '@/app/(tabs)/history';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const TRIP_ROWS = [
  {
    id: 'trip-1',
    created_at: '2026-01-01T10:00:00Z',
    name: null,
    is_active: false,
    point_count: 128,
    first_ts: '2026-01-01T10:00:00Z',
    last_ts: '2026-01-01T11:05:00Z',
  },
  {
    id: 'trip-2',
    created_at: '2026-01-02T09:00:00Z',
    name: 'Chuyến đi',
    is_active: true,
    point_count: 3,
    first_ts: '2026-01-02T09:00:00Z',
    last_ts: '2026-01-02T09:01:00Z',
  },
];

function mockSupabase(response: {
  rows?: any[];
  error?: { message: string } | null;
  count?: number;
}) {
  const thenable = (result: any) => ({
    then: (cb: (r: any) => void) => {
      cb(result);
      return undefined;
    },
  });

  const selectResult: any = {
    order: jest.fn(() =>
      thenable({ data: response.rows ?? [], error: response.error ?? null }),
    ),
    single: jest.fn(() => thenable({ data: null, error: null })),
    eq: jest.fn((_col: string, _val: string) => ({
      order: jest.fn(() => ({
        limit: jest.fn(() => ({
          single: jest.fn(() => thenable({ data: null, error: null })),
        })),
      })),
    })),
  };

  mockFrom.mockImplementation((_table: string) => ({
    select: jest.fn((_cols?: string, opts?: any) => {
      if (opts?.count === 'exact' || opts?.head === true) {
        return {
          eq: jest.fn(() =>
            thenable({ data: null, count: response.count ?? 0, error: null }),
          ),
        };
      }
      return selectResult;
    }),
    order: jest.fn(() =>
      thenable({ data: response.rows ?? [], error: response.error ?? null }),
    ),
    eq: jest.fn(),
  }));
}

describe('TripHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase({ rows: TRIP_ROWS });
  });

  it('renders point counts and trip count from a single trip_summaries query', async () => {
    const { getByText } = await render(<TripHistoryScreen />);

    expect(
      await waitFor(() => getByText('2 chuyến đã thực hiện')),
    ).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('1h 5m')).toBeTruthy();
  });

  it('queries trip_summaries exactly once and never queries locations (3N regression guard)', async () => {
    await render(<TripHistoryScreen />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('trip_summaries');
    });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalledWith('locations');
  });

  it('shows the error state when the query fails', async () => {
    mockSupabase({ rows: [], error: { message: 'connection failed' } });

    const { getByText } = await render(<TripHistoryScreen />);

    expect(await waitFor(() => getByText('⚠️ Lỗi tải dữ liệu'))).toBeTruthy();
    expect(getByText('connection failed')).toBeTruthy();
  });

  it('shows the empty state when there are no trips', async () => {
    mockSupabase({ rows: [] });

    const { getByText } = await render(<TripHistoryScreen />);

    expect(
      await waitFor(() => getByText('Chưa có hành trình nào')),
    ).toBeTruthy();
  });
});
