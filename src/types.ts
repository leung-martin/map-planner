// Saved data holds only what Google's terms let us keep: place IDs plus the user's own
// words and choices. Names, addresses, coordinates and photos are fetched when shown.

export type City = {
  id: string;
  placeId: string;
  name: string;
};

export type Day = {
  id: string;
  /** One city, or two in travel order for a day like Paris → Rome. */
  cityIds: string[];
  /** ISO date, YYYY-MM-DD. */
  date: string | null;
  colorIndex: number;
};

export type SavedPlace = {
  id: string;
  placeId: string;
  cityId: string;
  dayId: string | null;
  /** Missing on places saved before stars existed. */
  mustHave?: boolean;
  /** Set once by Gemini in the background, and redone only when the rubric version changes. */
  scores?: PlaceScores;
  notes: string;
};

export type PlaceScores = {
  visual: number;
  entertainment: number;
  shopping: number;
  culture: number;
  rubric: number;
};

export type Trip = {
  id: string;
  name: string;
  cities: City[];
  /** Array order is day order. */
  days: Day[];
  places: SavedPlace[];
  updatedAt: number;
};

export type LatLng = { lat: number; lng: number };

export type Bounds = { north: number; south: number; east: number; west: number };
