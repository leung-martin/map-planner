import { useState } from 'react';
import type { PlaceDetails } from '../maps/provider';
import { dayLabel, googleMapsUrl } from '../trip';
import type { SavedPlace, Trip } from '../types';

type Props = {
  trip: Trip;
  details: PlaceDetails;
  existing: SavedPlace | undefined;
  defaultCityId: string;
  defaultDayId: string | null;
  onSave(cityId: string, dayId: string | null): void;
  onShowExisting(place: SavedPlace): void;
  onCancel(): void;
};

export function PreviewCard({
  trip, details, existing, defaultCityId, defaultDayId, onSave, onShowExisting, onCancel,
}: Props) {
  const [cityId, setCityId] = useState(defaultCityId);
  const [dayId, setDayId] = useState(defaultDayId);
  const days = trip.days.filter((day) => day.cityIds.includes(cityId));

  return (
    <section className="preview" aria-label="Selected place">
      <div className="preview-head">
        <div className="clip">
          <strong>{details.name}</strong>
          <div className="muted small">{details.shortLocation}</div>
        </div>
        <a className="maps-link" href={googleMapsUrl(details.placeId, details.name)} target="_blank" rel="noreferrer">
          Maps ↗
        </a>
      </div>
      {existing ? (
        <div className="preview-actions">
          <span className="muted small grow">Already in this trip</span>
          <button onClick={() => onShowExisting(existing)}>Show it</button>
          <button className="text-button" onClick={onCancel}>Close</button>
        </div>
      ) : (
        <>
          <div className="preview-fields">
            {trip.cities.length > 1 && (
              <select
                aria-label="City"
                value={cityId}
                onChange={(event) => {
                  setCityId(event.target.value);
                  setDayId(null);
                }}
              >
                {trip.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
              </select>
            )}
            <select
              aria-label="Day"
              value={dayId ?? ''}
              onChange={(event) => setDayId(event.target.value || null)}
            >
              <option value="">Not scheduled</option>
              {days.map((day) => <option key={day.id} value={day.id}>{dayLabel(trip, day)}</option>)}
            </select>
          </div>
          <div className="preview-actions">
            <button className="primary grow" onClick={() => onSave(cityId, dayId)}>Save to trip</button>
            <button className="text-button" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </section>
  );
}
