import { useEffect, useRef, useState } from 'react';
import type { PlaceDetails } from './maps/provider';
import { RUBRIC_VERSION, type Scorer } from './scoring';
import { suggestionErrorMessage } from './suggest';
import type { PlaceScores, SavedPlace, Trip } from './types';

// One place at a time with a gap between, which stays under Gemini's per-minute limits.
const FIRST_DELAY_MS = 800;
const GAP_MS = 4_000;
const PAUSE_MS = 15 * 60_000;

type Options = {
  scorer: Scorer | null;
  trip: Trip;
  places: SavedPlace[];
  details: Record<string, PlaceDetails | 'error'>;
  onScored(placeId: string, scores: PlaceScores): void;
};

/** Scores each loaded place that has no scores yet. Returns text describing what it's doing. */
export function useScoring({ scorer, trip, places, details, onScored }: Options): string {
  const [message, setMessage] = useState('');
  const [round, setRound] = useState(0);
  const busy = useRef(false);
  const lastRun = useRef(0);
  const pausedUntil = useRef(0);
  // Answers Gemini got wrong aren't retried until the app is next opened.
  const skipped = useRef(new Set<string>());
  const scored = useRef(onScored);
  scored.current = onScored;

  const next = scorer
    ? places.find(
        (place) =>
          (place.scores?.rubric ?? 0) < RUBRIC_VERSION && !skipped.current.has(place.id) && typeof details[place.placeId] === 'object',
      )
    : undefined;
  const info = next ? (details[next.placeId] as PlaceDetails) : null;
  const city = trip.cities.find((c) => c.id === next?.cityId)?.name ?? '';

  useEffect(() => {
    if (!next || !info || !scorer || busy.current) {
      if (!next && !busy.current) setMessage('');
      return;
    }
    const now = Date.now();
    if (pausedUntil.current > now) {
      const wake = window.setTimeout(() => setRound((count) => count + 1), pausedUntil.current - now);
      return () => window.clearTimeout(wake);
    }

    let unmounted = false;
    const timer = window.setTimeout(async () => {
      busy.current = true;
      lastRun.current = Date.now();
      setMessage('Scoring places…');
      try {
        const scores = await scorer({ name: info.name, area: info.shortLocation, city });
        if (!unmounted) scored.current(next.id, scores);
      } catch (reason) {
        if (reason instanceof Error && /unreadable/.test(reason.message)) {
          skipped.current.add(next.id);
        } else {
          pausedUntil.current = Date.now() + PAUSE_MS;
          setMessage(`Scoring paused. ${suggestionErrorMessage(reason)}`);
        }
      } finally {
        busy.current = false;
        setRound((count) => count + 1);
      }
    }, Math.max(FIRST_DELAY_MS, lastRun.current + GAP_MS - now));

    return () => {
      unmounted = true;
      window.clearTimeout(timer);
    };
  }, [next?.id, info, scorer, round]);

  return message;
}
