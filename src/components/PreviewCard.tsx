import { useState } from 'react';
import type { PlaceDetails } from '../maps/provider';
import { googleMapsUrl } from '../trip';
import type { SavedPlace, Trip } from '../types';

type Props = {
  trip: Trip;
  details: PlaceDetails;
  existing: SavedPlace | undefined;
  defaultCityId: string;
  onSave(cityId: string, mustHave: boolean): void;
  onShowExisting(place: SavedPlace): void;
  onCancel(): void;
};

export function PreviewCard({ trip, details, existing, defaultCityId, onSave, onShowExisting, onCancel }: Props) {
  const [cityId, setCityId] = useState(defaultCityId);

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
          {trip.cities.length > 1 && (
            <select aria-label="City" value={cityId} onChange={(event) => setCityId(event.target.value)}>
              {trip.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          )}
          <div className="preview-actions">
            <button className="primary grow" onClick={() => onSave(cityId, true)}>★ Must-have</button>
            <button className="grow" onClick={() => onSave(cityId, false)}>Maybe</button>
            <button className="text-button" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </section>
  );
}
