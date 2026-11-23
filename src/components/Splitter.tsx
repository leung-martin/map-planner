import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

const KEY = 'mapplanner.boardShare';
const DEFAULT = 0.63;
const MIN = 0.25;
const MAX = 0.85;
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

/** How much of the width the days board takes beside the map, remembered on this device. */
export function useBoardShare(): [number, (value: number) => void] {
  const [share, setShare] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      return saved ? clamp(saved) : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });
  const update = (value: number) => {
    const next = clamp(value);
    setShare(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // Not remembered, but still resized.
    }
  };
  return [share, update];
}

type Props = { container: RefObject<HTMLElement | null>; value: number; onChange(value: number): void };

/** A bar between the board and the map: drag it, use the arrow keys, or double-click to reset. */
export function Splitter({ container, value, onChange }: Props) {
  const [dragging, setDragging] = useState(false);

  const follow = (event: PointerEvent) => {
    const box = container.current?.getBoundingClientRect();
    if (box && box.width > 0) onChange((event.clientX - box.left) / box.width);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.03;
    if (event.key === 'ArrowLeft') onChange(value - step);
    else if (event.key === 'ArrowRight') onChange(value + step);
    else if (event.key === 'Home') onChange(MIN);
    else if (event.key === 'End') onChange(MAX);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={dragging ? 'splitter dragging' : 'splitter'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the days board and map"
      aria-valuemin={MIN * 100}
      aria-valuemax={MAX * 100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => dragging && follow(event)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => onChange(DEFAULT)}
      onKeyDown={onKeyDown}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
