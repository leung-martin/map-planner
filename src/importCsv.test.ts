import { describe, expect, it } from 'vitest';
import { buildTrip, CsvError, namedInActivity, parseCsv, placesInActivity, parseTimeSlot, readTripsCsv, type FoundPlace, type PlaceLookup } from './importCsv';
import { inDayOrder, isEntry } from './trip';
import type { SavedPlace } from './types';

const HEADER = 'trip_id,trip_title,record_type,date_iso,raw_date_label,time_slot,activity_or_item,location_or_route,overnight_stay,cost_amount,cost_currency,notes_or_links';

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas inside quotes, CRLF and a byte-order mark', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });
  it('keeps line breaks inside quoted fields and skips blank lines', () => {
    expect(parseCsv('a,"line one\nline two"\n\n')).toEqual([['a', 'line one\nline two']]);
  });
});

describe('readTripsCsv', () => {
  it('groups rows into trips by trip_id', () => {
    const trips = readTripsCsv(`${HEADER}\nA,Trip A,itinerary,,,,x,y,,,,\nB,Trip B,itinerary,,,,x,y,,,,\nA,Trip A,itinerary,,,,z,y,,,,`);
    expect(trips.map((t) => [t.title, t.rows.length])).toEqual([['Trip A', 2], ['Trip B', 1]]);
  });
  it('explains which columns are missing', () => {
    expect(() => readTripsCsv('name,place\nx,y')).toThrow(CsvError);
    expect(() => readTripsCsv('name,place\nx,y')).toThrow(/trip_id/);
  });
});

describe('parseTimeSlot', () => {
  it('reads single times and ranges', () => {
    expect(parseTimeSlot('12:40 PM')).toEqual({ time: '12:40' });
    expect(parseTimeSlot('7:00 AM - 8:00 AM')).toEqual({ time: '07:00', endTime: '08:00' });
    expect(parseTimeSlot('12:00 AM - 12:15 AM')).toEqual({ time: '00:00', endTime: '00:15' });
    expect(parseTimeSlot('~12:30 AM - 1:15 AM')).toEqual({ time: '00:30', endTime: '01:15' });
    expect(parseTimeSlot('9:00am-10:40pm')).toEqual({ time: '09:00', endTime: '22:40' });
    expect(parseTimeSlot('3 PM')).toEqual({ time: '15:00' });
  });
  it('borrows AM or PM for a time that leaves it off', () => {
    expect(parseTimeSlot('10:05 PM - 10:30')).toEqual({ time: '22:05', endTime: '22:30' });
  });
  it('keeps words as text', () => {
    expect(parseTimeSlot('TBD')).toEqual({ text: 'TBD' });
    expect(parseTimeSlot('Overnight')).toEqual({ text: 'Overnight' });
    expect(parseTimeSlot('')).toEqual({});
  });
});

describe('namedInActivity', () => {
  it('finds a clearly named place and ignores everyday words', () => {
    expect(namedInActivity('Lunch — Nouilles Japonaise Tokuichi Ramen')).toBe('Nouilles Japonaise Tokuichi Ramen');
    expect(namedInActivity('Head to Hill of the Buddha')).toBe('Hill of the Buddha');
    expect(namedInActivity('Visit Hill of the Buddha')).toBe('Hill of the Buddha');
    expect(namedInActivity('Walk around Tokyo')).toBeNull();
    expect(namedInActivity('Drive to lunch place')).toBeNull();
    expect(namedInActivity('Head to the gate')).toBeNull();
    expect(namedInActivity('No schedule — walk around Tokyo')).toBeNull();
    expect(namedInActivity('Wake')).toBeNull();
  });
});

describe('placesInActivity', () => {
  it('finds a list of places but not alternatives or to-dos', () => {
    expect(placesInActivity('Hokkaido Jingu, AEON mall')).toEqual(['Hokkaido Jingu', 'AEON mall']);
    expect(placesInActivity('Visit Otaru Canal & Sankaku Market (三角市場)')).toEqual(['Otaru Canal', 'Sankaku Market']);
    expect(placesInActivity('Dinner options: Crab, Genghis Khan, Nemuro Hanamaru')).toEqual([]);
    expect(placesInActivity('Check out & return car')).toEqual([]);
    expect(placesInActivity('Check in first, walk around and Soup Curry Garaku')).toEqual([]);
    expect(placesInActivity('Ski/snowboard')).toEqual([]);
  });
});

describe('buildTrip', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const known: Record<string, FoundPlace> = {
    'vessel inn': { placeId: 'hotel', name: 'Vessel Inn', city: 'Sapporo', location: at(43.05, 141.35), types: ['lodging'] },
    'ichiran sapporo': { placeId: 'ramen', name: 'Ichiran Sapporo', city: 'Sapporo', location: at(43.06, 141.35), types: ['restaurant'] },
    sapporo: { placeId: 'area', name: 'Sapporo', city: 'Sapporo', location: at(43.06, 141.35), types: ['locality', 'political'] },
    'otaru canal': { placeId: 'canal', name: 'Otaru Canal', city: 'Otaru', location: at(43.2, 141.0), types: ['tourist_attraction'] },
    'moiwa ropeway': { placeId: 'ropeway', name: 'Mt. Moiwa Ropeway', city: 'Sapporo', location: at(43.03, 141.33), types: ['tourist_attraction'] },
    'far ramen': { placeId: 'far', name: 'Far Ramen', city: 'Osaka', location: at(34.7, 135.5), types: ['restaurant'] },
  };
  const lookup: PlaceLookup = {
    find: async (query) => known[query.toLowerCase()] ?? null,
    findCity: async (name) => `city:${name}`,
  };
  const csv = [
    HEADER,
    'J,Japan,itinerary,2026-11-30,,6:30 AM,Wake,Sapporo,Vessel Inn,,,',
    'J,Japan,itinerary,2026-11-29,,10:55 PM,Bus to Sapporo,CTS -> Sapporo,Vessel Inn,,,',
    'J,Japan,itinerary,2026-11-30,,7:00 AM - 8:00 AM,Breakfast at Hotel,Vessel Inn,Vessel Inn,,,',
    'J,Japan,itinerary,2026-11-30,,12:30 AM - 1:15 AM,Dinner — Ichiran Ramen,Ichiran Sapporo,Vessel Inn,1200,JPY,Cash only',
    'J,Japan,itinerary,2026-11-30,,TBD,See the canal,Otaru Canal,Vessel Inn,,,',
    'J,Japan,flight_booking,,,,Air Canada,,,1500,CAD,',
  ].join('\n');

  it('makes days by date, cities in order, hotels as home bases, and pins only real places', async () => {
    const [source] = readTripsCsv(csv);
    const { trip, places, plans } = await buildTrip(source, lookup);
    expect(trip.name).toBe('Japan');
    expect(trip.cities.map((c) => [c.name, c.placeId])).toEqual([['Sapporo', 'city:Sapporo'], ['Otaru', 'city:Otaru']]);
    expect(trip.days.map((d) => d.date)).toEqual(['2026-11-29', '2026-11-30']);
    expect(trip.days[1].cityIds).toEqual(trip.cities.map((c) => c.id));
    expect(places).toBe(3);
    expect(plans).toBe(4);

    const hotel = trip.places.find((p) => p.placeId === 'hotel')!;
    expect(hotel.homeBase).toBe(true);
    const ramen = trip.places.find((p) => p.placeId === 'ramen')!;
    expect(ramen).toMatchObject({ time: '00:30', endTime: '01:15', dayId: trip.days[1].id, mustHave: true });
    expect(ramen.notes).toBe('Dinner — Ichiran Ramen\nCost: 1200 JPY\nCash only');
    expect(trip.places.find((p) => p.placeId === 'canal')!.notes).toBe('See the canal\nTime: TBD');
  });

  it('keeps plans without a pin, with their times, and puts undated rows aside', async () => {
    const [source] = readTripsCsv(csv);
    const { trip } = await buildTrip(source, lookup);
    const plans = trip.places.filter(isEntry);
    expect(plans.map((p) => p.title)).toEqual(['Wake', 'Bus to Sapporo', 'Breakfast at Hotel', 'Flight booking: Air Canada']);
    expect(plans[0]).toMatchObject({ time: '06:30', dayId: trip.days[1].id });
    expect(plans[1].notes).toBe('CTS -> Sapporo');
    expect(plans[3]).toMatchObject({ dayId: null, notes: 'Cost: 1500 CAD' });
  });

  it('pins a place named in the activity when the location is only a city, unless it is far away', async () => {
    const rows = [HEADER, 'J,Japan,itinerary,2026-11-30,,,Head to Moiwa Ropeway,Sapporo,Vessel Inn,,,', 'J,Japan,itinerary,2026-11-30,,,Lunch — Far Ramen,Sapporo,Vessel Inn,,,'];
    const [source] = readTripsCsv(rows.join(String.fromCharCode(10)));
    const { trip } = await buildTrip(source, lookup);
    expect(trip.places.filter((p) => p.placeId).map((p) => p.placeId)).toEqual(['hotel', 'ropeway']);
    expect(trip.places.find((p) => p.placeId === 'ropeway')!.notes).toBe('Head to Moiwa Ropeway');
  });

  it('pins each place a row lists, and keeps no plan once all are found', async () => {
    const rows = [HEADER, 'J,Japan,itinerary,2026-11-30,,1:30 PM - 4:30 PM,"Otaru Canal, Moiwa Ropeway",Sapporo,Vessel Inn,,,'];
    const [source] = readTripsCsv(rows.join(String.fromCharCode(10)));
    const { trip } = await buildTrip(source, lookup);
    const listed = trip.places.filter((p) => p.placeId === 'canal' || p.placeId === 'ropeway');
    expect(listed.map((p) => [p.placeId, p.time, p.endTime, p.notes])).toEqual([
      ['canal', '13:30', '16:30', 'Otaru Canal, Moiwa Ropeway'],
      ['ropeway', '13:30', '16:30', 'Otaru Canal, Moiwa Ropeway'],
    ]);
    expect(trip.places.filter(isEntry)).toEqual([]);
  });

  it('merges a city Google names two ways', async () => {
    const twoNames: PlaceLookup = {
      find: async (query) => {
        const found = known[query.toLowerCase()];
        return found?.placeId === 'ramen' ? { ...found, city: '札幌市' } : found ?? null;
      },
      findCity: async (name) => (name === '札幌市' ? 'city:Sapporo' : `city:${name}`),
    };
    const [source] = readTripsCsv(csv);
    const { trip } = await buildTrip(source, twoNames);
    expect(trip.cities.map((c) => c.name)).toEqual(['Sapporo', 'Otaru']);
    expect(trip.places.find((p) => p.placeId === 'ramen')!.cityId).toBe(trip.cities[0].id);
  });

  it('says so when nothing can be found', async () => {
    const [source] = readTripsCsv(csv);
    await expect(buildTrip(source, { find: async () => null, findCity: async () => null })).rejects.toThrow(CsvError);
  });
});

describe('inDayOrder', () => {
  const p = (id: string, time?: string) => ({ id, placeId: id, cityId: 'c', dayId: 'd', notes: '', ...(time ? { time } : {}) }) as SavedPlace;
  it('sorts timed places by time and leaves untimed ones where they are', () => {
    expect(inDayOrder([p('a', '15:00'), p('b'), p('c', '09:00'), p('d')]).map((x) => x.id)).toEqual(['c', 'b', 'a', 'd']);
  });
});
