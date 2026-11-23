import { useEffect, useRef, useState } from 'react';
import { googleMapsApiKey, hasFirebase } from './config';
import { createLocalStore, type TripStore } from './data/store';
import { demoProvider, demoScore, demoSuggest } from './maps/demoProvider';
import type { Scorer } from './scoring';
import type { Suggester } from './suggest';
import { createGoogleProvider } from './maps/googleProvider';
import { Backdrop } from './components/Backdrop';
import { NewTrip } from './components/NewTrip';
import { TripsHome } from './components/TripsHome';
import { TripView } from './components/TripView';
import type { Trip } from './types';

const provider = googleMapsApiKey ? createGoogleProvider() : demoProvider;

const suggest: Suggester | null = provider.demo
  ? demoSuggest
  : hasFirebase
    ? (trip, interests, area) => import('./data/gemini').then((gemini) => gemini.suggestPlaces(trip, interests, area))
    : null;

const scorer: Scorer | null = provider.demo
  ? demoScore
  : hasFirebase
    ? (place) => import('./data/gemini').then((gemini) => gemini.scorePlace(place))
    : null;

type Backend = typeof import('./data/firebase');
type Session =
  | { status: 'loading' }
  | { status: 'signedOut'; backend: Backend }
  | { status: 'ready'; store: TripStore; backend: Backend | null; me: { uid: string; email: string } | null };

const goHome = () => {
  window.location.hash = '#/';
};

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function useSession(): Session {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  useEffect(() => {
    if (!hasFirebase) {
      setSession({ status: 'ready', store: createLocalStore(), backend: null, me: null });
      return;
    }
    let stop = () => {};
    let cancelled = false;
    import('./data/firebase').then((backend) => {
      if (cancelled) return;
      stop = backend.watchUser((user) =>
        setSession(
          user
            ? (() => {
                const me = { uid: user.uid, email: (user.email ?? '').toLowerCase() };
                return { status: 'ready', store: backend.createFirebaseStore(me), backend, me } as const;
              })()
            : { status: 'signedOut', backend },
        ),
      );
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return session;
}

export function App() {
  const session = useSession();
  const hash = useHash();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState('');
  const [signInError, setSignInError] = useState('');

  const store = session.status === 'ready' ? session.store : null;
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    if (!store) return;
    setTrips(null);
    return store.subscribe(setTrips, (reason) => setError(`Could not load your trips: ${reason.message}`));
  }, [store]);

  const loading = (text: string) => (
    <>
      <Backdrop />
      <div className="centered"><span className="loading-chip">{text}</span></div>
    </>
  );

  if (session.status === 'loading') return loading('Loading…');

  if (session.status === 'signedOut') {
    return (
      <>
        <Backdrop />
        <main className="centered">
          <section className="sign-in hud-frame">
            <h1 className="tile-bar">Map Planner</h1>
            <div className="sign-in-body">
              <p>Sign in to see your trips on any device.</p>
              <button
                className="primary"
                onClick={() => session.backend.signIn().catch((reason: Error) => setSignInError(reason.message))}
              >
                Sign in with Google
              </button>
              {signInError && <p className="error-text">{signInError}</p>}
            </div>
          </section>
        </main>
      </>
    );
  }

  const save = (trip: Trip) => {
    storeRef.current
      ?.save({ ...trip, updatedAt: Date.now() })
      .catch((reason: Error) => setError(`Your last change wasn't saved: ${reason.message}`));
  };
  const remove = (tripId: string) => {
    storeRef.current?.remove(tripId).catch((reason: Error) => setError(`Could not delete: ${reason.message}`));
  };

  const me = session.me;
  // Someone the trip was shared with takes themselves off the list rather than deleting it for everyone.
  const leave = (trip: Trip) => {
    if (!me) return;
    save({ ...trip, memberEmails: (trip.memberEmails ?? []).filter((email) => email !== me.email) });
  };

  const tripId = hash.match(/^#\/trip\/(.+)$/)?.[1];
  const trip = trips?.find((t) => t.id === tripId);
  const banner = error && (
    <div className="banner" role="alert">
      {error} <button onClick={() => setError('')}>Dismiss</button>
    </div>
  );

  if (trips === null) return loading('Loading your trips…');

  if (hash === '#/new') {
    return (
      <>
        <Backdrop />
        {banner}
        <NewTrip
          provider={provider}
          onCancel={goHome}
          onCreate={(created) => {
            save(created);
            window.location.hash = `#/trip/${created.id}`;
          }}
        />
      </>
    );
  }

  if (tripId && trip) {
    return (
      <>
        <Backdrop />
        {banner}
        <TripView key={trip.id} trip={trip} provider={provider} suggest={suggest} scorer={scorer} onChange={save} me={me} />
      </>
    );
  }

  return (
    <>
      <Backdrop />
      {banner}
      <TripsHome
        trips={trips}
        missingTrip={Boolean(tripId)}
        demo={provider.demo}
        synced={hasFirebase}
        onDelete={remove}
        onLeave={leave}
        myUid={me?.uid ?? null}
        provider={provider}
        onImport={(imported) => imported.forEach(save)}
        onSignOut={session.backend ? session.backend.signOut : null}
      />
    </>
  );
}
