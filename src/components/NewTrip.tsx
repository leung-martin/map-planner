import { useEffect, useState } from 'react';
import type { MapsProvider, Suggestion } from '../maps/provider';
import { addCity, createTrip, tripNameFor } from '../trip';
import type { Trip } from '../types';
import { KeyHints, StatusLine, ThemeToggle } from './Hud';
import { SearchBox } from './SearchBox';

type Props = {
  provider: MapsProvider;
  onCreate(trip: Trip): void;
  onCancel(): void;
};

export function NewTrip({ provider, onCreate, onCancel }: Props) {
  const [stops, setStops] = useState<Suggestion[]>([]);
  const first = stops.length === 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const finish = () => {
    if (first) return;
    const start = createTrip(tripNameFor(stops.map((stop) => stop.main)));
    onCreate(stops.reduce((trip, stop) => addCity(trip, { placeId: stop.placeId, name: stop.main }), start));
  };

  return (
    <main className="wizard">
      <StatusLine aside={<ThemeToggle />}>
        {first ? 'Planning a new trip' : `Planning ${tripNameFor(stops.map((stop) => stop.main))}`}
      </StatusLine>

      <section className="wizard-panel hud-frame">
        <h1 key={first ? 'first' : 'more'} className="wizard-title">
          {first ? 'Where are you going?' : 'Anywhere else on this trip?'}
        </h1>

        <SearchBox
          key={stops.length}
          autoFocus
          placeholder={first ? 'Search for a city' : 'Add another city'}
          search={async (query) => {
            const found = await provider.searchCities(query);
            return found.filter((result) => !stops.some((stop) => stop.placeId === result.placeId));
          }}
          onPick={(stop) => setStops((current) => [...current, stop])}
          onEmptyEnter={finish}
        />

        {!first && (
          <>
            <ol className="stops">
              {stops.map((stop, index) => (
                <li key={stop.placeId} className="stop">
                  <span className="stop-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="grow clip">
                    <strong>{stop.main}</strong> <span className="muted small">{stop.secondary}</span>
                  </span>
                  <button
                    className="stop-remove"
                    aria-label={`Remove ${stop.main}`}
                    onClick={() => setStops((current) => current.filter((s) => s.placeId !== stop.placeId))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button className="primary wizard-done" onClick={finish}>That’s everything</button>
          </>
        )}
      </section>

      <KeyHints hints={[{ key: 'Enter', label: first ? 'Select' : 'Select or finish' }, { key: 'Esc', label: 'Cancel', run: onCancel }]} />
    </main>
  );
}
