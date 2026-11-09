import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { dayNumber, moveDay, removeDay, updateDay } from '../trip';
import type { Day, Trip } from '../types';

type Props = {
  trip: Trip;
  day: Day;
  onUpdate(change: (trip: Trip) => Trip): void;
  onClose(): void;
};

export function DayDialog({ trip, day, onUpdate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const [start, end] = day.cityIds;
  const number = dayNumber(trip, day.id);
  const setCities = (cityIds: string[]) => onUpdate((t) => updateDay(t, day.id, { cityIds }));

  return (
    <dialog ref={dialog} className="day-dialog" onClose={onClose}>
      <h2>Day {number}</h2>
      <label>
        Starts in
        <select
          value={start}
          onChange={(event) => setCities(event.target.value === end ? [event.target.value] : [event.target.value, ...(end ? [end] : [])])}
        >
          {trip.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
        </select>
      </label>
      <label>
        Ends in
        <select value={end ?? ''} onChange={(event) => setCities(event.target.value ? [start, event.target.value] : [start])}>
          <option value="">Same city</option>
          {trip.cities.filter((city) => city.id !== start).map((city) => (
            <option key={city.id} value={city.id}>{city.name}</option>
          ))}
        </select>
      </label>
      <label>
        Date <span className="muted small">(optional)</span>
        <input
          type="date"
          value={day.date ?? ''}
          onChange={(event) => onUpdate((t) => updateDay(t, day.id, { date: event.target.value || null }))}
        />
      </label>
      <div className="dialog-row">
        <button disabled={number === 1} onClick={() => onUpdate((t) => moveDay(t, day.id, -1))}><ArrowLeft size={18} aria-hidden="true" /> Earlier</button>
        <button disabled={number === trip.days.length} onClick={() => onUpdate((t) => moveDay(t, day.id, 1))}>Later <ArrowRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="dialog-row spread">
        <button
          className="text-button danger"
          onClick={() => {
            if (window.confirm(`Delete Day ${number}? Its places stay in the trip as not scheduled.`)) {
              onUpdate((t) => removeDay(t, day.id));
              onClose();
            }
          }}
        >
          <Trash2 size={17} aria-hidden="true" /> Delete day
        </button>
        <button className="primary" onClick={() => dialog.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}
