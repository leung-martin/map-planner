import { useEffect, useRef, useState } from 'react';
import { buildTrip, CsvError, readTripsCsv, type CsvTrip, type PlaceLookup } from '../importCsv';
import type { MapsProvider } from '../maps/provider';
import type { Trip } from '../types';

type Props = {
  provider: MapsProvider;
  onImport(trips: Trip[]): void;
  onClose(): void;
};

type Stage =
  | { kind: 'pick' }
  | { kind: 'choose'; trips: CsvTrip[] }
  | { kind: 'working'; index: number; count: number; done: number; total: number }
  | { kind: 'finished'; lines: string[] };

export function ImportCsvDialog({ provider, onImport, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const lookup: PlaceLookup = {
    async find(query, near) {
      const placeId = await provider.findPlace(query, near);
      if (!placeId) return null;
      const { name, city, location, types } = await provider.getPlace(placeId);
      return { placeId, name, city, location, types };
    },
    findCity: (name, near) => provider.findPlace(name, near),
  };

  const open = async (file: File) => {
    setError('');
    try {
      const trips = readTripsCsv(await file.text());
      setChosen(new Set(trips.map((t) => t.key)));
      setStage({ kind: 'choose', trips });
    } catch (reason) {
      setError(reason instanceof CsvError ? reason.message : 'That file couldn’t be read as a CSV.');
    }
  };

  const run = async (trips: CsvTrip[]) => {
    const picked = trips.filter((t) => chosen.has(t.key));
    const built: Trip[] = [];
    const lines: string[] = [];
    for (const [index, source] of picked.entries()) {
      setStage({ kind: 'working', index, count: picked.length, done: 0, total: source.rows.length });
      try {
        const result = await buildTrip(source, lookup, (done, total) =>
          setStage({ kind: 'working', index, count: picked.length, done, total }),
        );
        built.push(result.trip);
        lines.push(`${source.title}: ${result.trip.days.length} days, ${result.places} places on the map, ${result.plans} other plans.`);
      } catch (reason) {
        lines.push(`${source.title}: ${reason instanceof CsvError ? reason.message : 'couldn’t be imported. Check your connection.'}`);
      }
    }
    if (built.length) onImport(built);
    setStage({ kind: 'finished', lines });
  };

  return (
    <dialog ref={dialog} className="day-dialog import-dialog" onClose={onClose}>
      <h2>Import trips</h2>

      {stage.kind === 'pick' && (
        <>
          <p className="muted small dialog-hint">
            A CSV with one row per plan: trip_id, trip_title, date_iso, time_slot, activity_or_item, location_or_route, and optionally
            overnight_stay, cost_amount, cost_currency and notes_or_links. Each trip becomes its own trip here.
          </p>
          <input
            ref={fileInput}
            type="file"
            hidden
            aria-label="CSV file to import"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void open(file);
            }}
          />
          {error && <p className="error-text small dialog-hint">{error}</p>}
          <div className="dialog-row spread">
            <button className="text-button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="primary" onClick={() => fileInput.current?.click()}>Choose CSV file</button>
          </div>
        </>
      )}

      {stage.kind === 'choose' && (
        <>
          <ul className="import-list">
            {stage.trips.map((t) => (
              <li key={t.key}>
                <label className="import-row">
                  <input
                    type="checkbox"
                    checked={chosen.has(t.key)}
                    onChange={() =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (!next.delete(t.key)) next.add(t.key);
                        return next;
                      })
                    }
                  />
                  <span className="clip grow">
                    <span className="import-name">{t.title}</span>
                    <span className="import-detail muted small">{t.rows.length} rows</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="muted small dialog-hint">Each place is looked up on Google Maps. This takes about a minute for a long trip.</p>
          <div className="dialog-row spread">
            <button className="text-button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="primary" disabled={chosen.size === 0} onClick={() => void run(stage.trips)}>
              Import {chosen.size} trip{chosen.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      {stage.kind === 'working' && (
        <p className="import-summary muted" role="status">
          {stage.count > 1 && `Trip ${stage.index + 1} of ${stage.count}: `}finding places {stage.done} of {stage.total}…
        </p>
      )}

      {stage.kind === 'finished' && (
        <>
          <ul className="import-results">{stage.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <div className="dialog-row">
            <button className="primary" onClick={() => dialog.current?.close()}>Done</button>
          </div>
        </>
      )}
    </dialog>
  );
}
