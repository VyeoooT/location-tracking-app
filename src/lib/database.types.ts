export interface Trip {
  id: string;
  created_at: string;
  name: string | null;
  is_active: boolean;
}

export interface Location {
  id: string;
  trip_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  timestamp: string;
}

export interface Database {
  public: {
    Tables: {
      trips: {
        Row: Trip;
        Insert: Omit<Trip, 'id' | 'created_at'>;
        Update: Partial<Omit<Trip, 'id'>>;
      };
      locations: {
        Row: Location;
        Insert: Omit<Location, 'id'>;
        Update: Partial<Omit<Location, 'id'>>;
      };
    };
  };
}
