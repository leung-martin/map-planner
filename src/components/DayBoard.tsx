import { ArrowRight, ChevronLeft, ChevronRight, House, Navigation, MapPin, MapPinned, MapPinOff, LayoutGrid, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { whereOf } from '../checkPlaces';
import type { PlaceDetails, Suggestion } from '../maps/provider';
import { dayColor, dayNumber, dayRoute, googleMapsUrl, inDayOrder, isEntry, timeRange } from '../trip';
import type { Day, SavedPlace, Trip } from '../types';
import { MapsLink } from './Hud';
import { LazyField } from './LazyField';
import { PlaceOptions } from './PlaceOptions';
import { PlanPlace } from './PlanPlace';
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
  /** The days showing on the board, as it scrolls. */
  onDaysInView(dayIds: string[]): void;
  /** The pinned place a plan happens at, if it's one already on the map. */
  spotOf(place: SavedPlace): SavedPlace | null;
  /** The place a plan names that has no pin yet, if any. */
  unresolved(place: SavedPlace): string | null;
  /** Where a flight or transfer takes them, if it lands at a pinned place. */
  travelTo(place: SavedPlace): SavedPlace | null;
  searchNear(place: SavedPlace, query: string): Promise<Suggestion[]>;
  /** Rewrites where some plans happen, which matches them to pins afresh. */
  onSetWhere(ids: string[], where: string): void;
  /** Puts a plan, and others at the same place, at a place found on Google Maps. */
  onPickPlace(place: SavedPlace, suggestion: Suggestion, others: string[]): void;
  /** What background scoring is doing, if anything. */
  status?: string;
  /** A phone: one day fills the board, and tapping a card shows it on the map before offering to edit it. */
  compact?: boolean;
  /** The number of the card's stop on the map, when a day is in focus. */
  stopNumber?(place: SavedPlace): number | null;
  /** A link for directions to where the card happens, if that's on the map. */
  directionsTo?(place: SavedPlace): string | null;
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
  onSelect, onMove, onMoveBeside, onMoveDay, onChangePlace, onNewDayFor, onAddPlan, onRemove, onFocus, onAddDay, onEditDay, onAutoGroup, onCheckPlaces, onDaysInView, spotOf, unresolved, travelTo, searchNear, onSetWhere, onPickPlace, status,
  compact = false, stopNumber = () => null, directionsTo = () => null,
}: Props) {
  // On a phone the editor waits for Edit, so a tap just finds the place on the map.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = !compact || (selectedId !== null && editingId === selectedId);
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

  useEffect(() => onDaysInView(inView), [inView]);

  // The editor floats beside the selected card, or over the board when the place has no card (a home base).
  const editor = useRef<HTMLDivElement>(null);
  const [editorPos, setEditorPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    setEditorPos(null);
    if (!selectedId) return;
    const place = () => {
      const panel = editor.current;
      if (!panel) return;
      if (window.innerWidth <= 760) return setEditorPos({});
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const card = board.current?.querySelector('.card.selected')?.getBoundingClientRect();
      const area = card ?? board.current?.getBoundingClientRect();
      if (!area) return;
      let left = card ? card.right + 8 : area.left + (area.width - w) / 2;
      if (card && left + w > innerWidth - 8) left = card.left - 8 - w;
      left = Math.max(8, Math.min(innerWidth - w - 8, left));
      const top = Math.max(8, Math.min(innerHeight - h - 8, card ? card.top : area.top + 40));
      setEditorPos({ left, top });
    };
    place();
    const observer = new ResizeObserver(place);
    if (editor.current) observer.observe(editor.current);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [selectedId, editing]);

  // Escape or a tap elsewhere closes the editor. Cards and the map pick a new selection themselves.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onSelect(null);
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest('.card-editor, .card, .card-actions, .map-pane, dialog')) onSelect(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [selectedId]);

  // Whatever gets selected, on the map or elsewhere, is brought into view on the board.
  useEffect(() => {
    if (selectedId) board.current?.querySelector('.card.selected')?.closest('li')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  // On a phone during the trip, the board opens on today.
  useEffect(() => {
    if (!compact) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const day = days.find((d) => d.date === today);
    const el = board.current;
    const column = day && el?.querySelector<HTMLElement>(`[data-day-id="${day.id}"]`);
    if (el && column) el.scrollLeft = column.offsetLeft - el.offsetLeft;
  }, [compact]);

  const scrollPage = (direction: -1 | 1) => {
    const el = board.current;
    if (el) el.scrollBy({ left: direction * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const jumpTo = (dayId: string) => {
    const el = board.current;
    const column = el?.querySelector(`[data-day-id="${dayId}"]`);
    if (!el || !column) return;
    const offset = column.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollTo({ left: el.scrollLeft + offset - (compact ? 0 : 48), behavior: 'smooth' });
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
    // A plan at a pinned place shows that place, and its ratings unless it's where they're staying.
    const spot = isEntry(place) ? spotOf(place) : null;
    const spotDetails = spot ? details[spot.placeId] : undefined;
    const spotInfo = spotDetails && spotDetails !== 'error' ? spotDetails : null;
    const scores = place.scores ?? (spot && !spot.homeBase ? spot.scores : undefined);
    const goesTo = isEntry(place) && !spot ? travelTo(place) : null;
    const goesInfo = goesTo ? details[goesTo.placeId] : undefined;
    const missing = isEntry(place) && !spot && !goesTo ? unresolved(place) : null;
    const column = days.find((day) => day.id === place.dayId);
    const canDropBeside = Boolean(dragging && column && dragging.id !== place.id && accepts(dragging, column));
    const number = stopNumber(place);
    const directions = compact && place.id === selectedId ? directionsTo(place) : null;
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
          className={['card', place.id === selectedId && 'selected', isEntry(place) ? 'entry' : !place.mustHave && 'maybe', missing && 'unresolved'].filter(Boolean).join(' ')}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', place.id);
            event.dataTransfer.effectAllowed = 'move';
            setDraggingId(place.id);
          }}
          onDragEnd={endDrag}
          onClick={() => onSelect(place.id)}
        >
          {number !== null && (
            <span className="card-stop" style={column ? { background: dayColor(column) } : undefined} aria-label={`Stop ${number}`}>{number}</span>
          )}
          <span className="card-text">
            {(place.time || place.endTime) && <span className="card-time">{timeRange(place)}</span>}
            <span className="card-name">
              {place.homeBase
                ? <span className="card-star" title="Home base"><House size={15} aria-hidden="true" /> </span>
                : place.mustHave && <span className="card-star" aria-label="Must-have">★ </span>}
              {nameOf(place)}
            </span>
            {!isEntry(place) && (
              <span className="card-location card-spot small">
                <MapPin size={13} aria-hidden="true" /> {info && info !== 'error' ? info.shortLocation : ' '}
              </span>
            )}
            {spotInfo && (
              <span className="card-location card-spot small">
                <MapPin size={13} aria-hidden="true" /> {spotInfo.name}
              </span>
            )}
            {goesInfo && goesInfo !== 'error' && (
              <span className="card-location card-spot small" title="Where this takes you">
                <ArrowRight size={13} aria-hidden="true" /> {goesInfo.name}
              </span>
            )}
            {missing && (
              <span className="card-location card-missing small" title="Pin it with Check places">
                <MapPinOff size={13} aria-hidden="true" /> Not on the map: {missing}
              </span>
            )}
            {place.notes && <span className="card-note small">{place.notes}</span>}
            {scores && <ScoreTotal scores={scores} />}
          </span>
          {scores && <ScoreStack scores={scores} />}
        </button>
        {compact && place.id === selectedId && (
          <div className="card-actions">
            {directions && (
              <a className="chip" href={directions} target="_blank" rel="noreferrer">
                <Navigation size={16} aria-hidden="true" /> Directions
              </a>
            )}
            <button className="chip" onClick={() => setEditingId(place.id)}>
              <Pencil size={16} aria-hidden="true" /> Edit
            </button>
          </div>
        )}
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
        <p className="muted small grow board-hint" role="status">{status || 'Drag places onto days and into order. Drag a day’s heading to move the day.'}</p>
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
        <button className="chip add" onClick={onCheckPlaces} title="Check each place landed on the right spot" aria-label="Check places"><MapPinned size={17} aria-hidden="true" /><span className="tool-label"> Check places</span></button>
        {canAutoGroup && <button className="chip add" onClick={onAutoGroup} title="Auto-group" aria-label="Auto-group"><LayoutGrid size={17} aria-hidden="true" /><span className="tool-label"> Auto-group</span></button>}
        <button className="chip add" onClick={onAddDay} title="Add a day" aria-label="Add a day"><Plus size={17} aria-hidden="true" /><span className="tool-label"> Day</span></button>
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
      <div className={compact ? 'board one-day' : 'board'} ref={board} onWheel={onWheel}>
        <div className={`${columnClass(unscheduledKey, !draggingDayId)}${tray.length === 0 ? ' tray-empty' : ''}`} {...dropProps(unscheduledKey, null, !draggingDayId)}>
          <h3 className="column-head">
            <button className="column-title" aria-pressed={focus === unscheduledKey} onClick={() => onFocus(unscheduledKey)}>
              To place <span className="muted small">{tray.length}</span>
            </button>
          </h3>
          <ul className="column-list">{tray.map(card)}</ul>
        </div>

        {days.map((day, index) => {
          const number = dayNumber(trip, day.id);
          const [before, after] = [days[index - 1], days[index + 1]];
          const dayPlaces = inDayOrder(places.filter((place) => place.dayId === day.id));
          const allowed = draggingDayId !== null || accepts(dragging, day);
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
                {compact && (
                  <button className="icon-button day-step" disabled={!before} aria-label="Previous day" onClick={() => before && jumpTo(before.id)}>
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                )}
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
                {compact && (
                  <button className="icon-button day-step" disabled={!after} aria-label="Next day" onClick={() => after && jumpTo(after.id)}>
                    <ChevronRight size={22} aria-hidden="true" />
                  </button>
                )}
              </h3>
              <ul className="column-list">{dayPlaces.map(card)}</ul>
              <AddPlan onAdd={(title) => onAddPlan(day, title)} />
            </div>
          );
        })}

        <button className="column-add" onClick={onAddDay}><Plus size={18} aria-hidden="true" /> Add a day</button>
      </div>
      </div>

      {selected && editing && createPortal(
        <div
          ref={editor}
          className="card-editor"
          role="dialog"
          aria-label={`Edit ${nameOf(selected)}`}
          style={editorPos ?? { visibility: 'hidden' }}
        >
          <div className="card-editor-head">
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
            <button className="icon-button" title="Close" aria-label="Close" onClick={() => onSelect(null)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {isEntry(selected) && (() => {
            const spot = spotOf(selected);
            const info = spot ? details[spot.placeId] : undefined;
            const where = whereOf(selected).toLowerCase();
            // Other plans written as happening at the same place, so one fix covers them all.
            const others = where ? places.filter((p) => p.id !== selected.id && isEntry(p) && whereOf(p).toLowerCase() === where).map((p) => p.id) : [];
            return (
              <PlanPlace
                key={selected.id}
                place={selected}
                spot={spot && info && info !== 'error' ? { placeId: spot.placeId, name: info.name } : null}
                missing={spot ? null : unresolved(selected)}
                others={others.length}
                search={(query) => searchNear(selected, query)}
                onWhere={(text, alsoOthers) => onSetWhere([selected.id, ...(alsoOthers ? others : [])], text)}
                onPick={(suggestion, alsoOthers) => onPickPlace(selected, suggestion, alsoOthers ? others : [])}
              />
            );
          })()}
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
        </div>,
        document.body,
      )}
    </section>
  );
}
