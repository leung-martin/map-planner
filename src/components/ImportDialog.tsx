import { useEffect, useRef, useState } from 'react';
import { distanceKm, type ImportedPin, type ParsedKml } from '../importKml';
import type { MapsProvider, PlaceDetails } from '../maps/provider';
import type { Trip } from '../types';

type Lookup = PlaceDetails | 'none' | 'error' | undefined;

type Props = {
  trip: Trip;
  provider: MapsProvider;
  file: ParsedKml;
  defaultCityId: string;
  onSave(cityId: string, placeIds: string[]): void;
  onClose(): void;
};

// A match further than this from the original pin is probably a different place.
const FAR_KM = 1;

type Note = 'saved' | 'repeat' | 'far' | null;

function noteFor(trip: Trip, pin: ImportedPin, details: PlaceDetails, seen: Set<string>): Note {
  if (trip.places.some((place) => place.placeId === details.placeId)) return 'saved';
  if (seen.has(details.placeId)) return 'repeat';
  return distanceKm(pin.location, details.location) > FAR_KM ? 'far' : null;
}

const NOTE_TEXT = {
  saved: 'Already in this trip',
  repeat: 'Listed twice in this file',
  far: 'Far from your original pin, check this one',
};

export function ImportDialog({ trip, provider, file, defaultCityId, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [lookups, setLookups] = useState<Lookup[]>(() => file.pins.map(() => undefined));
  // Rows the user has changed from their default of ticked or unticked.
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [cityId, setCityId] = useState(defaultCityId);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let stale = false;
    file.pins.forEach(async (pin, index) => {
      let result: Lookup;
      try {
        const placeId = await provider.matchPlace(pin.name, pin.location);
        result = placeId ? await provider.getPlace(placeId) : 'none';
      } catch {
        result = 'error';
      }
      if (!stale) setLookups((current) => current.map((old, i) => (i === index ? result : old)));
    });
    return () => {
      stale = true;
    };
  }, [provider, file]);

  const done = lookups.filter((lookup) => lookup !== undefined).length;
  const finished = done === file.pins.length;

  const seen = new Set<string>();
  const rows = file.pins.map((pin, index) => {
    const lookup = lookups[index];
    const details = lookup && typeof lookup === 'object' ? lookup : null;
    const note = details ? noteFor(trip, pin, details, seen) : null;
    if (details) seen.add(details.placeId);
    const selectable = details !== null && note !== 'saved' && note !== 'repeat';
    const byDefault = selectable && note !== 'far';
    return { pin, lookup, details, note, selectable, checked: selectable && byDefault !== flipped.has(index) };
  });

  const chosen = rows.filter((row) => row.checked).map((row) => row.details!.placeId);
  const missed = rows.filter((row) => row.lookup === 'none' || row.lookup === 'error').length;

  const toggle = (index: number) =>
    setFlipped((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <dialog ref={dialog} className="day-dialog import-dialog" onClose={onClose}>
      <h2>Import{file.title ? `: ${file.title}` : ''}</h2>

      <p className="import-summary muted" role="status">
        {finished
          ? `${chosen.length} of ${file.pins.length} ready to add${missed ? `, ${missed} not found` : ''}.`
          : `Matching places: ${done} of ${file.pins.length}`}
        {file.skipped > 0 && ` ${file.skipped} drawn line${file.skipped === 1 ? '' : 's'} left out.`}
      </p>

      <ul className="import-list">
        {rows.map(({ pin, lookup, details, note, selectable, checked }, index) => (
          <li key={index}>
            <label className={selectable ? 'import-row' : 'import-row disabled'}>
              <input type="checkbox" checked={checked} disabled={!selectable} onChange={() => toggle(index)} />
              <span className="clip grow">
                <span className="import-name">{details?.name ?? pin.name}</span>
                <span className="import-detail muted small">
                  {lookup === undefined && 'Matching…'}
                  {lookup === 'none' && 'No match. Search for it by hand.'}
                  {lookup === 'error' && 'Couldn’t look this up. Check your connection or daily limit.'}
                  {details && [details.name !== pin.name ? `Your pin: ${pin.name}` : '', details.shortLocation].filter(Boolean).join(' · ')}
                </span>
                {note && <span className={note === 'far' ? 'import-note warn small' : 'import-note muted small'}>{NOTE_TEXT[note]}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {trip.cities.length > 1 && (
        <label>
          Add to
          <select value={cityId} onChange={(event) => setCityId(event.target.value)}>
            {trip.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
          </select>
        </label>
      )}

      <div className="dialog-row spread">
        <button className="text-button" onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="primary" disabled={!finished || chosen.length === 0} onClick={() => onSave(cityId, chosen)}>
          Add {chosen.length} place{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </dialog>
  );
}
