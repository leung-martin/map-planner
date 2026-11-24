import type { City, Day, SavedPlace, Trip } from './types';

const newId = () => crypto.randomUUID();

export function createTrip(name: string): Trip {
  return { id: newId(), name, cities: [], days: [], places: [], updatedAt: Date.now() };
}

/** "Paris", "Paris & Rome", "Paris, Rome & Tokyo", "Paris, Rome & 2 more". */
export function tripNameFor(cities: string[]): string {
  if (cities.length <= 1) return cities[0] ?? 'New trip';
  if (cities.length <= 3) return `${cities.slice(0, -1).join(', ')} & ${cities[cities.length - 1]}`;
  return `${cities.slice(0, 2).join(', ')} & ${cities.length - 2} more`;
}

export function addCity(trip: Trip, city: Omit<City, 'id'>): Trip {
  return { ...trip, cities: [...trip.cities, { ...city, id: newId() }] };
}

export function removeCity(trip: Trip, cityId: string): Trip {
  const days = trip.days
    .map((day) => ({ ...day, cityIds: day.cityIds.filter((id) => id !== cityId) }))
    .filter((day) => day.cityIds.length > 0);
  const dayIds = new Set(days.map((day) => day.id));
  return {
    ...trip,
    cities: trip.cities.filter((city) => city.id !== cityId),
    days,
    places: trip.places
      .filter((place) => place.cityId !== cityId)
      .map((place) => (place.dayId && !dayIds.has(place.dayId) ? { ...place, dayId: null } : place)),
  };
}

/** Lowest color not in use, so colors stay as distinct as possible after days are removed. */
function nextColorIndex(days: Day[]): number {
  const used = new Set(days.map((day) => day.colorIndex));
  let index = 0;
  while (used.has(index)) index++;
  return index;
}

export function addDay(trip: Trip, cityId: string): Trip {
  const day: Day = { id: newId(), cityIds: [cityId], date: null, colorIndex: nextColorIndex(trip.days) };
  return { ...trip, days: [...trip.days, day] };
}

export function updateDay(trip: Trip, dayId: string, patch: Partial<Omit<Day, 'id'>>): Trip {
  const days = trip.days.map((day) => (day.id === dayId ? { ...day, ...patch } : day));
  const day = days.find((d) => d.id === dayId);
  // A place can't stay on a day that no longer visits its city.
  const places = trip.places.map((place) =>
    place.dayId === dayId && day && !day.cityIds.includes(place.cityId) ? { ...place, dayId: null } : place,
  );
  return { ...trip, days, places };
}

export function moveDay(trip: Trip, dayId: string, delta: -1 | 1): Trip {
  const from = trip.days.findIndex((day) => day.id === dayId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= trip.days.length) return trip;
  const days = [...trip.days];
  [days[from], days[to]] = [days[to], days[from]];
  return { ...trip, days };
}

/** Moves a day to where another day currently sits. */
export function moveDayOnto(trip: Trip, dayId: string, targetId: string): Trip {
  const from = trip.days.findIndex((day) => day.id === dayId);
  const to = trip.days.findIndex((day) => day.id === targetId);
  if (from < 0 || to < 0 || from === to) return trip;
  const days = [...trip.days];
  days.splice(to, 0, ...days.splice(from, 1));
  return { ...trip, days };
}

export function removeDay(trip: Trip, dayId: string): Trip {
  return {
    ...trip,
    days: trip.days.filter((day) => day.id !== dayId),
    places: trip.places.map((place) => (place.dayId === dayId ? { ...place, dayId: null } : place)),
  };
}

export function addPlace(trip: Trip, place: Pick<SavedPlace, 'placeId' | 'cityId' | 'dayId' | 'mustHave'>): Trip {
  return { ...trip, places: [...trip.places, { ...place, id: newId(), notes: '' }] };
}

export function addPlaces(trip: Trip, cityId: string, placeIds: string[], mustHave: boolean): Trip {
  return placeIds.reduce((current, placeId) => addPlace(current, { placeId, cityId, dayId: null, mustHave }), trip);
}

export function assignPlaces(trip: Trip, placeIds: string[], dayId: string): Trip {
  const ids = new Set(placeIds);
  return { ...trip, places: trip.places.map((place) => (ids.has(place.id) ? { ...place, dayId } : place)) };
}

export function assignToNewDay(trip: Trip, placeIds: string[], cityId: string): Trip {
  const withDay = addDay(trip, cityId);
  return assignPlaces(withDay, placeIds, withDay.days[withDay.days.length - 1].id);
}

/** Puts each group of saved places on its own day in a city, adding days if there aren't enough. */
export function assignGroups(trip: Trip, cityId: string, groups: string[][]): Trip {
  let result = trip;
  while (result.days.filter((day) => day.cityIds.includes(cityId)).length < groups.length) {
    result = addDay(result, cityId);
  }
  const days = result.days.filter((day) => day.cityIds.includes(cityId));
  const dayOf = new Map(groups.flatMap((group, index) => group.map((id) => [id, days[index].id] as const)));
  return { ...result, places: result.places.map((place) => (dayOf.has(place.id) ? { ...place, dayId: dayOf.get(place.id)! } : place)) };
}

/** Everyone who can open the trip. A trip never shared lists only its owner. */
export function membersOf(trip: Trip, myEmail: string): string[] {
  return trip.memberEmails?.length ? trip.memberEmails : [myEmail.toLowerCase()];
}

/** A plan with no map pin, such as "Breakfast" or a flight. */
export const isEntry = (place: SavedPlace) => !place.placeId;

export function addEntry(trip: Trip, entry: { title: string; cityId: string; dayId: string | null }): Trip {
  return { ...trip, places: [...trip.places, { ...entry, id: newId(), placeId: '', notes: '' }] };
}

/**
 * A day's places in the order shown: timed ones in time order, untimed ones where they were dragged.
 * Timed places fill the slots timed places already hold, so dragging an untimed one still places it.
 */
export function inDayOrder(places: SavedPlace[]): SavedPlace[] {
  const timed = places.filter((p) => p.time).sort((a, b) => a.time!.localeCompare(b.time!));
  let next = 0;
  return places.map((p) => (p.time ? timed[next++] : p));
}

/** "8:30 PM" from "20:30", in the device's own clock style. */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function timeRange(place: SavedPlace): string {
  if (!place.time) return place.endTime ? `Until ${formatTime(place.endTime)}` : '';
  return place.endTime ? `${formatTime(place.time)} – ${formatTime(place.endTime)}` : formatTime(place.time);
}

export function updatePlace(trip: Trip, id: string, patch: Partial<Omit<SavedPlace, 'id'>>): Trip {
  return { ...trip, places: trip.places.map((place) => (place.id === id ? { ...place, ...patch } : place)) };
}

/** Puts a place last in a day. A day's places are listed in the order they appear in `trip.places`. */
export function movePlaceToEnd(trip: Trip, id: string, dayId: string | null): Trip {
  const place = trip.places.find((p) => p.id === id);
  if (!place) return trip;
  return { ...trip, places: [...trip.places.filter((p) => p.id !== id), { ...place, dayId }] };
}

/** Puts a place directly before or after another one, on that one's day. */
export function movePlaceBeside(trip: Trip, id: string, targetId: string, after: boolean): Trip {
  const place = trip.places.find((p) => p.id === id);
  const target = trip.places.find((p) => p.id === targetId);
  if (!place || !target || id === targetId) return trip;
  const places = trip.places.filter((p) => p.id !== id);
  places.splice(places.indexOf(target) + (after ? 1 : 0), 0, { ...place, dayId: target.dayId });
  return { ...trip, places };
}

export function removePlace(trip: Trip, id: string): Trip {
  return { ...trip, places: trip.places.filter((place) => place.id !== id) };
}

/** A place can only go on a day that visits its city. */
export function assignableDays(trip: Trip, place: SavedPlace): Day[] {
  return trip.days.filter((day) => day.cityIds.includes(place.cityId));
}

export function dayNumber(trip: Trip, dayId: string): number {
  return trip.days.findIndex((day) => day.id === dayId) + 1;
}

export function dayRoute(trip: Trip, day: Day): string {
  return day.cityIds.map((id) => trip.cities.find((city) => city.id === id)?.name ?? '?').join(' → ');
}

export function dayLabel(trip: Trip, day: Day): string {
  return `Day ${dayNumber(trip, day.id)} · ${dayRoute(trip, day)}`;
}

// Neighboring entries are far apart in hue, and all carry a white day number legibly.
export const DAY_COLORS = [
  '#d92d20', '#1d4ed8', '#047857', '#c2410c', '#7c3aed', '#be185d',
  '#0e7490', '#78350f', '#4d7c0f', '#1e3a8a', '#a21caf', '#475569',
];
export const MAYBE_COLOR = '#b38600';

export function dayColor(day: Day): string {
  return DAY_COLORS[day.colorIndex % DAY_COLORS.length];
}

export function googleMapsUrl(placeId: string, name: string): string {
  const query = `query=${encodeURIComponent(name)}`;
  const id = placeId.startsWith('demo:') ? '' : `&query_place_id=${encodeURIComponent(placeId)}`;
  return `https://www.google.com/maps/search/?api=1&${query}${id}`;
}

/** Google Maps directions to a place from wherever the phone is. */
export function directionsUrl(placeId: string, name: string): string {
  const id = placeId.startsWith('demo:') ? '' : `&destination_place_id=${encodeURIComponent(placeId)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}${id}`;
}

type AddressPart ={ longText: string | null; types: string[] };

const TOKYO_WARDS = new Set([
  'chiyoda', 'chuo', 'minato', 'shinjuku', 'bunkyo', 'taito', 'sumida', 'koto', 'shinagawa', 'meguro', 'ota', 'setagaya',
  'shibuya', 'nakano', 'suginami', 'toshima', 'kita', 'arakawa', 'itabashi', 'nerima', 'adachi', 'katsushika', 'edogawa',
]);

/**
 * The city a place belongs to, or '' for a place in no city, such as a bay.
 * Tokyo's 23 wards are each listed as a city, so they count as Tokyo.
 */
export function cityOf(parts: AddressPart[]): string {
  const find = (type: string) => parts.find((part) => part.types.includes(type))?.longText ?? null;
  const region = find('administrative_area_level_1');
  const locality = find('locality');
  const ward = locality?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/( city|-ku| ward)$/, '');
  if (region === 'Tokyo' && ward && TOKYO_WARDS.has(ward)) return 'Tokyo';
  return locality ?? find('postal_town') ?? find('administrative_area_level_2') ?? '';
}

/** "Le Marais, Paris": no street-level detail. */
export function shortLocation(parts: AddressPart[]): string {
  const find = (...types: string[]) => {
    for (const type of types) {
      const text = parts.find((part) => part.types.includes(type))?.longText;
      if (text) return text;
    }
    return null;
  };
  // Numbered levels only: Japanese addresses also list blocks ("3") and "1-chōme" as sublocalities.
  const named = find('neighborhood', 'sublocality_level_1', 'sublocality_level_2');
  const area = named && !/^\d+(-ch[oō]me)?$/i.test(named) ? named : null;
  const city = find('locality', 'postal_town', 'administrative_area_level_2', 'administrative_area_level_1');
  const shown = [area, city].filter((text): text is string => Boolean(text));
  return shown.length > 0 ? [...new Set(shown)].join(', ') : (find('country') ?? '');
}

export type RouteLeg = { from: SavedPlace; to: SavedPlace; dayId: string };

/**
 * The trip's path in schedule order: a leg each time it moves to a different place.
 * A plan counts at the pinned place it happens at (breakfast at the hotel), and one with no place is passed over.
 */
export function tripRoute(trip: Trip, spotOf: (place: SavedPlace) => SavedPlace | null): RouteLeg[] {
  const legs: RouteLeg[] = [];
  let last: SavedPlace | null = null;
  for (const day of trip.days) {
    for (const place of inDayOrder(trip.places.filter((p) => p.dayId === day.id))) {
      const stop = isEntry(place) ? spotOf(place) : place;
      if (!stop || stop.placeId === last?.placeId) continue;
      if (last) legs.push({ from: last, to: stop, dayId: day.id });
      last = stop;
    }
  }
  return legs;
}
