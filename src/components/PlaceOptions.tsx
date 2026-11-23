import { Clock, House } from 'lucide-react';
import { assignableDays, dayLabel, isEntry } from '../trip';
import type { SavedPlace, Trip } from '../types';

type Props = {
  trip: Trip;
  place: SavedPlace;
  onChange(patch: Partial<SavedPlace>): void;
  onNewDay(): void;
};

const NO_DAY = '';
const NEW_DAY = 'new';

export function PlaceOptions({ trip, place, onChange, onNewDay }: Props) {
  return (
    <div className="place-options">
      <div className="place-options-row">
        <select
          aria-label="Day"
          value={place.dayId ?? NO_DAY}
          onChange={(event) => {
            const { value } = event.target;
            if (value === NEW_DAY) onNewDay();
            else onChange({ dayId: value === NO_DAY ? null : value });
          }}
        >
          <option value={NO_DAY}>No day yet</option>
          {assignableDays(trip, place).map((day) => <option key={day.id} value={day.id}>{dayLabel(trip, day)}</option>)}
          <option value={NEW_DAY}>+ New day</option>
        </select>
        {!isEntry(place) && (
          <button
            className={place.homeBase ? 'home-toggle on' : 'home-toggle'}
            aria-pressed={Boolean(place.homeBase)}
            onClick={() => onChange({ homeBase: !place.homeBase })}
          >
            <House size={18} aria-hidden="true" /> Home base
          </button>
        )}
      </div>
      <div className="place-options-row time-row">
        <Clock size={18} className="muted" aria-hidden="true" />
        <input
          type="time"
          aria-label="Start time"
          value={place.time ?? ''}
          onChange={(event) => onChange({ time: event.target.value || undefined })}
        />
        <span className="muted">to</span>
        <input
          type="time"
          aria-label="End time"
          value={place.endTime ?? ''}
          onChange={(event) => onChange({ endTime: event.target.value || undefined })}
        />
      </div>
    </div>
  );
}
