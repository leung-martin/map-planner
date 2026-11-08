import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as authSignOut,
  type User,
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, setDoc,
} from 'firebase/firestore';
import { firebaseConfig } from '../config';
import type { Trip } from '../types';
import type { TripStore } from './store';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// The local cache keeps trips readable without signal and queues edits until reconnecting.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
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

export function createFirebaseStore(uid: string): TripStore {
  const trips = collection(db, 'users', uid, 'trips');
  return {
    subscribe(onTrips, onError) {
      return onSnapshot(
        trips,
        (snapshot) => {
          const all = snapshot.docs.map((d) => d.data() as Trip);
          onTrips(all.sort((a, b) => b.updatedAt - a.updatedAt));
        },
        onError,
      );
    },
    save: (trip) => setDoc(doc(trips, trip.id), trip),
    remove: (tripId) => deleteDoc(doc(trips, tripId)),
  };
}
