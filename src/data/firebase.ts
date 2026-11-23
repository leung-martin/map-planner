import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as authSignOut,
  type User,
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDocs, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, query, setDoc, where,
} from 'firebase/firestore';
import { firebaseConfig } from '../config';
import type { Trip } from '../types';
import type { TripStore } from './store';

export const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// The local cache keeps trips readable without signal and queues edits until reconnecting.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // Clearing an optional field, like a time, sets it to undefined.
  ignoreUndefinedProperties: true,
});

export function watchUser(onUser: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onUser);
}

export async function signIn(): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else {
      throw error;
    }
  }
}

export function signOut(): Promise<void> {
  return authSignOut(auth);
}

export type Me = { uid: string; email: string };

export function createFirebaseStore(user: Me): TripStore {
  const me = user.email.toLowerCase();
  const trips = collection(db, 'trips');
  // A trip gets its owner and member list the first time it's saved.
  const owned = (trip: Trip): Trip => ({
    ...trip,
    ownerUid: trip.ownerUid ?? user.uid,
    ownerEmail: trip.ownerEmail ?? me,
    memberEmails: trip.memberEmails?.length ? trip.memberEmails : [me],
  });

  /** Trips saved before sharing existed lived under the account. They move once, then the old copy goes. */
  async function moveOldTrips() {
    const old = await getDocs(collection(db, 'users', user.uid, 'trips'));
    for (const saved of old.docs) {
      await setDoc(doc(trips, saved.id), owned(saved.data() as Trip));
      await deleteDoc(saved.ref);
    }
  }

  return {
    subscribe(onTrips, onError) {
      moveOldTrips().catch(onError);
      return onSnapshot(
        query(trips, where('memberEmails', 'array-contains', me)),
        (snapshot) => {
          const all = snapshot.docs.map((d) => d.data() as Trip);
          onTrips(all.sort((a, b) => b.updatedAt - a.updatedAt));
        },
        onError,
      );
    },
    save: (trip) => setDoc(doc(trips, trip.id), owned(trip)),
    remove: (tripId) => deleteDoc(doc(trips, tripId)),
  };
}
