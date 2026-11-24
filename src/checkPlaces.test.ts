import { describe, expect, it } from 'vitest';
import { checkPlace, notesWithTitle } from './checkPlaces';
import type { SavedPlace, Trip } from './types';

const item = (patch: Partial<SavedPlace>): SavedPlace => ({ id: 'x', placeId: '', cityId: 'c', dayId: null, notes: '', ...patch });
const hotel = item({ id: 'h', placeId: 'hotel', homeBase: true });
const trip: Trip = { id: 't', name: 'T', cities: [{ id: 'c', placeId: 'city', name: 'Sapporo' }], days: [], places: [hotel], updatedAt: 0 };
const names = { hotel: 'Vessel Inn Sapporo Nakajima Park' };

describe('checkPlace', () => {
  it('counts a plan at an already pinned place as on the map', () => {
    expect(checkPlace(item({ title: 'Breakfast at Hotel', where: 'Vessel Inn Sapporo' }), trip, names)).toEqual({ status: 'same-spot', at: hotel });
  });
  it('flags a plan that names a place but has no pin, searching for the place', () => {
    expect(checkPlace(item({ title: 'Lunch — Nijo Market', where: 'Sapporo' }), trip, names)).toEqual({ status: 'missing', query: 'Nijo Market' });
    expect(checkPlace(item({ title: 'See the canal', where: 'Otaru Canal' }), trip, names)).toEqual({ status: 'missing', query: 'Otaru Canal' });
  });
  it('matches a pin sharing a distinctive word, but not just a city name', () => {
    const airport = item({ id: 'a', placeId: 'hnd' });
    const withAirport = { ...trip, places: [hotel, airport] };
    const both = { ...names, hnd: 'Haneda Airport' };
    expect(checkPlace(item({ title: 'Arrive Haneda', where: 'Tokyo Haneda (HND)' }), withAirport, both)).toEqual({ status: 'same-spot', at: airport });
    expect(checkPlace(item({ title: 'Drive to Vessel Inn' }), withAirport, both)).toEqual({ status: 'same-spot', at: hotel });
    expect(checkPlace(item({ title: 'Check in', where: 'Sapporo Grand Hotel' }), withAirport, both).status).toBe('missing');
  });
  it('works for trips imported before where was kept, and finds a pinned name in the title', () => {
    expect(checkPlace(item({ title: 'Breakfast at Hotel', notes: 'Vessel Inn Sapporo\nTime: TBD' }), trip, names)).toEqual({ status: 'same-spot', at: hotel });
    expect(checkPlace(item({ title: 'Check into Vessel Inn Sapporo Nakajima Park' }), trip, names)).toEqual({ status: 'same-spot', at: hotel });
  });
  it('matches a chain only to a branch nearby', () => {
    const sapporoIchiran = item({ id: 's', placeId: 'ich-s', cityId: 'c' });
    const tokyoIchiran = item({ id: 't', placeId: 'ich-t', cityId: 'tokyo' });
    const twoCities: Trip = { ...trip, cities: [...trip.cities, { id: 'tokyo', placeId: 'tk', name: 'Tokyo' }], places: [hotel, sapporoIchiran, tokyoIchiran] };
    const branchNames = { ...names, 'ich-s': 'ICHIRAN Sapporo Susukino', 'ich-t': 'ICHIRAN Shibuya' };
    expect(checkPlace(item({ title: 'Dinner — Ichiran Ramen', cityId: 'tokyo' }), twoCities, branchNames)).toEqual({ status: 'same-spot', at: tokyoIchiran });
    expect(checkPlace(item({ title: 'Dinner — Ichiran Ramen', cityId: 'c' }), twoCities, branchNames)).toEqual({ status: 'same-spot', at: sapporoIchiran });
    const onlySapporo = { ...twoCities, places: [hotel, sapporoIchiran] };
    expect(checkPlace(item({ title: 'Dinner — Ichiran Ramen', cityId: 'tokyo' }), onlySapporo, branchNames).status).toBe('missing');
  });
  it('needs a pin for each place a plan lists', () => {
    const shrine = item({ id: 'j', placeId: 'jingu' });
    const withShrine = { ...trip, places: [hotel, shrine] };
    const both = { ...names, jingu: 'Hokkaido Jingu' };
    const plan = item({ title: 'Hokkaido Jingu, AEON mall', where: 'Sapporo' });
    expect(checkPlace(plan, trip, names)).toEqual({ status: 'missing', query: 'Hokkaido Jingu', inList: true });
    expect(checkPlace(plan, withShrine, both)).toEqual({ status: 'missing', query: 'AEON mall', inList: true });
    const mall = item({ id: 'm', placeId: 'aeon' });
    expect(checkPlace(plan, { ...trip, places: [hotel, shrine, mall] }, { ...both, aeon: 'AEON Mall Sapporo Hassamu' })).toEqual({ status: 'same-spot', at: shrine });
  });
  it('skips plans that only name a city or a route, and ones marked as not a place', () => {
    expect(checkPlace(item({ title: 'Wake', where: 'Sapporo' }), trip, names).status).toBe('skipped');
    expect(checkPlace(item({ title: 'Bus', where: 'CTS -> Sapporo' }), trip, names).status).toBe('skipped');
    expect(checkPlace(item({ title: 'Bus to Sapporo', where: 'CTS -> Sapporo' }), trip, names).status).toBe('skipped');
    expect(checkPlace(item({ title: 'Wake', where: 'Kawaguchiko / Sapporo' }), trip, names).status).toBe('skipped');
    expect(checkPlace(item({ title: 'See the canal', where: 'Otaru Canal', noPin: true }), trip, names).status).toBe('skipped');
  });
  it('searches a pin by what the itinerary wrote, else by its map name', () => {
    expect(checkPlace(item({ placeId: 'p', where: 'Ichiran Sapporo' }), trip, names)).toEqual({ status: 'pinned', query: 'Ichiran Sapporo' });
    expect(checkPlace(hotel, trip, names)).toEqual({ status: 'pinned', query: 'Vessel Inn Sapporo Nakajima Park' });
  });
});

describe('notesWithTitle', () => {
  it('puts the title first in the notes once', () => {
    expect(notesWithTitle(item({ title: 'Dinner', notes: 'Cash only' }))).toBe('Dinner\nCash only');
    expect(notesWithTitle(item({ title: 'Dinner', notes: 'Dinner\nCash only' }))).toBe('Dinner\nCash only');
    expect(notesWithTitle(item({ title: 'Dinner' }))).toBe('Dinner');
  });
});
