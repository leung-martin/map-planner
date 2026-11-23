import type { ComponentType, ReactNode } from 'react';
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
  /** The city it's in, such as "Tokyo" for any of Tokyo's wards. */
  city: string;
  types: string[];
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
  /** Drawn with a house instead of the label. */
  home?: boolean;
};

export type MapViewProps = {
  pins: MapPin[];
  /** When this changes the map reframes to the pins, or to `fallback` if there are none. */
  fitKey: string;
  fallback: Bounds | null;
  /** Frames just these pins when any of them are on the map, instead of all of them. */
  fitIds?: string[];
  /** A card shown attached to a point on the map. */
  popout: { location: LatLng; content: ReactNode } | null;
  onPinClick(id: string): void;
  /** A place on the base map was tapped. */
  onPoiClick(placeId: string): void;
  /** Reports the area currently showing, whenever the map settles. */
  onViewChange(area: Bounds): void;
};

export interface MapsProvider {
  readonly demo: boolean;
  readonly MapView: ComponentType<MapViewProps>;
  searchCities(query: string): Promise<Suggestion[]>;
  searchPlaces(query: string, near: Bounds | null): Promise<Suggestion[]>;
  /** Finds the place ID for a named pin, looking only inside `within` when it's given. */
  matchPlace(name: string, near: LatLng, within?: Bounds): Promise<string | null>;
  /** Finds the place ID for a name anywhere, preferring results near `near`. */
  findPlace(query: string, near: LatLng | null): Promise<string | null>;
  getPlace(placeId: string): Promise<PlaceDetails>;
  getCityBounds(placeId: string): Promise<Bounds | null>;
}
