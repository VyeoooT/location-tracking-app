import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRIP_ID_KEY = '@location_tracker/trip_id';

export async function getStoredTripId(): Promise<string | null> {
  return AsyncStorage.getItem(TRIP_ID_KEY);
}

export async function setStoredTripId(tripId: string): Promise<void> {
  await AsyncStorage.setItem(TRIP_ID_KEY, tripId);
}

export async function removeStoredTripId(): Promise<void> {
  await AsyncStorage.removeItem(TRIP_ID_KEY);
}
