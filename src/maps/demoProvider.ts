import { RUBRIC_VERSION, type PlaceToScore } from '../scoring';
import { isInside, type PlaceIdea } from '../suggest';
import type { Bounds, PlaceScores } from '../types';
import { DemoMapView } from './DemoMapView';
import type { MapsProvider, PlaceDetails, Suggestion } from './provider';

// Sample data so the app can be tried before a Google Maps key exists.
type Row = [id: string, name: string, area: string, city: string, lat: number, lng: number];

const CITIES: Record<string, { name: string; country: string; bounds: Bounds }> = {
  'demo:paris': { name: 'Paris', country: 'France', bounds: { north: 48.91, south: 48.82, east: 2.42, west: 2.25 } },
  'demo:rome': { name: 'Rome', country: 'Italy', bounds: { north: 41.95, south: 41.85, east: 12.55, west: 12.42 } },
  'demo:tokyo': { name: 'Tokyo', country: 'Japan', bounds: { north: 35.74, south: 35.62, east: 139.81, west: 139.66 } },
};

export const DEMO_PLACES: Row[] = [
  ['demo:eiffel', 'Eiffel Tower', 'Gros-Caillou', 'demo:paris', 48.8584, 2.2945],
  ['demo:louvre', 'Louvre Museum', '1st arrondissement', 'demo:paris', 48.8606, 2.3376],
  ['demo:notre', 'Notre-Dame', 'Île de la Cité', 'demo:paris', 48.853, 2.3499],
  ['demo:orsay', 'Musée d’Orsay', '7th arrondissement', 'demo:paris', 48.86, 2.3266],
  ['demo:sacre', 'Sacré-Cœur', 'Montmartre', 'demo:paris', 48.8867, 2.3431],
  ['demo:marais', 'Place des Vosges', 'Le Marais', 'demo:paris', 48.8556, 2.3655],
  ['demo:colosseum', 'Colosseum', 'Celio', 'demo:rome', 41.8902, 12.4922],
  ['demo:pantheon', 'Pantheon', 'Pigna', 'demo:rome', 41.8986, 12.4769],
  ['demo:trevi', 'Trevi Fountain', 'Trevi', 'demo:rome', 41.9009, 12.4833],
  ['demo:vatican', 'St. Peter’s Basilica', 'Vatican City', 'demo:rome', 41.9022, 12.4539],
  ['demo:trastevere', 'Piazza Santa Maria', 'Trastevere', 'demo:rome', 41.8894, 12.4698],
  ['demo:sensoji', 'Sensō-ji', 'Asakusa', 'demo:tokyo', 35.7148, 139.7967],
  ['demo:shibuya', 'Shibuya Crossing', 'Shibuya', 'demo:tokyo', 35.6595, 139.7005],
  ['demo:meiji', 'Meiji Shrine', 'Yoyogi', 'demo:tokyo', 35.6764, 139.6993],
];

function details([placeId, name, area, city, lat, lng]: Row): PlaceDetails {
  return {
    placeId,
    name,
    shortLocation: `${area}, ${CITIES[city].name}`,
    location: { lat, lng },
    photo: {
      url: () =>
        `data:image/svg+xml,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300"><rect width="640" height="300" fill="#d9d2c3"/><text x="320" y="158" font-family="sans-serif" font-size="26" fill="#5b5346" text-anchor="middle">Photo of ${name}</text></svg>`,
        )}`,
      width: 640,
      height: 300,
    },
  };
}

const matches = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

export async function demoSuggest(_trip: string, _interests: string, area: Bounds): Promise<PlaceIdea[]> {
  return DEMO_PLACES.filter(([, , , , lat, lng]) => isInside({ lat, lng }, area)).map((row) => ({ name: row[1], why: 'A sample idea for the demo.' }));
}

/** Made-up but repeatable scores, so the demo needs no Gemini. */
export async function demoScore({ name }: PlaceToScore): Promise<PlaceScores> {
  const digit = (seed: number) => [...name].reduce((sum, char) => (sum * seed + char.charCodeAt(0)) % 997, seed) % 6;
  return { visual: digit(3), entertainment: digit(5), shopping: digit(7), culture: digit(11), rubric: RUBRIC_VERSION };
}

export const demoProvider: MapsProvider = {
  demo: true,
  MapView: DemoMapView,

  async searchCities(query) {
    return Object.entries(CITIES)
      .filter(([, city]) => matches(city.name, query))
      .map(([placeId, city]): Suggestion => ({
        placeId,
        main: city.name,
        secondary: city.country,
        resolve: () => Promise.reject(new Error('Cities are not looked up as places')),
      }));
  },

  async searchPlaces(query, near) {
    return DEMO_PLACES.filter((row) => {
      const [, name, , , lat, lng] = row;
      const inside = !near || (lat < near.north && lat > near.south && lng < near.east && lng > near.west);
      return inside && matches(name, query);
    }).map((row): Suggestion => ({
      placeId: row[0],
      main: row[1],
      secondary: `${row[2]}, ${CITIES[row[3]].name}`,
      resolve: async () => details(row),
    }));
  },

  async matchPlace(name) {
    return DEMO_PLACES.find((row) => matches(row[1], name) || matches(name, row[1]))?.[0] ?? null;
  },

  async getPlace(placeId) {
    const row = DEMO_PLACES.find(([id]) => id === placeId);
    if (!row) throw new Error('Unknown demo place');
    return details(row);
  },

  async getCityBounds(placeId) {
    return CITIES[placeId]?.bounds ?? null;
  },
};
