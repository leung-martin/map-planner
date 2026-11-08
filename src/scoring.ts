import type { PlaceScores } from './types';

export const RUBRIC_VERSION = 1;

export type DimensionKey = 'visual' | 'entertainment' | 'shopping' | 'culture';

export const DIMENSIONS: { key: DimensionKey; label: string; icon: string }[] = [
  { key: 'visual', label: 'Visual Appeal', icon: '🏙️' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎮' },
  { key: 'shopping', label: 'Shopping', icon: '🛍️' },
  { key: 'culture', label: 'Cultural Value', icon: '🎎' },
];

export type PlaceToScore = { name: string; area: string; city: string };

export type Scorer = (place: PlaceToScore) => Promise<PlaceScores>;

export function buildScorePrompt({ name, area, city }: PlaceToScore): string {
  const location = [area, city].filter(Boolean).join(', ');
  return `Rate one place for a traveler on four independent dimensions. Each rating is a whole number from 0 to 5.

Place: ${name}
Location: ${location}

Dimensions:
- visual: architecture, aesthetics, impressive design, atmosphere, photogenic scenery
- entertainment: things to do, attractions, interactive experiences, fun, novelty
- shopping: stores, malls, boutiques, department stores, unique retail
- culture: history, traditional and local culture, local identity, food, authenticity

Scale:
0 = absent. 1 = minimal. 2 = minor. 3 = solid, a real reason to go. 4 = a major strength. 5 = among the best of its kind in the country.

Calibration examples (visual, entertainment, shopping, culture):
- Kinkaku-ji: 5, 1, 1, 5
- Tokyo Disneyland: 4, 5, 3, 1
- Ginza Six: 4, 1, 5, 1
- Senso-ji: 4, 2, 3, 5
- An ordinary convenience store: 0, 0, 1, 0

Rate by the place's established reputation, not recent trends. Rate each dimension on its own, and use the whole scale. If you don't recognize the place, judge from its name and type and avoid 4 or 5.`;
}

export function parseScores(text: string): PlaceScores {
  const unreadable = new Error('Gemini sent back something unreadable.');
  let parsed: Record<string, unknown> | null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unreadable;
  }
  const read = (key: DimensionKey) => {
    const value = parsed?.[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) throw unreadable;
    return value;
  };
  return {
    visual: read('visual'),
    entertainment: read('entertainment'),
    shopping: read('shopping'),
    culture: read('culture'),
    rubric: RUBRIC_VERSION,
  };
}
