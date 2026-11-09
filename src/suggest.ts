import type { Bounds, LatLng } from './types';

export type PlaceIdea = { name: string; why: string };

export type Suggester = (trip: string, interests: string, area: Bounds) => Promise<PlaceIdea[]>;

const MAX_IDEAS = 15;

/** Also handles an area that crosses the 180° meridian, where west is greater than east. */
export function isInside({ lat, lng }: LatLng, area: Bounds): boolean {
  const inLng = area.west <= area.east ? lng >= area.west && lng <= area.east : lng >= area.west || lng <= area.east;
  return inLng && lat >= area.south && lat <= area.north;
}

// Only the trip name, the map area and the user's interests are sent. Google may use free-tier prompts to improve its products.
export function buildPrompt(trip: string, interests: string, area: Bounds): string {
  const taste = interests.trim()
    ? `The traveler's interests: ${interests.trim()}.`
    : 'Mix well-known highlights with a few lesser-known favorites.';
  const edge = (value: number) => value.toFixed(4);
  return (
    `Suggest up to 12 real, currently open places worth visiting, for a trip to ${trip}. ` +
    `Every place must be inside the area of the map the traveler is looking at: ` +
    `latitude ${edge(area.south)} to ${edge(area.north)}, longitude ${edge(area.west)} to ${edge(area.east)}. ` +
    `Leave out anything outside that area, however famous, and return fewer places rather than going outside it. ${taste} ` +
    'Use each place’s official name as it appears on Google Maps. ' +
    'For "why", write one short sentence of under 15 words.'
  );
}

export function parseIdeas(text: string): PlaceIdea[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini sent back something unreadable. Try again.');
  }
  const list = (parsed as { ideas?: unknown } | null)?.ideas;
  if (!Array.isArray(list)) throw new Error('Gemini sent back something unreadable. Try again.');

  const seen = new Set<string>();
  const ideas: PlaceIdea[] = [];
  for (const item of list as Partial<PlaceIdea>[]) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    ideas.push({ name, why: typeof item.why === 'string' ? item.why.trim() : '' });
  }
  return ideas.slice(0, MAX_IDEAS);
}

const LIMIT_ERROR = /429|quota|resource.?exhausted|rate.?limit/i;
const OVERLOAD_ERROR = /\b50[03]\b|high demand|overloaded|unavailable|timed out/i;
const PRIMARY_LIMIT_MS = 15_000;

/** Tries the second call only when the first model is overloaded, out of quota, or too slow. */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  limitMs = PRIMARY_LIMIT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Main model timed out')), limitMs);
  });
  try {
    return await Promise.race([primary(), limit]);
  } catch (reason) {
    const text = reason instanceof Error ? reason.message : String(reason);
    if (!LIMIT_ERROR.test(text) && !OVERLOAD_ERROR.test(text)) throw reason;
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

export function suggestionErrorMessage(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  if (LIMIT_ERROR.test(text)) return 'Gemini’s free limit is used up for now. Try again later.';
  if (OVERLOAD_ERROR.test(text)) return 'Gemini is very busy right now. Try again in a few minutes.';
  if (/app.?check|permission|403|deactivated|recaptcha/i.test(text)) return 'Gemini isn’t fully set up yet. SETUP.md explains the steps.';
  if (/unreadable/i.test(text)) return text;
  return 'Couldn’t reach Gemini. Check your connection and try again.';
}
