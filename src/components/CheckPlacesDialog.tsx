import { Check as CheckIcon, MapPin, MapPinOff, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkPlace, notesWithTitle, type Check } from '../checkPlaces';
import type { MapsProvider, PlaceDetails } from '../maps/provider';
import { dayColor, dayNumber, dayRoute, isEntry, timeRange } from '../trip';
import type { Bounds, SavedPlace, Trip } from '../types';
import { SearchBox } from './SearchBox';

type Props = {
  trip: Trip;
  provider: MapsProvider;
  details: Record<string, PlaceDetails | 'error'>;
  onUpdate(change: (current: Trip) => Trip): void;
  /** Closes the dialog and selects the item on the board. */
  onShow(id: string): void;
  onClose(): void;
};

type Tab = 'missing' | 'pinned' | 'skipped';

const TABS: { key: Tab; label: string }[] = [
  { key: 'missing', label: 'Needs a pin' },
  { key: 'pinned', label: 'On the map' },
  { key: 'skipped', label: 'Not places' },
];

const tabOf = (check: Check): Tab => (check.status === 'same-spot' ? 'pinned' : check.status);

/** A box about 30 km across, to keep a search near where that day is. */
const around = (lat: number, lng: number): Bounds => ({ north: lat + 0.15, south: lat - 0.15, east: lng + 0.2, west: lng - 0.2 });

/**
 * Every item in the trip with how it landed on the map, to pin what an import missed,
 * fix what it matched wrongly, and set aside what isn't a place.
 */
export function CheckPlacesDialog({ trip, provider, details, onUpdate, onShow, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('missing');
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const names = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [id, info] of Object.entries(details)) if (info !== 'error') result[id] = info.name;
    return result;
  }, [details]);

  const items = trip.places.map((place) => ({ place, check: checkPlace(place, trip, names) }));
  const counts = Object.fromEntries(TABS.map(({ key }) => [key, items.filter((i) => tabOf(i.check) === key).length])) as Record<Tab, number>;

  // Grouped by day in trip order, then the unscheduled ones.
  const groups = [...trip.days.map((day) => ({ day, key: day.id })), { day: null, key: 'none' }]
    .map(({ day, key }) => ({
      day,
      key,
      items: items.filter((i) => tabOf(i.check) === tab && (day ? i.place.dayId === day.id : !trip.days.some((d) => d.id === i.place.dayId))),
    }))
    .filter((group) => group.items.length > 0);

  /** Where to search for an item: near its day's pins in its city, else anywhere in its city, else its day. */
  const biasFor = (place: SavedPlace): Bounds | null => {
    const located = (p: SavedPlace) => {
      const info = !isEntry(p) ? details[p.placeId] : undefined;
      return info && info !== 'error' ? info.location : null;
    };
    const sameCity = trip.places.filter((p) => p.cityId === place.cityId);
    const anchor =
      sameCity.filter((p) => p.dayId && p.dayId === place.dayId).map(located).find(Boolean) ??
      sameCity.map(located).find(Boolean) ??
      trip.places.filter((p) => p.dayId && p.dayId === place.dayId).map(located).find(Boolean);
    return anchor ? around(anchor.lat, anchor.lng) : null;
  };

  const pin = (place: SavedPlace, found: PlaceDetails, check: Check) => {
    setSearchingId(null);
    if (check.status === 'missing' && check.inList) {
      // One of several places in a plan gets its own pin beside it; the plan goes once they all have one.
      onUpdate((current) => {
        const index = current.places.findIndex((p) => p.id === place.id);
        const day = current.days.find((d) => d.id === place.dayId);
        const city = current.cities.find((c) => c.name.toLowerCase() === found.city.toLowerCase());
        const added: SavedPlace = {
          id: crypto.randomUUID(),
          placeId: found.placeId,
          cityId: city && (!day || day.cityIds.includes(city.id)) ? city.id : place.cityId,
          dayId: place.dayId,
          mustHave: true,
          notes: notesWithTitle(place),
          ...(place.time ? { time: place.time } : {}),
          ...(place.endTime ? { endTime: place.endTime } : {}),
        };
        const places = [...current.places];
        places.splice(index + 1, 0, added);
        const next = { ...current, places };
        const after = checkPlace(place, next, { ...names, [found.placeId]: found.name });
        return after.status === 'same-spot' ? { ...next, places: places.filter((p) => p.id !== place.id) } : next;
      });
      return;
    }
    onUpdate((current) => ({
      ...current,
      places: current.places.map((p) => {
        if (p.id !== place.id) return p;
        const day = current.days.find((d) => d.id === p.dayId);
        const city = current.cities.find((c) => c.name.toLowerCase() === found.city.toLowerCase());
        const cityId = city && (!day || day.cityIds.includes(city.id)) ? city.id : p.cityId;
        return { ...p, placeId: found.placeId, cityId, notes: notesWithTitle(p), title: undefined, noPin: undefined };
      }),
    }));
  };

  const unpin = (place: SavedPlace) =>
    onUpdate((current) => ({
      ...current,
      places: current.places.map((p) => {
        if (p.id !== place.id) return p;
        const name = names[p.placeId] ?? p.where ?? 'Plan';
        // The first line of an imported pin's notes is what the itinerary said to do there.
        const [first, ...rest] = p.notes.split('\n');
        const title = first && !/^(cost|time|date):/i.test(first) ? first : name;
        return { ...p, placeId: '', homeBase: undefined, title, notes: title === first ? rest.join('\n') : p.notes, noPin: true };
      }),
    }));

  const setNoPin = (place: SavedPlace, noPin: boolean) =>
    onUpdate((current) => ({ ...current, places: current.places.map((p) => (p.id === place.id ? { ...p, noPin: noPin || undefined } : p)) }));

  const row = ({ place, check }: { place: SavedPlace; check: Check }) => {
    const info = !isEntry(place) ? details[place.placeId] : undefined;
    const title = isEntry(place) ? place.title || 'Plan' : place.notes.split('\n')[0] || (info && info !== 'error' ? info.name : 'Place');
    const searching = searchingId === place.id;
    const query = check.status === 'same-spot' ? '' : check.query;
    return (
      <li key={place.id} className={`check-row ${check.status}`}>
        <div className="check-what">
          {place.time && <span className="card-time">{timeRange(place)}</span>}
          <button className="check-title" onClick={() => onShow(place.id)} title="Show on the board">{title}</button>
          {place.where && <span className="muted small clip">Itinerary says: {place.where}</span>}
        </div>
        <div className="check-match">
          {check.status === 'pinned' && (
            <span className="check-found">
              <MapPin size={16} aria-hidden="true" />
              <span className="clip">
                {info === undefined ? 'Loading…' : info === 'error' ? 'Couldn’t load this place' : <><b>{info.name}</b> <span className="muted small">{info.shortLocation}</span></>}
              </span>
            </span>
          )}
          {check.status === 'same-spot' && (
            <span className="check-found">
              <CheckIcon size={16} aria-hidden="true" />
              <span className="clip">At <b>{names[check.at.placeId]}</b></span>
            </span>
          )}
          {check.status === 'missing' && (
            <span className="check-found missing">
              <MapPinOff size={16} aria-hidden="true" /> {check.inList ? <span className="clip">Not on the map: {check.query}</span> : 'Not on the map'}
            </span>
          )}
          {check.status === 'skipped' && <span className="check-found muted"><MapPinOff size={16} aria-hidden="true" /> No pin</span>}
          <span className="check-actions">
            {check.status !== 'same-spot' && (
              <button className="chip" aria-expanded={searching} onClick={() => setSearchingId(searching ? null : place.id)}>
                <Search size={15} aria-hidden="true" /> {check.status === 'pinned' ? 'Change' : 'Find'}
              </button>
            )}
            {check.status === 'pinned' && <button className="chip" onClick={() => unpin(place)}><MapPinOff size={15} aria-hidden="true" /> Unpin</button>}
            {check.status === 'missing' && <button className="chip" onClick={() => setNoPin(place, true)}>Not a place</button>}
            {check.status === 'skipped' && place.noPin && query && <button className="chip" onClick={() => setNoPin(place, false)}>Undo</button>}
          </span>
        </div>
        {searching && (
          <div className="check-search">
            <SearchBox
              key={place.id}
              autoFocus
              initialQuery={query}
              placeholder="Search Google Maps"
              search={(text) => provider.searchPlaces(text, biasFor(place))}
              onPick={(suggestion) => {
                setError('');
                suggestion.resolve().then((found) => pin(place, found, check)).catch(() => setError('Couldn’t load that place. Try again.'));
              }}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <dialog ref={dialog} className="day-dialog check-dialog" onClose={onClose}>
      <h2>Check places on the map</h2>
      <button className="icon-button dialog-close" aria-label="Close" onClick={() => dialog.current?.close()}>
        <X size={20} aria-hidden="true" />
      </button>
      <div className="check-tabs" role="tablist">
        {TABS.map(({ key, label }) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>
            {label} <span className="check-count">{counts[key]}</span>
          </button>
        ))}
      </div>
      <p className="muted small dialog-hint">
        {tab === 'missing' && 'These name a place but have no pin. Find each on Google Maps, or mark it as not a place.'}
        {tab === 'pinned' && 'Make sure each pin is the right spot. Change it if the match is wrong.'}
        {tab === 'skipped' && 'Flights, routes and things like “Wake” that happen somewhere already on the map. You can still pin any of them.'}
      </p>
      {error && <p className="error small" role="alert">{error}</p>}
      <div className="check-list">
        {groups.length === 0 && <p className="muted check-empty">{tab === 'missing' ? 'Everything that names a place is on the map.' : 'Nothing here.'}</p>}
        {groups.map(({ day, key, items: groupItems }) => (
          <section key={key}>
            <h3 className="check-day">
              {day ? (
                <>
                  <span className="dot" style={{ background: dayColor(day) }}>{dayNumber(trip, day.id)}</span> {dayRoute(trip, day)}
                  {day.date && <span className="muted small"> · {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                </>
              ) : 'Not on a day'}
            </h3>
            <ul>{groupItems.map(row)}</ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}
