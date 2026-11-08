import { useEffect, useMemo, useRef } from 'react';
import type { PlaceDetails, PlacePhoto } from '../maps/provider';
import { dayColor, dayLabel, dayNumber, googleMapsUrl, UNSCHEDULED_COLOR } from '../trip';
import type { SavedPlace, Trip } from '../types';
import { LazyField } from './LazyField';

type Props = {
  trip: Trip;
  place: SavedPlace;
  details: PlaceDetails | 'error' | undefined;
  expanded: boolean;
  onToggle(): void;
  onChange(patch: Partial<SavedPlace>): void;
  onRemove(): void;
};

// Mounted only when a place is opened, so a photo is requested (and counted) only on tap.
function Photo({ photo, name }: { photo: PlacePhoto; name: string }) {
  const src = useMemo(() => photo.url(640), [photo]);
  return (
    <figure className="photo">
      <img src={src} alt={name} />
      <figcaption className="muted small">
        Photo:{' '}
        {photo.credits.map((credit, index) => (
          <span key={credit.name + index}>
            {index > 0 && ', '}
            {credit.uri ? <a href={credit.uri} target="_blank" rel="noreferrer">{credit.name}</a> : credit.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function PlaceItem({ trip, place, details, expanded, onToggle, onChange, onRemove }: Props) {
  const element = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (expanded) element.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [expanded]);

  const loaded = details && details !== 'error' ? details : null;
  const name = place.nickname || loaded?.name || (details === 'error' ? 'Saved place' : 'Loading…');
  const day = trip.days.find((d) => d.id === place.dayId);
  const days = trip.days.filter((d) => d.cityIds.includes(place.cityId));
  const color = day ? dayColor(day) : UNSCHEDULED_COLOR;

  return (
    <li ref={element} className={expanded ? 'place expanded' : 'place'}>
      <div className="place-row">
        <button className="place-main" onClick={onToggle} aria-expanded={expanded}>
          <span className="dot" style={{ background: color }}>{day ? dayNumber(trip, day.id) : '•'}</span>
          <span className="clip">
            <span className="place-name">{name}</span>
            <span className="muted small place-location">
              {loaded ? (place.nickname ? `${loaded.name} · ${loaded.shortLocation}` : loaded.shortLocation)
                : details === 'error' ? 'Details need a connection' : ' '}
            </span>
          </span>
        </button>
        <a
          className="maps-link"
          href={googleMapsUrl(place.placeId, loaded?.name ?? (place.nickname || 'place'))}
          target="_blank"
          rel="noreferrer"
        >
          Maps ↗
        </a>
      </div>

      <select
        className="day-select"
        style={{ borderLeftColor: color }}
        aria-label={`Day for ${name}`}
        value={place.dayId ?? ''}
        onChange={(event) => onChange({ dayId: event.target.value || null })}
      >
        <option value="">Not scheduled</option>
        {days.map((d) => <option key={d.id} value={d.id}>{dayLabel(trip, d)}</option>)}
      </select>

      {!expanded && place.notes && <p className="muted small note-peek">{place.notes}</p>}

      {expanded && (
        <div className="place-extra">
          {loaded?.photo && <Photo photo={loaded.photo} name={loaded.name} />}
          <label>
            Nickname <span className="muted small">(readable without signal)</span>
            <LazyField label="Nickname" value={place.nickname} onCommit={(nickname) => onChange({ nickname })} />
          </label>
          <label>
            Notes
            <LazyField label="Notes" multiline value={place.notes} onCommit={(notes) => onChange({ notes })} />
          </label>
          <button className="text-button danger" onClick={onRemove}>Remove from trip</button>
        </div>
      )}
    </li>
  );
}
