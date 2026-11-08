import { useEffect, useState } from 'react';
import { cycleTheme } from '../theme';
import type { Trip } from '../types';
import { KeyHints, StatusLine, ThemeToggle, type KeyHint } from './Hud';

type Props = {
  trips: Trip[];
  missingTrip: boolean;
  demo: boolean;
  synced: boolean;
  onDelete(tripId: string): void;
  onSignOut: (() => void) | null;
};

const newTrip = () => {
  window.location.hash = '#/new';
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <time className="clock">{now.toLocaleTimeString([], { hourCycle: 'h23' })}</time>;
}

export function TripsHome({ trips, missingTrip, demo, synced, onDelete, onSignOut }: Props) {
  const hints: KeyHint[] = [
    { key: 'N', label: 'New trip', run: newTrip },
    { key: 'T', label: 'Theme', run: cycleTheme },
    ...(onSignOut ? [{ key: 'L', label: 'Log out', run: onSignOut }] : []),
  ];
  const count = trips.length;

  return (
    <main className="home">
      <div className="home-stage">
        <StatusLine aside={<><Clock /><ThemeToggle /></>}>
          {count === 0 ? 'No trips planned yet' : `Currently planning ${count} trip${count === 1 ? '' : 's'}`}
        </StatusLine>

        {(demo || !synced) && (
          <p className="notice">
            {demo ? 'Demo mode: sample places only. ' : ''}
            {synced ? '' : 'Trips are saved on this device and won’t sync. '}
          </p>
        )}
        {missingTrip && <p className="notice">That trip no longer exists.</p>}

        <ul className="tile-grid">
          <li className="tile tile-primary">
            <a href="#/new">
              <h2 className="tile-bar">New Trip</h2>
              <div className="tile-body tile-prompt">Where are you going?</div>
            </a>
          </li>
          {trips.map((trip) => (
            <li key={trip.id} className="tile">
              <a href={`#/trip/${trip.id}`}>
                <h2 className="tile-bar">{trip.name}</h2>
                <div className="tile-body">
                  <span className="tile-cities">{trip.cities.map((city) => city.name).join(' · ') || 'No cities yet'}</span>
                  <span className="tile-stats">
                    <span className="stat"><b>{trip.days.length}</b> {trip.days.length === 1 ? 'Day' : 'Days'}</span>
                    <span className="stat"><b>{trip.places.length}</b> {trip.places.length === 1 ? 'Place' : 'Places'}</span>
                  </span>
                </div>
              </a>
              <button
                className="tile-delete"
                aria-label={`Delete ${trip.name}`}
                onClick={() => {
                  if (window.confirm(`Delete “${trip.name}”? This can’t be undone.`)) onDelete(trip.id);
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <KeyHints hints={hints} />
      </div>
    </main>
  );
}
