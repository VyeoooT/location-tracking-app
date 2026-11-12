import { QueuedLocation } from '@/lib/async-storage';
import { flushQueue, flushQueueQuick } from '@/lib/location-queue';

const mockGetQueuedLocations = jest.fn();
const mockRemoveQueuedLocations = jest.fn();
const mockEnqueueLocations = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/async-storage', () => ({
  getQueuedLocations: () => mockGetQueuedLocations(),
  removeQueuedLocations: (rows: unknown) => mockRemoveQueuedLocations(rows),
  enqueueLocations: (rows: unknown) => mockEnqueueLocations(rows),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const queued: QueuedLocation[] = [
  {
    trip_id: 'trip-1',
    lat: 10.5,
    lng: 106.6,
    speed: 1.2,
    timestamp: '2026-01-01T00:00:00.000Z',
  },
];

const mockUpsert = jest.fn();

function mockInsertResult(result: { error: { message: string } | null }) {
  mockFrom.mockReturnValue({
    upsert: (...args: unknown[]) => {
      mockUpsert(...args);
      return {
        abortSignal: () => Promise.resolve(result),
      };
    },
  });
}

describe('flushQueue durability', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetQueuedLocations.mockResolvedValue(queued);
    mockInsertResult({ error: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('removes queued rows only after a successful insert', async () => {
    const count = await flushQueue();

    expect(count).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith(queued, {
      onConflict: 'trip_id,timestamp',
      ignoreDuplicates: true,
    });
    expect(mockRemoveQueuedLocations).toHaveBeenCalledWith(queued);
  });

  it('keeps the queue intact when the insert fails', async () => {
    mockInsertResult({ error: { message: 'offline' } });

    const pending = flushQueue();
    await jest.runAllTimersAsync();
    const count = await pending;

    expect(count).toBe(0);
    expect(mockRemoveQueuedLocations).not.toHaveBeenCalled();
    expect(mockEnqueueLocations).not.toHaveBeenCalled();
  });

  it('does not remove queued rows when a quick flush fails', async () => {
    mockInsertResult({ error: { message: 'offline' } });

    const ok = await flushQueueQuick();

    expect(ok).toBe(false);
    expect(mockRemoveQueuedLocations).not.toHaveBeenCalled();
    expect(mockEnqueueLocations).not.toHaveBeenCalled();
  });

  it('removes queued rows after a successful quick flush', async () => {
    const ok = await flushQueueQuick();

    expect(ok).toBe(true);
    expect(mockRemoveQueuedLocations).toHaveBeenCalledWith(queued);
  });
});
