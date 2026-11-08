import { useEffect, useRef, useState, type FormEvent } from 'react';
import { distanceKm } from '../importKml';
import type { MapsProvider } from '../maps/provider';
import { suggestionErrorMessage, type Suggester } from '../suggest';
import type { Trip } from '../types';
import type { ReviewRequest } from './ReviewDialog';

type Props = {
  trip: Trip;
  provider: MapsProvider;
  suggest: Suggester;
  defaultCityId: string;
  onResult(request: ReviewRequest): void;
  onClose(): void;
};

export function SuggestDialog({ trip, provider, suggest, defaultCityId, onResult, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [cityId, setCityId] = useState(defaultCityId);
  const [interests, setInterests] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const city = trip.cities.find((c) => c.id === cityId);
    if (!city || busy) return;
    setBusy(true);
    setError('');
    try {
      const bounds = await provider.getCityBounds(city.placeId);
      if (!bounds) throw new Error('No map area for this city');
      const center = { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 };
      const ideas = await suggest(city.name, interests);
      if (ideas.length === 0) {
        setError('Gemini didn’t have any ideas for that. Try different interests.');
        setBusy(false);
        return;
      }
      onResult({
        title: `Ideas for ${city.name}`,
        pins: ideas.map((idea) => ({ name: idea.name, why: idea.why, query: `${idea.name}, ${city.name}`, location: center })),
        skipped: 0,
        // Anything well outside the city's own area is a wrong match.
        farKm: Math.max(15, distanceKm(center, { lat: bounds.north, lng: bounds.east }) * 1.5),
        farNote: 'Outside this city, check this one',
        preselect: false,
        starByDefault: false,
        cityId: city.id,
      });
    } catch (reason) {
      setError(suggestionErrorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="day-dialog" onClose={onClose}>
      <h2>Suggest places</h2>
      <form onSubmit={submit}>
        {trip.cities.length > 1 && (
          <label>
            City
            <select value={cityId} onChange={(event) => setCityId(event.target.value)}>
              {trip.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          </label>
        )}
        <label>
          What are you into? <span className="muted small">(optional)</span>
          <input
            value={interests}
            autoFocus
            placeholder="Onsen, design museums, ramen"
            onChange={(event) => setInterests(event.target.value)}
          />
        </label>
        <p className="muted small dialog-hint">Gemini’s ideas are checked against Google Maps, and you choose which to add.</p>
        {error && <p className="error-text small dialog-hint">{error}</p>}
        <div className="dialog-row spread">
          <button type="button" className="text-button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Asking Gemini…' : 'Get ideas'}</button>
        </div>
      </form>
    </dialog>
  );
}
