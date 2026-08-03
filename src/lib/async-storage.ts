import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRIP_ID_KEY = '@location_tracker/trip_id';
export const TRIP_START_TIME_KEY = '@location_tracker/trip_start_time';
export const LOCATION_QUEUE_KEY = '@location_tracker/location_queue';
export const LAST_PUSHED_KEY = '@location_tracker/last_pushed';

const MAX_QUEUE_ITEMS = 2000;

export interface QueuedLocation {
  trip_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  timestamp: string;
}

export interface LastPushedLocation {
  lat: number;
  lng: number;
}

// Serialize queue read-modify-write operations so concurrent callers
// (foreground + background task) can't lose updates to the same key.
let queueLock: Promise<void> = Promise.resolve();

function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueLock.then(fn, fn);
  queueLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getStoredTripId(): Promise<string | null> {
  return AsyncStorage.getItem(TRIP_ID_KEY);
}

export async function setStoredTripId(tripId: string): Promise<void> {
  await AsyncStorage.setItem(TRIP_ID_KEY, tripId);
}

export async function removeStoredTripId(): Promise<void> {
  await AsyncStorage.removeItem(TRIP_ID_KEY);
}

export async function setTripStartTime(startTime: number): Promise<void> {
  await AsyncStorage.setItem(TRIP_START_TIME_KEY, String(startTime));
}

export async function getTripStartTime(): Promise<number | null> {
  const val = await AsyncStorage.getItem(TRIP_START_TIME_KEY);
  return val != null ? Number(val) : null;
}

export async function removeTripStartTime(): Promise<void> {
  await AsyncStorage.removeItem(TRIP_START_TIME_KEY);
}

export async function getQueuedLocations(): Promise<QueuedLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
    return raw != null ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function enqueueLocations(rows: QueuedLocation[]): Promise<void> {
  await withQueueLock(async () => {
    const current = await getQueuedLocations();
    const merged = [...current, ...rows];
    if (merged.length > MAX_QUEUE_ITEMS) {
      merged.splice(0, merged.length - MAX_QUEUE_ITEMS);
    }
    await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(merged));
  });
}

/** Atomically read and remove all queued locations. */
export async function dequeueLocations(): Promise<QueuedLocation[]> {
  return withQueueLock(async () => {
    const current = await getQueuedLocations();
    if (current.length === 0) return [];
    await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
    return current;
  });
}

export async function clearQueuedLocations(): Promise<void> {
  await withQueueLock(async () => {
    await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
  });
}

export async function getQueueSize(): Promise<number> {
  const items = await getQueuedLocations();
  return items.length;
}

export async function getQueuedLocationCountForTrip(
  tripId: string,
): Promise<number> {
  const items = await getQueuedLocations();
  return items.filter((l) => l.trip_id === tripId).length;
}

export async function getLastPushedLocation(): Promise<LastPushedLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_PUSHED_KEY);
    return raw != null ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setLastPushedLocation(
  loc: LastPushedLocation,
): Promise<void> {
  await AsyncStorage.setItem(LAST_PUSHED_KEY, JSON.stringify(loc));
}
