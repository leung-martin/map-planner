import { ChevronLeft, ChevronRight, House, MapPinned, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type WheelEvent } from 'react';
import type { PlaceDetails } from '../maps/provider';
import { dayColor, dayNumber, dayRoute, googleMapsUrl, inDayOrder, isEntry, timeRange } from '../trip';
import type { Day, SavedPlace, Trip } from '../types';
import { MapsLink } from './Hud';
import { LazyField } from './LazyField';
import { PlaceOptions } from './PlaceOptions';
import { ScoreStack, ScoreTotal } from './Scores';

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
  onMoveBeside(placeId: string, targetId: string, after: boolean): void;
  onMoveDay(dayId: string, targetId: string): void;
  onChangePlace(placeId: string, patch: Partial<SavedPlace>): void;
  onNewDayFor(place: SavedPlace): void;
  onAddPlan(day: Day, title: string): void;
  onRemove(placeId: string): void;
  onFocus(key: string): void;
  onAddDay(): void;
  onEditDay(dayId: string): void;
  onAutoGroup(): void;
  onCheckPlaces(): void;
};

const starredFirst = (a: SavedPlace, b: SavedPlace) => Number(Boolean(b.mustHave)) - Number(Boolean(a.mustHave));

/** A one-line box at the bottom of a day for adding a plan that has no map pin. */
function AddPlan({ onAdd }: { onAdd(title: string): void }) {
  const [title, setTitle] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim());
    setTitle('');
  };
  return (
    <form className="add-plan" onSubmit={submit}>
      <input value={title} placeholder="+ Add a plan" aria-label="Add a plan to this day" onChange={(event) => setTitle(event.target.value)} />
    </form>
  );
}

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function DayBoard({
  trip, places, days, details, selectedId, focus, unscheduledKey, canAutoGroup,
  onSelect, onMove, onMoveBeside, onMoveDay, onChangePlace, onNewDayFor, onAddPlan, onRemove, onFocus, onAddDay, onEditDay, onAutoGroup, onCheckPlaces,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const [inView, setInView] = useState<string[]>([]);

  /** Which way the board can still scroll, and which days are showing. */
  const measure = useCallback(() => {
    const el = board.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    const box = el.getBoundingClientRect();
    const showing = [...el.querySelectorAll<HTMLElement>('[data-day-id]')]
      .filter((column) => {
        const r = column.getBoundingClientRect();
        return r.right > box.left + 40 && r.left < box.right - 40;
      })
      .map((column) => column.dataset.dayId!);
    setInView((prev) => (prev.join() === showing.join() ? prev : showing));
  }, []);

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure]);
  useEffect(measure, [measure, days]);

  // Whatever gets selected, on the map or elsewhere, is brought into view on the board.
  useEffect(() => {
    if (selectedId) board.current?.querySelector('.card.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const scrollPage = (direction: -1 | 1) => {
    const el = board.current;
    if (el) el.scrollBy({ left: direction * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const jumpTo = (dayId: string) => {
    const el = board.current;
    const column = el?.querySelector(`[data-day-id="${dayId}"]`);
    if (!el || !column) return;
    const offset = column.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollTo({ left: el.scrollLeft + offset - 48, behavior: 'smooth' });
  };

  // A mouse wheel over headings or gaps scrolls sideways; over a day's list it still scrolls the list.
  const onWheel = (event: WheelEvent) => {
    const el = board.current;
    if (!el || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    if ((event.target as Element).closest('.column-list, textarea, select')) return;
    el.scrollLeft += event.deltaY;
  };
  const [draggingDayId, setDraggingDayId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [overCard, setOverCard] = useState<{ id: string; after: boolean } | null>(null);

  const endDrag = () => {
    setDraggingId(null);
    setDraggingDayId(null);
    setOverKey(null);
    setOverCard(null);
  };

  const dragging = places.find((place) => place.id === draggingId);
  const selected = places.find((place) => place.id === selectedId);
  const accepts = (place: SavedPlace | undefined, day: Day) => !place || day.cityIds.includes(place.cityId);

  const nameOf = (place: SavedPlace) => {
    if (isEntry(place)) return place.title || 'Plan';
    const info = details[place.placeId];
    return info && info !== 'error' ? info.name : info === 'error' ? 'Saved place' : 'Loading…';
  };

  const card = (place: SavedPlace) => {
    const info = details[place.placeId];
    const column = days.find((day) => day.id === place.dayId);
    const canDropBeside = Boolean(dragging && column && dragging.id !== place.id && accepts(dragging, column));
    const lowerHalf = (event: DragEvent) => {
      const box = event.currentTarget.getBoundingClientRect();
      return event.clientY > box.top + box.height / 2;
    };
    return (
      <li
        key={place.id}
        className={overCard?.id === place.id ? (overCard.after ? 'drop-after' : 'drop-before') : undefined}
        onDragOver={(event) => {
          if (!canDropBeside) return;
          event.preventDefault();
          const after = lowerHalf(event);
          if (overCard?.id !== place.id || overCard.after !== after) setOverCard({ id: place.id, after });
        }}
        onDrop={(event) => {
          // A card let go over itself stays where it was.
          if (dragging?.id === place.id) event.stopPropagation();
          if (!canDropBeside) return;
          event.preventDefault();
          event.stopPropagation();
          onMoveBeside(dragging!.id, place.id, lowerHalf(event));
          endDrag();
        }}
      >
        <button
          className={['card', place.id === selectedId && 'selected', isEntry(place) ? 'entry' : !place.mustHave && 'maybe'].filter(Boolean).join(' ')}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', place.id);
            event.dataTransfer.effectAllowed = 'move';
            setDraggingId(place.id);
          }}
          onDragEnd={endDrag}
          onClick={() => onSelect(place.id === selectedId ? null : place.id)}
        >
          <span className="card-text">
            {(place.time || place.endTime) && <span className="card-time">{timeRange(place)}</span>}
            <span className="card-name">
              {place.homeBase
                ? <span className="card-star" title="Home base"><House size={15} aria-hidden="true" /> </span>
                : place.mustHave && <span className="card-star" aria-label="Must-have">★ </span>}
              {nameOf(place)}
            </span>
            {!isEntry(place) && <span className="card-location muted small">{info && info !== 'error' ? info.shortLocation : ' '}</span>}
            {place.notes && <span className="card-note small">{place.notes}</span>}
            {place.scores && <ScoreTotal scores={place.scores} />}
          </span>
          {place.scores && <ScoreStack scores={place.scores} />}
        </button>
      </li>
    );
  };

  const dropProps = (key: string, dayId: string | null, allowed: boolean) => ({
    onDragOver: (event: DragEvent) => {
      if (!allowed) return;
      event.preventDefault();
      if (overKey !== key) setOverKey(key);
      if (!(event.target as Element).closest('.column-list li')) setOverCard(null);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverKey(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (allowed && draggingDayId) {
        if (dayId) onMoveDay(draggingDayId, dayId);
      } else if (allowed && draggingId) {
        onMove(draggingId, dayId);
      }
      endDrag();
    },
  });

  const columnClass = (key: string, allowed: boolean) =>
    ['column', overKey === key && 'can-drop', !allowed && 'blocked', focus === key && 'focused'].filter(Boolean).join(' ');

  const tray = places.filter((place) => place.dayId === null && !place.homeBase).sort(starredFirst);

  return (
    <section className="board-panel">
      <div className="board-tools">
        <h2 className="bar-title">Days</h2>
        <p className="muted small grow board-hint">Drag places onto days and into order. Drag a day’s heading to move the day.</p>
        {days.length > 1 && (
          <nav className="day-jump" aria-label="Jump to a day">
            {days.map((day) => {
              const number = dayNumber(trip, day.id);
              return (
                <button
                  key={day.id}
                  className={inView.includes(day.id) ? 'in-view' : ''}
                  style={{ background: dayColor(day) }}
                  title={`Day ${number} · ${dayRoute(trip, day)}`}
                  aria-label={`Show day ${number}`}
                  onClick={() => jumpTo(day.id)}
                >
                  {number}
                </button>
              );
            })}
          </nav>
        )}
        <button className="chip add" onClick={onCheckPlaces} title="Check each place landed on the right spot"><MapPinned size={17} aria-hidden="true" /> Check places</button>
        {canAutoGroup && <button className="chip add" onClick={onAutoGroup}><LayoutGrid size={17} aria-hidden="true" /> Auto-group</button>}
        <button className="chip add" onClick={onAddDay}><Plus size={17} aria-hidden="true" /> Day</button>
      </div>

      <div className={['board-wrap', more.left && 'more-left', more.right && 'more-right'].filter(Boolean).join(' ')}>
      {more.left && (
        <button className="board-arrow left" aria-label="Scroll to earlier days" onClick={() => scrollPage(-1)} onDragOver={() => board.current?.scrollBy({ left: -24 })}>
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
      )}
      {more.right && (
        <button className="board-arrow right" aria-label="Scroll to later days" onClick={() => scrollPage(1)} onDragOver={() => board.current?.scrollBy({ left: 24 })}>
          <ChevronRight size={26} aria-hidden="true" />
        </button>
      )}
      <div className="board" ref={board} onWheel={onWheel}>
        <div className={`${columnClass(unscheduledKey, !draggingDayId)}${tray.length === 0 ? ' tray-empty' : ''}`} {...dropProps(unscheduledKey, null, !draggingDayId)}>
          <h3 className="column-head">
            <button className="column-title" aria-pressed={focus === unscheduledKey} onClick={() => onFocus(unscheduledKey)}>
              To place <span className="muted small">{tray.length}</span>
            </button>
          </h3>
          <ul className="column-list">{tray.map(card)}</ul>
        </div>

        {days.map((day) => {
          const number = dayNumber(trip, day.id);
          const dayPlaces = inDayOrder(places.filter((place) => place.dayId === day.id));
          const allowed = draggingDayId !== null || accepts(dragging ?? selected, day);
          return (
            <div key={day.id} className={columnClass(day.id, allowed)} data-day={number} data-day-id={day.id} {...dropProps(day.id, day.id, allowed)}>
              <h3
                className="column-head"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', day.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggingDayId(day.id);
                }}
                onDragEnd={endDrag}
              >
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
              <AddPlan onAdd={(title) => onAddPlan(day, title)} />
            </div>
          );
        })}

        <button className="column-add" onClick={onAddDay}><Plus size={18} aria-hidden="true" /> Add a day</button>
      </div>
      </div>

      {selected && (
        <div className="move-bar">
          {isEntry(selected) ? (
            <LazyField
              key={selected.id}
              className="move-name"
              label="Plan"
              value={selected.title ?? ''}
              onCommit={(title) => title.trim() && onChangePlace(selected.id, { title: title.trim() })}
            />
          ) : (
            <>
              <span className="move-name clip">{nameOf(selected)}</span>
              <MapsLink href={googleMapsUrl(selected.placeId, nameOf(selected))} name={nameOf(selected)} />
            </>
          )}
          <button
            className="icon-button danger"
            title="Remove from trip"
            aria-label={`Remove ${nameOf(selected)} from trip`}
            onClick={() => window.confirm(`Remove “${nameOf(selected)}” from this trip?`) && onRemove(selected.id)}
          >
            <Trash2 size={20} aria-hidden="true" />
          </button>
          <PlaceOptions
            trip={trip}
            place={selected}
            onChange={(patch) => onChangePlace(selected.id, patch)}
            onNewDay={() => onNewDayFor(selected)}
          />
          <LazyField
            key={`note-${selected.id}`}
            className="move-note"
            label="Note"
            placeholder="Add a note"
            multiline
            value={selected.notes}
            onCommit={(notes) => onChangePlace(selected.id, { notes })}
          />
        </div>
      )}
    </section>
  );
}
