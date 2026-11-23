import { CalendarDays, FileUp, LogOut, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cycleTheme } from '../theme';
import type { MapsProvider } from '../maps/provider';
import { isEntry } from '../trip';
import type { Trip } from '../types';
import { ImportCsvDialog } from './ImportCsvDialog';
import { KeyHints, StatusLine, ThemeToggle, type KeyHint } from './Hud';

type Props = {
  trips: Trip[];
  missingTrip: boolean;
  demo: boolean;
  synced: boolean;
  onDelete(tripId: string): void;
  onLeave(trip: Trip): void;
  myUid: string | null;
  provider: MapsProvider;
  onImport(trips: Trip[]): void;
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

export function TripsHome({ trips, missingTrip, demo, synced, onDelete, onLeave, myUid, provider, onImport, onSignOut }: Props) {
  const [importing, setImporting] = useState(false);
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
              <h2 className="tile-bar"><Plus size={22} aria-hidden="true" /> New Trip</h2>
              <div className="tile-body tile-prompt">Where are you going?</div>
            </a>
          </li>
          {trips.map((trip) => {
            const shared = (trip.memberEmails?.length ?? 1) > 1;
            const mine = !trip.ownerUid || trip.ownerUid === myUid;
            const pins = trip.places.filter((p) => !isEntry(p)).length;
            return (
            <li key={trip.id} className="tile">
              <a href={`#/trip/${trip.id}`}>
                <h2 className="tile-bar">
                  <span className="clip grow">{trip.name}</span>
                  {shared && <Users size={18} aria-label={mine ? 'Shared' : `Shared by ${trip.ownerEmail}`} />}
                </h2>
                <div className="tile-body">
                  <span className="tile-cities">{trip.cities.map((city) => city.name).join(' · ') || 'No cities yet'}</span>
                  <span className="tile-stats">
                    <CalendarDays size={18} className="muted" aria-hidden="true" />
                    <span className="stat"><b>{trip.days.length}</b> {trip.days.length === 1 ? 'Day' : 'Days'}</span>
                    <span className="stat"><b>{pins}</b> {pins === 1 ? 'Place' : 'Places'}</span>
                  </span>
                </div>
              </a>
              {mine ? (
                <button
                  className="tile-delete"
                  aria-label={`Delete ${trip.name}`}
                  title="Delete trip"
                  onClick={() => {
                    const warning = shared ? ' It will be deleted for everyone it’s shared with.' : '';
                    if (window.confirm(`Delete “${trip.name}”? This can’t be undone.${warning}`)) onDelete(trip.id);
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              ) : (
                <button
                  className="tile-delete"
                  aria-label={`Leave ${trip.name}`}
                  title="Leave trip"
                  onClick={() => {
                    if (window.confirm(`Leave “${trip.name}”? ${trip.ownerEmail ?? 'The owner'} can add you back.`)) onLeave(trip);
                  }}
                >
                  <LogOut size={18} aria-hidden="true" />
                </button>
              )}
            </li>
            );
          })}
        </ul>

        <div className="home-actions">
          <button className="chip add" onClick={() => setImporting(true)}><FileUp size={17} aria-hidden="true" /> Import trips from CSV</button>
        </div>
        {importing && <ImportCsvDialog provider={provider} onImport={onImport} onClose={() => setImporting(false)} />}

        <KeyHints hints={hints} />
      </div>
    </main>
  );
}
