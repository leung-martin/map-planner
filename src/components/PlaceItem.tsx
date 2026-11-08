import { useEffect, useMemo, useRef } from 'react';
import type { PlaceDetails, PlacePhoto } from '../maps/provider';
import { dayColor, dayNumber, googleMapsUrl, UNSCHEDULED_COLOR } from '../trip';
import type { SavedPlace, Trip } from '../types';
import { LazyField } from './LazyField';
import { ScoreMeters, ScoreStrip } from './Scores';

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
      <img src={src} alt={name} width={photo.width} height={photo.height} />
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
  const name = loaded?.name ?? (details === 'error' ? 'Saved place' : 'Loading…');
  const day = trip.days.find((d) => d.id === place.dayId);

  return (
    <li ref={element} className={expanded ? 'place expanded' : 'place'}>
      <div className="place-row">
        <button
          className={place.mustHave ? 'star on' : 'star'}
          aria-pressed={Boolean(place.mustHave)}
          aria-label={`Must-have: ${name}`}
          onClick={() => onChange({ mustHave: !place.mustHave })}
        >
          {place.mustHave ? '★' : '☆'}
        </button>
        <button className="place-main" onClick={onToggle} aria-expanded={expanded}>
          <span className="clip">
            <span className="place-name">{name}</span>
            <span className="muted small place-location">
              {loaded ? loaded.shortLocation : details === 'error' ? 'Details need a connection' : ' '}
            </span>
          </span>
        </button>
        {day && (
          <span className="dot" style={{ background: day ? dayColor(day) : UNSCHEDULED_COLOR }} title={`Day ${dayNumber(trip, day.id)}`}>
            {dayNumber(trip, day.id)}
          </span>
        )}
        <a className="maps-link" href={googleMapsUrl(place.placeId, loaded?.name ?? 'place')} target="_blank" rel="noreferrer">
          Maps ↗
        </a>
      </div>

      {!expanded && place.scores && <ScoreStrip scores={place.scores} />}
      {!expanded && place.notes && <p className="muted small note-peek">{place.notes}</p>}

      {expanded && (
        <div className="place-extra">
          {loaded?.photo && <Photo photo={loaded.photo} name={loaded.name} />}
          {place.scores && <ScoreMeters scores={place.scores} />}
          <label>
            Note
            <LazyField label="Note" multiline value={place.notes} onCommit={(notes) => onChange({ notes })} />
          </label>
          <button className="text-button danger" onClick={onRemove}>Remove from trip</button>
        </div>
      )}
    </li>
  );
}
