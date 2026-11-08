import type { Trip } from '../types';

export interface TripStore {
  /** Calls back immediately with current trips and again after every change. */
  subscribe(onTrips: (trips: Trip[]) => void, onError: (error: Error) => void): () => void;
  save(trip: Trip): Promise<void>;
  remove(tripId: string): Promise<void>;
}

const KEY = 'mapplanner.trips';

/** Device-only storage, used until Firebase is configured. */
export function createLocalStore(): TripStore {
  const listeners = new Set<(trips: Trip[]) => void>();

  const read = (): Trip[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
  };
  const write = (trips: Trip[]) => {
    localStorage.setItem(KEY, JSON.stringify(trips));
    listeners.forEach((listener) => listener(trips));
  };

  return {
    subscribe(onTrips) {
      listeners.add(onTrips);
      onTrips(read());
      return () => listeners.delete(onTrips);
    },
    async save(trip) {
      write([trip, ...read().filter((t) => t.id !== trip.id)]);
    },
    async remove(tripId) {
      write(read().filter((t) => t.id !== tripId));
    },
  };
}
