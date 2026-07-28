import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export interface LocationPoint {
  id: string;
  trip_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  timestamp: string;
}

export interface TripSummary {
  startTime: string;
  endTime: string;
  durationSeconds: number;
  totalDistanceKm: number;
  maxSpeedKmh: number | null;
  totalPoints: number;
}

interface UseTripRealtimeResult {
  locations: LocationPoint[];
  currentLocation: LocationPoint | null;
  isLoading: boolean;
  isActive: boolean;
  tripName: string | null;
  tripSummary: TripSummary | null;
}

// ─── Haversine distance between two lat/lng points (returns km) ──
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeSummary(locations: LocationPoint[]): TripSummary {
  const totalPoints = locations.length;
  const startTime = locations[0].timestamp;
  const endTime = locations[totalPoints - 1].timestamp;
  const durationSeconds =
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000;

  let totalDistanceKm = 0;
  for (let i = 1; i < locations.length; i++) {
    totalDistanceKm += haversineKm(
      locations[i - 1].lat, locations[i - 1].lng,
      locations[i].lat, locations[i].lng,
    );
  }

  let maxSpeedKmh: number | null = null;
  for (const loc of locations) {
    if (loc.speed != null) {
      const kmh = loc.speed * 3.6;
      if (maxSpeedKmh === null || kmh > maxSpeedKmh) {
        maxSpeedKmh = kmh;
      }
    }
  }

  return {
    startTime,
    endTime,
    durationSeconds,
    totalDistanceKm,
    maxSpeedKmh,
    totalPoints,
  };
}

export function useTripRealtime(tripId: string): UseTripRealtimeResult {
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [tripName, setTripName] = useState<string | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helper: re-fetch trip status + locations from DB ──
  const refetchAll = async (cancelled: () => boolean) => {
    const [{ data: freshTrip }, { data: freshLocations }] = await Promise.all([
      supabase
        .from('trips')
        .select('is_active, name')
        .eq('id', tripId)
        .single(),
      supabase
        .from('locations')
        .select('*')
        .eq('trip_id', tripId)
        .order('timestamp', { ascending: true }),
    ]);

    if (cancelled()) return;

    if (freshTrip) {
      setIsActive(freshTrip.is_active);
      setTripName(freshTrip.name);

      // Trip ended → clean up channels & timer, no more idle checks
      if (!freshTrip.is_active) {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        for (const ch of channelsRef.current) {
          supabase.removeChannel(ch);
        }
        channelsRef.current = [];
      }
    }
    if (freshLocations) {
      setLocations(freshLocations as LocationPoint[]);
    }
  };

  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;
    const isCancelled = () => cancelled;

    const run = async () => {
      // 1. Fetch trip status
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('is_active, name')
        .eq('id', tripId)
        .single();

      if (tripError || !tripData) {
        console.error('[useTripRealtime] Trip fetch error:', tripError?.message);
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (cancelled) return;
      setIsActive(tripData.is_active);
      setTripName(tripData.name);

      // 2. Fetch location history
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('trip_id', tripId)
        .order('timestamp', { ascending: true });

      if (locError) {
        console.error('[useTripRealtime] Locations fetch error:', locError.message);
      }

      if (cancelled) return;
      setLocations((locData as LocationPoint[]) ?? []);
      setIsLoading(false);

      // 3. Only subscribe to Realtime if trip is still active
      if (!tripData.is_active) return;

      // ── Idle detection: if no new location for 10s, trip might have stopped ──
      const resetIdleTimer = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          console.log('[useTripRealtime] Idle for 10s — checking trip status...');
          refetchAll(isCancelled);
        }, 10_000);
      };

      // Start idle timer immediately (trip might stop without sending more locations)
      resetIdleTimer();

      // Listen for new locations — each INSERT resets the idle timer
      const locChannel = supabase
        .channel(`locations-${tripId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'locations',
            filter: `trip_id=eq.${tripId}`,
          },
          (payload) => {
            setLocations((prev) => [...prev, payload.new as LocationPoint]);
            resetIdleTimer();
          },
        )
        .subscribe((status) => {
          console.log(`[useTripRealtime] Locations channel: ${status}`);
        });

      channelsRef.current = [locChannel];
    };

    run();

    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const ch of channelsRef.current) {
        supabase.removeChannel(ch);
      }
      channelsRef.current = [];
    };
  }, [tripId]);

  const currentLocation = locations.length > 0 ? locations[locations.length - 1] : null;

  const tripSummary = useMemo(
    () => (locations.length >= 2 ? computeSummary(locations) : null),
    [locations],
  );

  return { locations, currentLocation, isLoading, isActive, tripName, tripSummary };
}
