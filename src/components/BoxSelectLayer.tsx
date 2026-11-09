import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { boxFrom, idsInBox, type Box, type Point } from '../boxSelect';

const MIN_DRAG_PX = 8;

type Props = {
  onSelect(ids: string[]): void;
  onCancel(): void;
};

/** Sits over the map and turns a drag into a box. Pins are read from the page, so it works on any map. */
export function BoxSelectLayer({ onSelect, onCancel }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const pointFrom = (event: ReactPointerEvent) => {
    const area = layer.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - area.left, 0), area.width),
      y: Math.min(Math.max(event.clientY - area.top, 0), area.height),
    };
  };

  const finish = (event: ReactPointerEvent) => {
    if (!start.current) return;
    const drawn = boxFrom(start.current, pointFrom(event));
    start.current = null;
    setBox(null);
    if (drawn.right - drawn.left < MIN_DRAG_PX && drawn.bottom - drawn.top < MIN_DRAG_PX) return;

    const area = layer.current!.getBoundingClientRect();
    const pins = [...layer.current!.parentElement!.querySelectorAll<HTMLElement>('[data-pin-id]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.pinId!, x: rect.left + rect.width / 2 - area.left, y: rect.top + rect.height / 2 - area.top };
    });
    onSelect(idsInBox(drawn, pins));
  };

  return (
    <div
      ref={layer}
      className="box-layer"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = pointFrom(event);
      }}
      onPointerMove={(event) => {
        if (start.current) setBox(boxFrom(start.current, pointFrom(event)));
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        start.current = null;
        setBox(null);
      }}
    >
      {box && <div className="box-drawn" style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }} />}
    </div>
  );
}
