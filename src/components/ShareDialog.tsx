import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { membersOf } from '../trip';
import type { Trip } from '../types';

type Props = {
  trip: Trip;
  me: { uid: string; email: string };
  onUpdate(change: (trip: Trip) => Trip): void;
  onClose(): void;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareDialog({ trip, me, onUpdate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const owner = !trip.ownerUid || trip.ownerUid === me.uid;
  const ownerEmail = trip.ownerEmail ?? me.email;
  const members = membersOf(trip, me.email);
  const setMembers = (next: string[]) =>
    onUpdate((current) => ({ ...current, ownerUid: current.ownerUid ?? me.uid, ownerEmail: current.ownerEmail ?? me.email, memberEmails: next }));

  const add = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) return setError('That doesn’t look like an email address.');
    if (members.includes(address)) return setError('They already have access.');
    setMembers([...members, address]);
    setEmail('');
    setError('');
  };

  return (
    <dialog ref={dialog} className="day-dialog share-dialog" onClose={onClose}>
      <h2>Share trip</h2>
      <p className="muted small dialog-hint">
        Only these Google accounts can open this trip. Everyone on the list can change it, and changes show up for everyone right away.
      </p>
      <ul className="share-list">
        {members.map((address) => (
          <li key={address}>
            <span className="clip grow">{address}</span>
            {address === ownerEmail.toLowerCase() ? (
              <span className="muted small">Owner</span>
            ) : owner ? (
              <button className="icon-button" title="Remove access" aria-label={`Remove ${address}`} onClick={() => setMembers(members.filter((m) => m !== address))}>
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {owner ? (
        <form onSubmit={add}>
          <label>
            Add a friend’s Google email
            <input type="email" value={email} autoFocus placeholder="friend@gmail.com" onChange={(event) => setEmail(event.target.value)} />
          </label>
          {error && <p className="error-text small dialog-hint">{error}</p>}
          <p className="muted small dialog-hint">Send them the app’s link. They sign in with this address and the trip is on their home screen.</p>
          <div className="dialog-row spread">
            <button type="button" className="text-button" onClick={() => dialog.current?.close()}>Done</button>
            <button className="primary" disabled={!email.trim()}>Add</button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted small dialog-hint">Only {ownerEmail} can change who has access.</p>
          <div className="dialog-row spread">
            <button className="text-button" onClick={() => dialog.current?.close()}>Done</button>
          </div>
        </>
      )}
    </dialog>
  );
}
