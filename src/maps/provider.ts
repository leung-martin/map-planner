import type { ComponentType } from 'react';
import type { Bounds, LatLng } from '../types';

export type PlacePhoto = {
  url(maxWidth: number): string;
  width: number;
  height: number;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  shortLocation: string;
  location: LatLng;
  photo: PlacePhoto | null;
};

export type Suggestion = {
  placeId: string;
  main: string;
  secondary: string;
  /** Fetches details as the end of the search session, so typing stays free. */
  resolve(): Promise<PlaceDetails>;
};

export type MapPin = {
  id: string;
  placeId: string;
  location: LatLng;
  color: string;
  label: string;
  title: string;
  selected: boolean;
};

export type MapViewProps = {
  pins: MapPin[];
  /** When this changes the map reframes to the pins, or to `fallback` if there are none. */
  fitKey: string;
  fallback: Bounds | null;
  onPinClick(id: string): void;
  /** A place on the base map was tapped. */
  onPoiClick(placeId: string): void;
};

export interface MapsProvider {
  readonly demo: boolean;
  readonly MapView: ComponentType<MapViewProps>;
  searchCities(query: string): Promise<Suggestion[]>;
  searchPlaces(query: string, near: Bounds | null): Promise<Suggestion[]>;
  /** Finds the place ID for a named pin. */
  matchPlace(name: string, near: LatLng): Promise<string | null>;
  getPlace(placeId: string): Promise<PlaceDetails>;
  getCityBounds(placeId: string): Promise<Bounds | null>;
}
