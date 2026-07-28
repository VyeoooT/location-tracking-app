import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRIP_ID_KEY = '@location_tracker/trip_id';
export const TRIP_START_TIME_KEY = '@location_tracker/trip_start_time';

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
