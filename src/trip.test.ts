import { describe, expect, it } from 'vitest';
import {
  addCity, addDay, addPlace, addPlaces, assignableDays, assignGroups, assignToNewDay, createTrip, dayLabel, dayNumber, googleMapsUrl, moveDay, moveDayOnto,
  movePlaceBeside, movePlaceToEnd, removeCity, removeDay, shortLocation, tripNameFor, updateDay,
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

describe('drag reordering', () => {
  function threeDays() {
    let { trip, paris } = parisRome();
    trip = addDay(trip, paris.id);
    trip = addDay(trip, paris.id);
    trip = addDay(trip, paris.id);
    const [one, two, three] = trip.days.map((d) => d.id);
    trip = addPlaces(trip, paris.id, ['a', 'b', 'c'], false);
    trip = { ...trip, places: trip.places.map((p) => ({ ...p, dayId: one })) };
    return { trip, one, two, three, ids: Object.fromEntries(trip.places.map((p) => [p.placeId, p.id])) };
  }
  const order = (trip: Trip) => trip.places.map((p) => p.placeId).join('');

  it('moves a day to another day’s spot in either direction and keeps its color', () => {
    const { trip, one, two, three } = threeDays();
    expect(moveDayOnto(trip, one, three).days.map((d) => d.id)).toEqual([two, three, one]);
    expect(moveDayOnto(trip, three, one).days.map((d) => d.id)).toEqual([three, one, two]);
    expect(moveDayOnto(trip, one, three).days[2].colorIndex).toBe(0);
    expect(moveDayOnto(trip, one, one)).toBe(trip);
  });

  it('puts a place before or after another', () => {
    const { trip, ids } = threeDays();
    expect(order(movePlaceBeside(trip, ids.c, ids.a, false))).toBe('cab');
    expect(order(movePlaceBeside(trip, ids.a, ids.c, true))).toBe('bca');
    expect(order(movePlaceBeside(trip, ids.a, ids.b, true))).toBe('bac');
    expect(movePlaceBeside(trip, ids.a, ids.a, true)).toBe(trip);
  });

  it('takes on the day of the place it is dropped beside', () => {
    const { trip, two, ids } = threeDays();
    const moved = movePlaceToEnd(trip, ids.a, two);
    const result = movePlaceBeside(moved, ids.b, ids.a, false);
    expect(result.places.find((p) => p.id === ids.b)?.dayId).toBe(two);
  });

  it('puts a place last when dropped on a day itself', () => {
    const { trip, one, ids } = threeDays();
    const result = movePlaceToEnd(trip, ids.a, one);
    expect(order(result)).toBe('bca');
    expect(result.places[2].dayId).toBe(one);
  });
});

describe('assignableDays', () => {
  it('offers only the days that visit the place’s city, including travel days', () => {
    let { trip, paris, rome } = parisRome();
    trip = addDay(trip, paris.id);
    trip = addDay(trip, rome.id);
    trip = addDay(trip, paris.id);
    trip = updateDay(trip, trip.days[2].id, { cityIds: [paris.id, rome.id] });
    trip = addPlace(trip, { placeId: 'r', cityId: rome.id, dayId: null });
    expect(assignableDays(trip, trip.places[0]).map((d) => d.id)).toEqual([trip.days[1].id, trip.days[2].id]);
  });
});

describe('assignToNewDay', () => {
  it('creates one day and moves only the chosen places onto it', () => {
    let { trip, paris } = parisRome();
    trip = addPlaces(trip, paris.id, ['a', 'b', 'c'], false);
    const [a, b] = trip.places;
    const result = assignToNewDay(trip, [a.id, b.id], paris.id);
    expect(result.days).toHaveLength(1);
    expect(result.places.map((p) => p.dayId)).toEqual([result.days[0].id, result.days[0].id, null]);
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
