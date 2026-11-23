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
