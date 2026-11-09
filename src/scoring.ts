import type { PlaceScores } from './types';

// Raising this rescores every saved place once, so all scores come from the same prompt.
export const RUBRIC_VERSION = 2;

export type DimensionKey = 'visual' | 'entertainment' | 'shopping' | 'culture';

export const DIMENSIONS: { key: DimensionKey; label: string; icon: string }[] = [
  { key: 'visual', label: 'Visual Appeal', icon: '🏙️' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎮' },
  { key: 'shopping', label: 'Shopping', icon: '🛍️' },
  { key: 'culture', label: 'Cultural Value', icon: '🎎' },
];

export const MAX_TOTAL = DIMENSIONS.length * 5;

export function totalScore(scores: PlaceScores): number {
  return DIMENSIONS.reduce((sum, { key }) => sum + scores[key], 0);
}

export type PlaceToScore ={ name: string; area: string; city: string };

export type Scorer = (place: PlaceToScore) => Promise<PlaceScores>;

export function buildScorePrompt({ name, area, city }: PlaceToScore): string {
  const location = [area, city].filter(Boolean).join(', ');
  return `Rate one place for a traveler on four independent dimensions. Each rating is a whole number from 0 to 5.

Place: ${name}
Location: ${location}

Pick the single level that best matches each description.

visual (architecture, aesthetics, impressive design, atmosphere, photogenic scenery):
- visual: 5 = world-famous architecture or scenery people travel specifically to see. 4 = striking and highly photogenic. 3 = attractive and pleasant. 2 = ordinary with some nice features. 1 = plain. 0 = purely functional.

entertainment (things to do, attractions, interactive experiences, fun, novelty):
- entertainment: 5 = fills a full day with many attractions. 4 = several hours of activities. 3 = one to two hours of things to do. 2 = a brief activity. 1 = little to do besides look around. 0 = nothing to do.

shopping (stores, malls, boutiques, department stores, unique retail):
- shopping: 5 = a major shopping destination with very many stores. 4 = a large mall or famous shopping street. 3 = a good selection of shops. 2 = a few shops. 1 = a gift shop or kiosk only. 0 = no shopping.

culture (history, traditional and local culture, local identity, food, authenticity):
- culture: 5 = nationally important historic or cultural site, or a defining local food institution. 4 = strong history or tradition. 3 = clear local character. 2 = some local character. 1 = little local character. 0 = generic or international chain.

Calibration examples (visual, entertainment, shopping, culture):
- Kinkaku-ji: 5, 2, 1, 5
- Tokyo Disneyland: 4, 5, 3, 1
- Ginza Six: 4, 2, 5, 2
- Senso-ji: 4, 2, 3, 5
- An ordinary convenience store: 0, 0, 1, 0

Rules:
- Judge what is true of this place, based on its established, long-standing reputation. Ignore recent trends and personal taste.
- Rate each dimension on its own. A high score in one says nothing about another.
- If you are between two levels, choose the lower one.
- If you don't recognize the place, judge from its name and type, and don't go above 3.`;
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
