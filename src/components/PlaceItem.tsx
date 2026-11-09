import { House, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PlaceDetails, PlacePhoto } from '../maps/provider';
import { dayColor, dayNumber, googleMapsUrl } from '../trip';
import type { SavedPlace, Trip } from '../types';
import { MapsLink } from './Hud';
import { LazyField } from './LazyField';
import { PlaceOptions } from './PlaceOptions';
import { ScoreStack, ScoreTotal } from './Scores';

type Props = {
  trip: Trip;
  place: SavedPlace;
  details: PlaceDetails | 'error' | undefined;
  expanded: boolean;
  onToggle(): void;
  onChange(patch: Partial<SavedPlace>): void;
  onNewDay(): void;
  onRemove(): void;
};

// Mounted only when a place is opened, so a photo is requested (and counted) only on tap.
function Photo({ photo, name }: { photo: PlacePhoto; name: string }) {
  const src = useMemo(() => photo.url(640), [photo]);
  return (
    <img className="photo" src={src} alt={name} width={photo.width} height={photo.height} />
  );
}

export function PlaceItem({ trip, place, details, expanded, onToggle, onChange, onNewDay, onRemove }: Props) {
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
        {place.homeBase ? (
          <span className="home-mark" title="Home base"><House size={20} aria-hidden="true" /></span>
        ) : (
          <button
            className={place.mustHave ? 'star on' : 'star'}
            aria-pressed={Boolean(place.mustHave)}
            aria-label={`Must-have: ${name}`}
            onClick={() => onChange({ mustHave: !place.mustHave })}
          >
            {place.mustHave ? '★' : '☆'}
          </button>
        )}
        <button className="place-main" onClick={onToggle} aria-expanded={expanded}>
          <span className="clip">
            <span className="place-name">{name}</span>
            <span className="muted small place-location">
              {loaded ? loaded.shortLocation : details === 'error' ? 'Details need a connection' : ' '}
            </span>
          </span>
        </button>
        {day && (
          <span className="dot" style={{ background: dayColor(day) }} title={`Day ${dayNumber(trip, day.id)}`}>
            {dayNumber(trip, day.id)}
          </span>
        )}
        <MapsLink href={googleMapsUrl(place.placeId, loaded?.name ?? 'place')} name={name} />
        {place.scores && !expanded && <ScoreStack scores={place.scores} />}
        {place.scores && <ScoreTotal scores={place.scores} />}
      </div>

      {!expanded && place.notes && <p className="muted small note-peek">{place.notes}</p>}

      {expanded && (
        <div className="place-extra">
          <PlaceOptions trip={trip} place={place} onChange={onChange} onNewDay={onNewDay} />
          {loaded?.photo && <Photo photo={loaded.photo} name={loaded.name} />}
          {place.scores && <ScoreStack scores={place.scores} labels />}
          <label>
            Note
            <LazyField label="Note" multiline value={place.notes} onCommit={(notes) => onChange({ notes })} />
          </label>
          <button className="icon-button danger remove-place" title="Remove from trip" aria-label={`Remove ${name} from trip`} onClick={onRemove}>
            <Trash2 size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}
