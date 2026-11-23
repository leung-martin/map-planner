import { distanceKm } from './importKml';
import { addDay, createTrip } from './trip';
import type { City, LatLng, SavedPlace, Trip } from './types';

// Reads itinerary spreadsheets exported as CSV, one trip per trip_id, and matches their places on Google Maps.

export class CsvError extends Error {}

export type CsvRow = Record<string, string>;
export type CsvTrip = { key: string; title: string; rows: CsvRow[] };

const REQUIRED = ['trip_id', 'trip_title', 'activity_or_item', 'location_or_route'];

/** Splits CSV text into rows of fields, following the quoting rules spreadsheets use. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((value) => value.trim()));
}

export function readTripsCsv(text: string): CsvTrip[] {
  const [header, ...body] = parseCsv(text);
  const columns = (header ?? []).map((name) => name.trim().toLowerCase());
  const missing = REQUIRED.filter((name) => !columns.includes(name));
  if (missing.length) throw new CsvError(`This CSV is missing the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);

  const trips = new Map<string, CsvTrip>();
  for (const values of body) {
    const row: CsvRow = Object.fromEntries(columns.map((name, i) => [name, (values[i] ?? '').trim()]));
    const key = row.trip_id || row.trip_title;
    if (!key) continue;
    if (!trips.has(key)) trips.set(key, { key, title: row.trip_title || key, rows: [] });
    trips.get(key)!.rows.push(row);
  }
  if (trips.size === 0) throw new CsvError('No trips were found in this CSV.');
  return [...trips.values()];
}

const CLOCK = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/gi;
const BARE = /\b(\d{1,2}):(\d{2})\b/g;

const toHHMM = (hours: number, minutes: number) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

/** "12:00 PM - 1:00 PM" → 12:00 and 13:00. Anything that isn't a clock time, like "TBD", is kept as text. */
export function parseTimeSlot(text: string): { time?: string; endTime?: string; text?: string } {
  const slot = text.trim();
  if (!slot) return {};
  const found: { hours: number; minutes: number; half: string | null }[] = [];
  for (const match of slot.matchAll(CLOCK)) found.push({ hours: +match[1], minutes: +(match[2] ?? 0), half: match[3].toLowerCase() });
  if (found.length < 2) {
    // "10:05 PM - 10:30" leaves the second time without AM or PM.
    for (const match of slot.matchAll(BARE)) {
      if (found.length >= 2) break;
      const already = found.some((f) => f.hours === +match[1] && f.minutes === +match[2]);
      if (!already) found.push({ hours: +match[1], minutes: +match[2], half: null });
    }
  }
  const times = found
    .slice(0, 2)
    .map((t, _i, all) => {
      const half = t.half ?? all.find((other) => other.half)?.half ?? null;
      if (t.hours > 23 || t.minutes > 59) return null;
      if (!half) return toHHMM(t.hours, t.minutes);
      if (t.hours > 12) return null;
      return toHHMM((t.hours % 12) + (half === 'p' ? 12 : 0), t.minutes);
    })
    .filter((t): t is string => t !== null);
  if (times.length === 0) return { text: slot };
  return { time: times[0], ...(times[1] ? { endTime: times[1] } : {}) };
}

/** What import needs from a place found on Google Maps. */
export type FoundPlace = { placeId: string; name: string; city: string; location: LatLng; types: string[] };

export type PlaceLookup = {
  /** Finds a place by text, near a point when one is known. */
  find(query: string, near: LatLng | null): Promise<FoundPlace | null>;
  /** The place ID of a city, used for its tab and map area. */
  findCity(name: string, near: LatLng): Promise<string | null>;
};

// A result with one of these types is an area, not somewhere to put a pin.
const AREA_TYPES = new Set([
  'locality', 'sublocality', 'political', 'administrative_area_level_1', 'administrative_area_level_2', 'country',
  'colloquial_area', 'postal_code', 'neighborhood', 'route', 'street_address', 'premise', 'subpremise', 'plus_code', 'intersection',
]);
const isVenue = (found: FoundPlace) => !found.types.some((type) => AREA_TYPES.has(type));

// Routes ("YYZ -> HND") and placeholders can't be looked up.
const searchable = (text: string) => Boolean(text) && !/->|→|\bto\b.*\bto\b/i.test(text) && !/^(in flight|tbd|n\/a|-)$/i.test(text);

/**
 * A place named only in the activity, as in "Lunch — Tokuichi Ramen" or "Head to Hill of the Buddha".
 * Only clearly named ones (capitalized), so "Drive to lunch place" doesn't become a pin.
 */
export function namedInActivity(activity: string): string | null {
  const name = activity.match(/\s[—–-]\s+(.+)$/)?.[1] ?? activity.match(/^(?:head|go|walk|drive|bus|train|taxi|visit)(?:\s+to)?\s+(.+)$/i)?.[1];
  return name && /^[A-Z0-9]/.test(name.trim()) ? name.trim() : null;
}

// A place named in an activity must be this close to where the day is, or it's probably a different branch.
const NAMED_PLACE_KM = 60;

const RECORD_LABELS: Record<string, string> = {
  flight_booking: 'Flight booking',
  pass_booking: 'Pass',
  summary_total: 'Total',
  food_directory: 'Food list',
  wishlist_idea: 'Idea',
};

function notesFor(row: CsvRow, extra: (string | undefined)[]): string {
  const cost = row.cost_amount ? `Cost: ${row.cost_amount}${row.cost_currency ? ` ${row.cost_currency}` : ''}` : '';
  return [...extra, cost, row.notes_or_links].filter((part) => part && part.trim()).join('\n');
}

export type ImportResult = { trip: Trip; places: number; plans: number };

/**
 * Builds one trip: a day per date, a pin for each place found on Google Maps, hotels as home bases,
 * and a plan without a pin for everything else, all keeping their times and notes.
 */
export async function buildTrip(
  source: CsvTrip,
  lookup: PlaceLookup,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<ImportResult> {
  const queries = new Map<string, Promise<FoundPlace | null>>();
  const find = (query: string, near: LatLng | null) => {
    const key = query.toLowerCase();
    if (!queries.has(key)) queries.set(key, lookup.find(query, near).catch(() => null));
    return queries.get(key)!;
  };

  // Hotels first, so each row's search can stay near where that night is spent.
  const hotelNames = [...new Set(source.rows.map((row) => row.overnight_stay).filter(searchable))];
  const hotels = new Map<string, FoundPlace>();
  for (const name of hotelNames) {
    const found = await find(name, null);
    if (found && found.types.includes('lodging')) hotels.set(name, found);
  }

  let done = 0;
  const total = source.rows.length;
  onProgress(0, total);
  const matched = await Promise.all(
    source.rows.map(async (row) => {
      const near = hotels.get(row.overnight_stay)?.location ?? null;
      let found = searchable(row.location_or_route) ? await find(row.location_or_route, near) : null;
      const named = found && isVenue(found) ? null : namedInActivity(row.activity_or_item ?? '');
      if (named) {
        const around = found?.location ?? near;
        const alternative = await find(named, around);
        if (alternative && isVenue(alternative) && (!around || distanceKm(around, alternative.location) < NAMED_PLACE_KM)) found = alternative;
      }
      onProgress(++done, total);
      return found;
    }),
  );

  // Cities in the order the trip reaches them.
  const cityNames: string[] = [];
  const cityAnchor = new Map<string, FoundPlace>();
  const noteCity = (found: FoundPlace | null | undefined) => {
    if (!found?.city) return;
    if (!cityAnchor.has(found.city)) {
      cityAnchor.set(found.city, found);
      cityNames.push(found.city);
    }
  };
  source.rows.forEach((row, i) => {
    noteCity(hotels.get(row.overnight_stay));
    noteCity(matched[i]);
  });
  if (cityNames.length === 0) throw new CsvError(`None of the places in “${source.title}” could be found on Google Maps.`);

  // Google sometimes names the same city two ways (Sapporo and 札幌市), so cities are merged by place ID.
  const cityPlaceIds = await Promise.all(
    cityNames.map(async (name) => (await lookup.findCity(name, cityAnchor.get(name)!.location).catch(() => null)) ?? cityAnchor.get(name)!.placeId),
  );
  const cityIds = new Map<string, string>();
  const cities: City[] = [];
  cityNames.forEach((name, i) => {
    let city = cities.find((c) => c.placeId === cityPlaceIds[i]);
    if (!city) {
      city = { id: crypto.randomUUID(), placeId: cityPlaceIds[i], name };
      cities.push(city);
    }
    cityIds.set(name, city.id);
  });

  let trip: Trip = { ...createTrip(source.title), cities };

  // A day per date, visiting the cities its rows are in.
  const dates = [...new Set(source.rows.map((row) => row.date_iso).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  const dayIds = new Map<string, string>();
  let lastCityId = cities[0].id;
  for (const date of dates) {
    const visited: string[] = [];
    source.rows.forEach((row, i) => {
      if (row.date_iso !== date) return;
      const city = matched[i]?.city;
      const id = city ? cityIds.get(city) : undefined;
      if (id && !visited.includes(id)) visited.push(id);
    });
    const dayCities = visited.length ? visited : [lastCityId];
    lastCityId = dayCities[dayCities.length - 1];
    trip = addDay(trip, dayCities[0]);
    const day = trip.days[trip.days.length - 1];
    trip.days[trip.days.length - 1] = { ...day, cityIds: dayCities, date };
    dayIds.set(date, day.id);
  }

  const places: SavedPlace[] = [];
  const pinned = new Set<string>();
  for (const hotel of hotels.values()) {
    if (pinned.has(hotel.placeId)) continue;
    pinned.add(hotel.placeId);
    places.push({ id: crypto.randomUUID(), placeId: hotel.placeId, cityId: cityIds.get(hotel.city) ?? cities[0].id, dayId: null, homeBase: true, notes: '' });
  }

  source.rows.forEach((row, i) => {
    const dayId = dayIds.get(row.date_iso) ?? null;
    const day = trip.days.find((d) => d.id === dayId);
    const found = matched[i];
    const slot = parseTimeSlot(row.time_slot ?? '');
    const label = RECORD_LABELS[row.record_type];
    const times = { ...(slot.time ? { time: slot.time } : {}), ...(slot.endTime ? { endTime: slot.endTime } : {}) };
    const timeNote = slot.text ? `Time: ${slot.text}` : undefined;
    const dateNote = !dayId && row.raw_date_label ? `Date: ${row.raw_date_label}` : undefined;

    if (found && isVenue(found) && !pinned.has(found.placeId)) {
      pinned.add(found.placeId);
      places.push({
        id: crypto.randomUUID(),
        placeId: found.placeId,
        cityId: cityIds.get(found.city) ?? day?.cityIds[0] ?? cities[0].id,
        dayId,
        mustHave: row.record_type !== 'wishlist_idea',
        notes: notesFor(row, [row.activity_or_item !== found.name ? row.activity_or_item : undefined, timeNote, dateNote]),
        ...times,
      });
      return;
    }
    const cityId = (found?.city && cityIds.get(found.city)) || day?.cityIds[0] || cities[0].id;
    const title = [label, row.activity_or_item || row.location_or_route].filter(Boolean).join(': ') || 'Plan';
    // The place this plan happens at is already pinned (a hotel breakfast, say), or isn't a single spot.
    const where = row.location_or_route && !title.includes(row.location_or_route) ? row.location_or_route : undefined;
    places.push({
      id: crypto.randomUUID(),
      placeId: '',
      title,
      cityId: day && !day.cityIds.includes(cityId) ? day.cityIds[0] : cityId,
      dayId,
      notes: notesFor(row, [where, timeNote, dateNote]),
      ...times,
    });
  });

  trip = { ...trip, places };
  const pins = places.filter((p) => p.placeId).length;
  return { trip, places: pins, plans: places.length - pins };
}
