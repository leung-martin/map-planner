import { LayoutGrid, Pencil, Plus } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import type { PlaceDetails } from '../maps/provider';
import { dayColor, dayNumber, dayRoute, googleMapsUrl } from '../trip';
import type { Day, SavedPlace, Trip } from '../types';
import { MapsLink } from './Hud';
import { ScoreStrip } from './Scores';

type Props = {
  trip: Trip;
  places: SavedPlace[];
  days: Day[];
  details: Record<string, PlaceDetails | 'error'>;
  selectedId: string | null;
  focus: string;
  unscheduledKey: string;
  canAutoGroup: boolean;
  onSelect(id: string | null): void;
  onMove(placeId: string, dayId: string | null): void;
  onFocus(key: string): void;
  onAddDay(): void;
  onEditDay(dayId: string): void;
  onAutoGroup(): void;
};

const starredFirst = (a: SavedPlace, b: SavedPlace) => Number(Boolean(b.mustHave)) - Number(Boolean(a.mustHave));

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function DayBoard({
  trip, places, days, details, selectedId, focus, unscheduledKey, canAutoGroup,
  onSelect, onMove, onFocus, onAddDay, onEditDay, onAutoGroup,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const dragging = places.find((place) => place.id === draggingId);
  const selected = places.find((place) => place.id === selectedId);
  const accepts = (place: SavedPlace | undefined, day: Day) => !place || day.cityIds.includes(place.cityId);

  const nameOf = (place: SavedPlace) => {
    const info = details[place.placeId];
    return info && info !== 'error' ? info.name : info === 'error' ? 'Saved place' : 'Loading…';
  };

  const card = (place: SavedPlace) => {
    const info = details[place.placeId];
    return (
      <li key={place.id}>
        <button
          className={['card', place.id === selectedId && 'selected', !place.mustHave && 'maybe'].filter(Boolean).join(' ')}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', place.id);
            event.dataTransfer.effectAllowed = 'move';
            setDraggingId(place.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setOverKey(null);
          }}
          onClick={() => onSelect(place.id === selectedId ? null : place.id)}
        >
          <span className="card-name">
            {place.mustHave && <span className="card-star" aria-label="Must-have">★ </span>}
            {nameOf(place)}
          </span>
          <span className="card-location muted small">{info && info !== 'error' ? info.shortLocation : ' '}</span>
          {place.scores && <ScoreStrip scores={place.scores} />}
        </button>
      </li>
    );
  };

  const dropProps = (key: string, dayId: string | null, allowed: boolean) => ({
    onDragOver: (event: DragEvent) => {
      if (!allowed) return;
      event.preventDefault();
      if (overKey !== key) setOverKey(key);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverKey(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setOverKey(null);
      setDraggingId(null);
      if (allowed) onMove(event.dataTransfer.getData('text/plain'), dayId);
    },
  });

  const columnClass = (key: string, allowed: boolean) =>
    ['column', overKey === key && 'can-drop', !allowed && 'blocked', focus === key && 'focused'].filter(Boolean).join(' ');

  const tray = places.filter((place) => place.dayId === null).sort(starredFirst);

  return (
    <section className="board-panel">
      <div className="board-tools">
        <h2 className="bar-title">Days</h2>
        <p className="muted small grow">Drag places onto days, or tap one and choose a day.</p>
        {canAutoGroup && <button className="chip add" onClick={onAutoGroup}><LayoutGrid size={17} aria-hidden="true" /> Auto-group</button>}
        <button className="chip add" onClick={onAddDay}><Plus size={17} aria-hidden="true" /> Day</button>
      </div>

      <div className="board">
        <div className={columnClass(unscheduledKey, true)} {...dropProps(unscheduledKey, null, true)}>
          <h3 className="column-head">
            <button className="column-title" aria-pressed={focus === unscheduledKey} onClick={() => onFocus(unscheduledKey)}>
              To place <span className="muted small">{tray.length}</span>
            </button>
          </h3>
          <ul className="column-list">{tray.map(card)}</ul>
        </div>

        {days.map((day) => {
          const number = dayNumber(trip, day.id);
          const dayPlaces = places.filter((place) => place.dayId === day.id).sort(starredFirst);
          const allowed = accepts(dragging ?? selected, day);
          return (
            <div key={day.id} className={columnClass(day.id, allowed)} data-day={number} {...dropProps(day.id, day.id, allowed)}>
              <h3 className="column-head">
                <button className="column-title" aria-pressed={focus === day.id} onClick={() => onFocus(day.id)}>
                  <span className="dot" style={{ background: dayColor(day) }}>{number}</span>
                  <span className="clip grow">
                    {dayRoute(trip, day)}
                    {day.date && <span className="muted small"> · {formatDate(day.date)}</span>}
                  </span>
                </button>
                <button className="text-button" title="Edit day" aria-label={`Edit day ${number}`} onClick={() => onEditDay(day.id)}>
                  <Pencil size={17} aria-hidden="true" />
                </button>
              </h3>
              <ul className="column-list">{dayPlaces.map(card)}</ul>
            </div>
          );
        })}

        <button className="column-add" onClick={onAddDay}><Plus size={18} aria-hidden="true" /> Add a day</button>
      </div>

      {selected && (
        <div className="move-bar">
          <span className="move-name clip">{nameOf(selected)}</span>
          <MapsLink href={googleMapsUrl(selected.placeId, nameOf(selected))} name={nameOf(selected)} />
          <div className="chips" role="group" aria-label="Move to day">
            <button className={selected.dayId === null ? 'chip active' : 'chip'} onClick={() => onMove(selected.id, null)}>To place</button>
            {days.filter((day) => accepts(selected, day)).map((day) => (
              <button
                key={day.id}
                className={day.id === selected.dayId ? 'chip day active' : 'chip day'}
                style={{ '--chip-color': dayColor(day) } as React.CSSProperties}
                aria-label={`Move to day ${dayNumber(trip, day.id)}`}
                onClick={() => onMove(selected.id, day.id)}
              >
                {dayNumber(trip, day.id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
