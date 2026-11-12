import {
  enqueueLocations,
  getQueuedLocations,
  LOCATION_QUEUE_KEY,
  QueuedLocation,
  removeQueuedLocations,
} from '@/lib/async-storage';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      Promise.resolve(mockStore.get(key) ?? null),
    ),
    setItem: jest.fn((key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    }),
  },
}));

function location(overrides: Partial<QueuedLocation> = {}): QueuedLocation {
  return {
    trip_id: 'trip-1',
    lat: 10.5,
    lng: 106.6,
    speed: 1.2,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('offline queue durability', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('keeps queued rows until they are explicitly removed', async () => {
    await enqueueLocations([
      location(),
      location({ timestamp: '2026-01-01T00:01:00.000Z' }),
    ]);

    expect(await getQueuedLocations()).toHaveLength(2);
  });

  it('removes only the rows that were successfully flushed', async () => {
    const first = location();
    const second = location({ timestamp: '2026-01-01T00:01:00.000Z' });
    await enqueueLocations([first, second]);

    await removeQueuedLocations([first]);

    const remaining = await getQueuedLocations();
    expect(remaining).toEqual([second]);
  });

  it('keeps rows enqueued while a flush is in flight', async () => {
    const flushed = location();
    const addedDuringFlush = location({
      timestamp: '2026-01-01T00:02:00.000Z',
    });
    await enqueueLocations([flushed]);

    // Simulate a new GPS point being queued while the network request runs.
    await enqueueLocations([addedDuringFlush]);
    await removeQueuedLocations([flushed]);

    expect(await getQueuedLocations()).toEqual([addedDuringFlush]);
  });

  it('deletes the storage key once every row has been flushed', async () => {
    const row = location();
    await enqueueLocations([row]);

    await removeQueuedLocations([row]);

    expect(mockStore.has(LOCATION_QUEUE_KEY)).toBe(false);
    expect(await getQueuedLocations()).toEqual([]);
  });
});
