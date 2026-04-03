export interface LatLng {
  lat: number;
  lng: number;
}

export interface Stop {
  id: string;
  label: string;
  address?: string;
  position: LatLng;
  /** Direct Google Maps URL for this coordinate (no API key). */
  googleMapsUrl?: string;
  orderId?: string;
  notes?: string;
  status: 'pending' | 'arrived' | 'delivered' | 'skipped';
  eta?: string;
  arrivedAt?: string;
  deliveredAt?: string;
  distanceFromPrevKm?: number;
  durationFromPrevMin?: number;
}

export interface RunRecord {
  runId: string;
  createdAt: string;
  depot: Stop;
  stops: Stop[];
  polyline: string;
  totalDistanceKm: number;
  totalDurationMin: number;
  /** Same visit order as `stops`; opens turn-by-turn directions in Google Maps (no API key). */
  directionsUrl?: string;
  status: 'active' | 'completed' | 'archived';
  driverName?: string;
  driverPhone?: string;
  vehicleType?: 'bike' | 'car' | 'van';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface CreateRunRequest {
  runId?: string;
  depot: {
    label: string;
    lat?: number;
    lng?: number;
    address?: string;
  };
  stops: Array<{
    id: string;
    label: string;
    address?: string;
    lat?: number;
    lng?: number;
    orderId?: string;
    notes?: string;
  }>;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: 'bike' | 'car' | 'van';
}

export interface OsrmTripResponse {
  waypoints: Array<{
    waypoint_index: number;
    trips_index: number;
    distance: number;
    name: string;
    location: [number, number];
  }>;
  trips: Array<{
    geometry: string;
    legs: Array<{
      distance: number;
      duration: number;
      steps: unknown[];
    }>;
    distance: number;
    duration: number;
    weight: number;
    weight_name: string;
  }>;
  code: string;
}

export interface OsrmRouteResponse {
  waypoints: Array<{
    distance: number;
    name: string;
    location: [number, number];
  }>;
  routes: Array<{
    geometry: string;
    legs: Array<{
      distance: number;
      duration: number;
      steps: unknown[];
    }>;
    distance: number;
    duration: number;
    weight: number;
    weight_name: string;
  }>;
  code: string;
}

export interface TripOptimizationResult {
  waypoints: number[];
  polyline: string;
  distances: number[];
  durations: number[];
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
  /** Nominatim importance; higher is typically a better global match. */
  importance?: number;
}

export type GeocodeMatchConfidence = 'high' | 'medium' | 'low';

export interface GeocodeBestMatch extends LatLng {
  displayName?: string;
  confidence: GeocodeMatchConfidence;
}

export interface GeocodeLookupResult {
  bestMatch: GeocodeBestMatch | null;
  suggestions: GeocodeResult[];
}

export interface ProximityAlert {
  stopIndex: number;
  stop: Stop;
  distance: number;
  type: 'approaching' | 'arrived' | 'completed';
}
