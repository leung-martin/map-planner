import { namedInActivity, placesInActivity, searchable } from './importCsv';
import { isEntry } from './trip';
import type { SavedPlace, Trip } from './types';

// Sorts a trip's items for checking that each place in an itinerary landed on the right spot on the map.

export type Check =
  /** Has a pin. */
  | { status: 'pinned'; query: string }
  /** Happens at a place that already has a pin, like breakfast at the hotel. */
  | { status: 'same-spot'; at: SavedPlace }
  /** Names a place but has no pin. */
  | { status: 'missing'; query: string; inList?: boolean }
  /** Marked as not a place, or nothing in it names one (a flight, "Wake"). */
  | { status: 'skipped'; query: string };

const simplify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Words that don't tell one place from another.
const GENERIC = new Set(['airport', 'hotel', 'station', 'terminal', 'japan', 'the', 'and', 'park', 'inn', 'city', 'ward', 'market']);

/** "Vessel Inn Sapporo Nakajima Park" and "Vessel Inn Sapporo" are the same spot, as are "Haneda Airport" and "Tokyo Haneda (HND)". */
function sameSpot(a: string, b: string, cityWords: Set<string>): number {
  const x = simplify(a);
  const y = simplify(b);
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return 100;
  const distinct = (text: string) => new Set(text.split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w) && !cityWords.has(w)));
  const ys = distinct(y);
  return [...distinct(x)].filter((w) => ys.has(w)).length;
}

/**
 * How an item stands on the map. `names` holds the map names of pinned places, by place ID.
 * A plan's own wording is used to search: a place named in it, else where it happens unless that's just a city.
 */
export function checkPlace(place: SavedPlace, trip: Trip, names: Record<string, string>): Check {
  if (!isEntry(place)) return { status: 'pinned', query: place.where && searchable(place.where) ? place.where : names[place.placeId] ?? '' };
  const linked = place.spotId ? trip.places.find((p) => p.id === place.spotId && !isEntry(p)) : undefined;
  if (linked) return { status: 'same-spot', at: linked };

  const cityWords = new Set(trip.cities.flatMap((city) => simplify(city.name).split(' ')));
  // "Kawaguchiko / Tokyo" or "Sapporo" is a whole area, not a spot.
  const isArea = (text: string) => text.split(/[/,]/).some((part) => trip.cities.some((city) => simplify(city.name) === simplify(part)));

  const where = whereOf(place);
  const mentioned = namedInActivity(place.title ?? '');
  const named = mentioned && !isArea(mentioned) ? mentioned : null;
  const spot = named ?? (searchable(where) && !isArea(where) ? where : '');

  // A shared word ("Ichiran") only counts for a pin nearby, so a chain matches its local branch.
  const day = trip.days.find((d) => d.id === place.dayId);
  const nearby = (other: SavedPlace) =>
    other.cityId === place.cityId || (day?.cityIds.includes(other.cityId) ?? false) || (place.dayId !== null && other.dayId === place.dayId);
  const title = simplify(place.title ?? '');
  /** The pin that best matches some text, or that the whole title names outright. */
  const pinFor = (text: string, byTitle: boolean): SavedPlace | null => {
    let best: SavedPlace | null = null;
    let bestScore = 0;
    for (const other of trip.places) {
      const name = !isEntry(other) ? names[other.placeId] : undefined;
      if (!name || other.id === place.id) continue;
      const full = simplify(name);
      // "Check into Vessel Inn Sapporo Nakajima Park" names the hotel outright.
      let score = byTitle && full.length >= 6 && title.includes(full) ? 100 : text ? sameSpot(name, text, cityWords) : 0;
      if (score < 100 && !nearby(other)) score = 0;
      // Among equals, the pin on the same day wins.
      if (score > 0 && other.dayId === place.dayId) score += 0.5;
      if (score > bestScore) [best, bestScore] = [other, score];
    }
    return best;
  };

  // "Hokkaido Jingu, AEON mall" needs a pin for each place.
  const list = placesInActivity(place.title ?? '').filter((name) => !isArea(name));
  if (list.length >= 2) {
    const pins = list.map((name) => pinFor(name, false));
    const unpinned = list.find((_, i) => !pins[i]);
    if (!unpinned) return { status: 'same-spot', at: pins[0]! };
    if (place.noPin) return { status: 'skipped', query: unpinned };
    return { status: 'missing', query: unpinned, inList: true };
  }

  const best = pinFor(spot, true);
  if (best) return { status: 'same-spot', at: best };
  if (place.noPin || !spot) return { status: 'skipped', query: spot || place.title || '' };
  return { status: 'missing', query: spot };
}

/** Where a plan happens, as written. Trips imported before `where` was kept have it as the first line of the notes. */
export function whereOf(place: SavedPlace): string {
  if (place.where !== undefined) return place.where;
  const firstLine = place.notes.split('\n')[0].trim();
  return /^(cost|time|date):/i.test(firstLine) ? '' : firstLine;
}

/**
 * A plan with where it happens rewritten. Imports also wrote that in the first line of the notes,
 * which is rewritten too, or dropped when the card will show the place it's linked to instead.
 */
export function rewriteWhere(place: SavedPlace, where: string, keepInNotes: boolean): SavedPlace {
  const old = whereOf(place);
  const [first, ...rest] = place.notes.split('\n');
  const notes = old && first.trim() === old ? (keepInNotes && where ? [where, ...rest] : rest).join('\n') : place.notes;
  return { ...place, where, notes };
}

/** Moves a plan's title into its notes when it gets a pin, since a pin shows the place's own name. */
export function notesWithTitle(place: SavedPlace): string {
  const title = place.title?.trim();
  if (!title || place.notes.startsWith(title)) return place.notes;
  return place.notes ? `${title}\n${place.notes}` : title;
}

// Airport codes itineraries use, by the name the airport goes by.
const AIRPORTS: Record<string, string> = {
  hnd: 'Haneda', nrt: 'Narita', kix: 'Kansai', itm: 'Itami', cts: 'New Chitose', fuk: 'Fukuoka', oka: 'Naha', ngo: 'Chubu Centrair',
  yyz: 'Toronto Pearson', yvr: 'Vancouver', yul: 'Montreal Trudeau', lax: 'Los Angeles', sfo: 'San Francisco', icn: 'Incheon', lhr: 'Heathrow',
};

/**
 * Where a travel plan ("Flight: Toronto -> Haneda", "YYZ -> HND") takes them: the pinned place at the end of its arrow.
 * That can be far from the plan's own city, since that's the point of travelling. A city at the end isn't a spot.
 */
export function travelTo(place: SavedPlace, trip: Trip, names: Record<string, string>): SavedPlace | null {
  if (!isEntry(place)) return null;
  const cityWords = new Set(trip.cities.flatMap((city) => simplify(city.name).split(' ')));
  const isCity = (text: string) => trip.cities.some((city) => simplify(city.name) === simplify(text));
  const ends = [place.title ?? '', whereOf(place)]
    .map((text) => text.split(/->|→|=>/))
    .filter((parts) => parts.length > 1)
    .map((parts) => parts[parts.length - 1].replace(/\([^)]*\)/g, ' ').trim())
    .map((end) => AIRPORTS[end.toLowerCase()] ?? end)
    .filter((end) => end && !isCity(end));
  for (const end of ends) {
    let best: SavedPlace | null = null;
    let bestScore = 0;
    for (const other of trip.places) {
      const name = !isEntry(other) ? names[other.placeId] : undefined;
      const score = name ? sameSpot(name, end, cityWords) : 0;
      if (score > bestScore) [best, bestScore] = [other, score];
    }
    if (best) return best;
  }
  return null;
}
