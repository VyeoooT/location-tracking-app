import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface LocationPoint {
  id: string;
  trip_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  timestamp: string;
}

interface UseTripRealtimeResult {
  locations: LocationPoint[];
  currentLocation: LocationPoint | null;
  isLoading: boolean;
}

export function useTripRealtime(tripId: string): UseTripRealtimeResult {
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;

    // Fetch initial history
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('trip_id', tripId)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('[useTripRealtime] Fetch error:', error.message);
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (!cancelled) {
        setLocations(data as LocationPoint[]);
        setIsLoading(false);
      }
    };

    fetchHistory();

    // Subscribe to realtime INSERT events
    const channel = supabase
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
          const newLoc = payload.new as LocationPoint;
          setLocations((prev) => [...prev, newLoc]);
        },
      )
      .subscribe((status) => {
        console.log(`[useTripRealtime] Channel status: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  const currentLocation = locations.length > 0 ? locations[locations.length - 1] : null;

  return { locations, currentLocation, isLoading };
}
