import { useEffect, useRef, useState, type FormEvent } from 'react';
import { suggestionErrorMessage, type Suggester } from '../suggest';
import type { Bounds } from '../types';
import type { ReviewRequest } from './ReviewDialog';

type Props = {
  /** The city in view, or the trip's name when looking at the whole trip. */
  tripLabel: string;
  cityId: string;
  /** The part of the map showing when the dialog was opened. */
  area: Bounds;
  suggest: Suggester;
  onResult(request: ReviewRequest): void;
  onClose(): void;
};

export function SuggestDialog({ tripLabel, cityId, area, suggest, onResult, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [interests, setInterests] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const center = { lat: (area.north + area.south) / 2, lng: (area.east + area.west) / 2 };
      const ideas = await suggest(tripLabel, interests, area);
      if (ideas.length === 0) {
        setError('Gemini didn’t have any ideas for this area. Zoom out or try different interests.');
        setBusy(false);
        return;
      }
      onResult({
        title: 'Ideas for this area',
        pins: ideas.map((idea) => ({ name: idea.name, why: idea.why, location: center })),
        skipped: 0,
        within: area,
        farKm: Infinity,
        farNote: '',
        preselect: false,
        starByDefault: false,
        cityId,
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
        <label>
          What are you into? <span className="muted small">(optional)</span>
          <input
            value={interests}
            autoFocus
            placeholder="Onsen, design museums, ramen"
            onChange={(event) => setInterests(event.target.value)}
          />
        </label>
        <p className="muted small dialog-hint">Only looks in the area showing on the map. Gemini’s ideas are checked against Google Maps, and you choose which to add.</p>
        {error && <p className="error-text small dialog-hint">{error}</p>}
        <div className="dialog-row spread">
          <button type="button" className="text-button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Asking Gemini…' : 'Get ideas'}</button>
        </div>
      </form>
    </dialog>
  );
}
