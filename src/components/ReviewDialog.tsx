import { useEffect, useRef, useState } from 'react';
import { distanceKm } from '../importKml';
import type { MapsProvider, PlaceDetails } from '../maps/provider';
import type { LatLng, Trip } from '../types';

export type ReviewPin = {
  name: string;
  location: LatLng;
  /** Search text, when it should differ from the name. */
  query?: string;
  why?: string;
};

/** A list of candidate places to match against Google and confirm, from a file or from Gemini. */
export type ReviewRequest = {
  title: string;
  pins: ReviewPin[];
  skipped: number;
  /** A match further than this from its pin is probably a different place. */
  farKm: number;
  farNote: string;
  preselect: boolean;
  starByDefault: boolean;
  cityId: string;
};

type Lookup = PlaceDetails | 'none' | 'error' | undefined;
type Note = 'saved' | 'repeat' | 'far' | null;

type Props = {
  trip: Trip;
  provider: MapsProvider;
  request: ReviewRequest;
  onSave(cityId: string, placeIds: string[], mustHave: boolean): void;
  onClose(): void;
};

export function ReviewDialog({ trip, provider, request, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { pins } = request;
  const [lookups, setLookups] = useState<Lookup[]>(() => pins.map(() => undefined));
  // Rows the user has changed from their default of ticked or unticked.
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [cityId, setCityId] = useState(request.cityId);
  const [star, setStar] = useState(request.starByDefault);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let stale = false;
    pins.forEach(async (pin, index) => {
      let result: Lookup;
      try {
        const placeId = await provider.matchPlace(pin.query ?? pin.name, pin.location);
        result = placeId ? await provider.getPlace(placeId) : 'none';
      } catch {
        result = 'error';
      }
      if (!stale) setLookups((current) => current.map((old, i) => (i === index ? result : old)));
    });
    return () => {
      stale = true;
    };
  }, [provider, pins]);

  const done = lookups.filter((lookup) => lookup !== undefined).length;
  const finished = done === pins.length;

  const seen = new Set<string>();
  const rows = pins.map((pin, index) => {
    const lookup = lookups[index];
    const details = lookup && typeof lookup === 'object' ? lookup : null;
    let note: Note = null;
    if (details) {
      if (trip.places.some((place) => place.placeId === details.placeId)) note = 'saved';
      else if (seen.has(details.placeId)) note = 'repeat';
      else if (distanceKm(pin.location, details.location) > request.farKm) note = 'far';
      seen.add(details.placeId);
    }
    const selectable = details !== null && note !== 'saved' && note !== 'repeat';
    const byDefault = selectable && note !== 'far' && request.preselect;
    return { pin, lookup, details, note, selectable, checked: selectable && byDefault !== flipped.has(index) };
  });

  const noteText = { saved: 'Already in this trip', repeat: 'Listed twice', far: request.farNote };
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
      <h2>{request.title}</h2>

      <p className="import-summary muted" role="status">
        {finished
          ? `${chosen.length} of ${pins.length} selected${missed ? `, ${missed} not found` : ''}.`
          : `Matching places: ${done} of ${pins.length}`}
        {request.skipped > 0 && ` ${request.skipped} drawn line${request.skipped === 1 ? '' : 's'} left out.`}
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
                  {details && [!pin.why && details.name !== pin.name ? `Your pin: ${pin.name}` : '', details.shortLocation].filter(Boolean).join(' · ')}
                </span>
                {pin.why && <span className="import-why small">{pin.why}</span>}
                {note && <span className={note === 'far' ? 'import-note warn small' : 'import-note muted small'}>{noteText[note]}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <label className="import-star">
        <input type="checkbox" checked={star} onChange={(event) => setStar(event.target.checked)} />
        Star these as must-haves
      </label>

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
        <button className="primary" disabled={!finished || chosen.length === 0} onClick={() => onSave(cityId, chosen, star)}>
          Add {chosen.length} place{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </dialog>
  );
}
