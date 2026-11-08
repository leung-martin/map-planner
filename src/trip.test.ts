import { describe, expect, it } from 'vitest';
import {
  addCity, addDay, addPlace, addPlaces, assignGroups, createTrip, dayLabel, dayNumber, googleMapsUrl, moveDay, removeCity,
  removeDay, shortLocation, tripNameFor, updateDay,
} from './trip';
import type { Trip } from './types';

function parisRome() {
  let trip = createTrip('Italy and France');
  trip = addCity(trip, { placeId: 'p', name: 'Paris' });
  trip = addCity(trip, { placeId: 'r', name: 'Rome' });
  const [paris, rome] = trip.cities;
  return { trip, paris, rome };
}
const lastDay = (trip: Trip) => trip.days[trip.days.length - 1];

describe('days', () => {
  it('numbers days across the whole trip and labels a travel day with both cities', () => {
    let { trip, paris, rome } = parisRome();
    trip = addDay(trip, paris.id);
    trip = addDay(trip, paris.id);
    const travel = lastDay(trip);
    trip = updateDay(trip, travel.id, { cityIds: [paris.id, rome.id] });
    expect(dayLabel(trip, lastDay(trip))).toBe('Day 2 · Paris → Rome');
  });

  it('keeps each day color when renumbering and reuses a freed color', () => {
    let { trip, paris } = parisRome();
    trip = addDay(trip, paris.id);
    trip = addDay(trip, paris.id);
    trip = addDay(trip, paris.id);
    trip = removeDay(trip, trip.days[1].id);
    expect(trip.days.map((d) => d.colorIndex)).toEqual([0, 2]);
    expect(dayNumber(trip, trip.days[1].id)).toBe(2);
    trip = addDay(trip, paris.id);
    expect(lastDay(trip).colorIndex).toBe(1);
  });

  it('moves days and ignores moves past the ends', () => {
    let { trip, paris, rome } = parisRome();
    trip = addDay(trip, paris.id);
    trip = addDay(trip, rome.id);
    const [first, second] = trip.days;
    expect(moveDay(trip, first.id, -1)).toBe(trip);
    trip = moveDay(trip, second.id, -1);
    expect(trip.days.map((d) => d.id)).toEqual([second.id, first.id]);
  });

  it('unschedules places when their day is removed', () => {
    let { trip, paris } = parisRome();
    trip = addDay(trip, paris.id);
    trip = addPlace(trip, { placeId: 'x', cityId: paris.id, dayId: trip.days[0].id });
    trip = removeDay(trip, trip.days[0].id);
    expect(trip.places[0].dayId).toBeNull();
  });

  it('unschedules only the places in a city the day stops visiting', () => {
    let { trip, paris, rome } = parisRome();
    trip = addDay(trip, paris.id);
    const id = trip.days[0].id;
    trip = updateDay(trip, id, { cityIds: [paris.id, rome.id] });
    trip = addPlace(trip, { placeId: 'a', cityId: paris.id, dayId: id });
    trip = addPlace(trip, { placeId: 'b', cityId: rome.id, dayId: id });
    trip = updateDay(trip, id, { cityIds: [paris.id] });
    expect(trip.places.map((p) => p.dayId)).toEqual([id, null]);
  });
});

describe('assignGroups', () => {
  it('fills existing days first, adds days as needed, and leaves other places alone', () => {
    let { trip, paris, rome } = parisRome();
    trip = addDay(trip, rome.id);
    trip = addDay(trip, paris.id);
    trip = addPlaces(trip, paris.id, ['a', 'b', 'c'], true);
    trip = addPlaces(trip, rome.id, ['r'], false);
    const [a, b, c] = trip.places;

    const result = assignGroups(trip, paris.id, [[a.id], [b.id, c.id]]);
    const parisDays = result.days.filter((d) => d.cityIds.includes(paris.id));
    expect(result.days).toHaveLength(3);
    expect(result.places.map((p) => p.dayId)).toEqual([parisDays[0].id, parisDays[1].id, parisDays[1].id, null]);
  });
});

describe('removeCity', () => {
  it('removes its places, removes its only-city days, and shortens travel days', () => {
    let { trip, paris, rome } = parisRome();
    trip = addDay(trip, rome.id);
    const romeOnly = trip.days[0].id;
    trip = addDay(trip, paris.id);
    const travel = trip.days[1].id;
    trip = updateDay(trip, travel, { cityIds: [paris.id, rome.id] });
    trip = addPlace(trip, { placeId: 'a', cityId: rome.id, dayId: romeOnly });
    trip = addPlace(trip, { placeId: 'b', cityId: paris.id, dayId: travel });

    trip = removeCity(trip, rome.id);
    expect(trip.cities.map((c) => c.name)).toEqual(['Paris']);
    expect(trip.days.map((d) => [d.id, d.cityIds])).toEqual([[travel, [paris.id]]]);
    expect(trip.places.map((p) => [p.placeId, p.dayId])).toEqual([['b', travel]]);
  });
});

describe('shortLocation', () => {
  const part = (longText: string, ...types: string[]) => ({ longText, types });

  it('uses neighborhood and city, never the street', () => {
    expect(shortLocation([
      part('12', 'street_number'), part('Rue de Rivoli', 'route'),
      part('Le Marais', 'neighborhood'), part('Paris', 'locality'), part('France', 'country'),
    ])).toBe('Le Marais, Paris');
  });
  it('falls back to the city alone, then the country', () => {
    expect(shortLocation([part('Rome', 'locality'), part('Italy', 'country')])).toBe('Rome');
    expect(shortLocation([part('Italy', 'country')])).toBe('Italy');
  });
  it('does not repeat a name', () => {
    expect(shortLocation([part('Paris', 'sublocality_level_1'), part('Paris', 'locality')])).toBe('Paris');
  });
  it('uses the area name in Japanese addresses, not the block or chōme', () => {
    expect(shortLocation([
      part('1', 'premise'), part('3', 'sublocality_level_4', 'sublocality'), part('1-chōme', 'sublocality_level_3', 'sublocality'),
      part('Azabudai', 'sublocality_level_2', 'sublocality'), part('Minato City', 'locality'), part('Tokyo', 'administrative_area_level_1'),
    ])).toBe('Azabudai, Minato City');
  });
  it('ignores a neighborhood that is only a number', () => {
    expect(shortLocation([part('3', 'neighborhood'), part('Minato City', 'locality')])).toBe('Minato City');
  });
});

describe('tripNameFor', () => {
  it('names a trip after its cities and stays short for long trips', () => {
    expect(tripNameFor(['Paris'])).toBe('Paris');
    expect(tripNameFor(['Paris', 'Rome'])).toBe('Paris & Rome');
    expect(tripNameFor(['Paris', 'Rome', 'Tokyo'])).toBe('Paris, Rome & Tokyo');
    expect(tripNameFor(['Paris', 'Rome', 'Tokyo', 'Seoul'])).toBe('Paris, Rome & 2 more');
  });
});

describe('googleMapsUrl', () => {
  it('encodes the name and includes the place ID', () => {
    expect(googleMapsUrl('ChIJ1', 'Café & Co')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20%26%20Co&query_place_id=ChIJ1',
    );
  });
});
