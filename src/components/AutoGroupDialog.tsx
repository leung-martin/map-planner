import { useEffect, useRef, useState } from 'react';

type Props = {
  cityName: string;
  mustHaves: number;
  maybes: number;
  defaultDays: number;
  ready: boolean;
  onApply(days: number, includeMaybes: boolean): void;
  onClose(): void;
};

export function AutoGroupDialog({ cityName, mustHaves, maybes, defaultDays, ready, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [days, setDays] = useState(String(defaultDays));
  const [includeMaybes, setIncludeMaybes] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const count = Number(days);
  const valid = Number.isInteger(count) && count >= 1 && count <= 60;
  // With nothing starred, the maybes are all there is to group.
  const useMaybes = includeMaybes || mustHaves === 0;
  const total = mustHaves + (useMaybes ? maybes : 0);

  return (
    <dialog ref={dialog} className="day-dialog" onClose={onClose}>
      <h2>Auto-group {cityName}</h2>
      <label>
        How many days?
        <input type="number" min={1} max={60} value={days} onChange={(event) => setDays(event.target.value)} />
      </label>
      {mustHaves > 0 && maybes > 0 && (
        <label className="import-star">
          <input type="checkbox" checked={includeMaybes} onChange={(event) => setIncludeMaybes(event.target.checked)} />
          Include the {maybes} maybe{maybes === 1 ? '' : 's'}
        </label>
      )}
      <p className="muted small dialog-hint">
        Groups {total} place{total === 1 ? '' : 's'} by how close they are. Any already on a day may move.
      </p>
      <div className="dialog-row spread">
        <button className="text-button" onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="primary" disabled={!valid || !ready || total === 0} onClick={() => onApply(count, useMaybes)}>
          {ready ? 'Group places' : 'Loading places…'}
        </button>
      </div>
    </dialog>
  );
}
