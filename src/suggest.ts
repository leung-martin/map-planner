export type PlaceIdea = { name: string; why: string };

export type Suggester = (city: string, interests: string) => Promise<PlaceIdea[]>;

const MAX_IDEAS = 15;

// Only the city and the user's interests are sent. Google may use free-tier prompts to improve its products.
export function buildPrompt(city: string, interests: string): string {
  const taste = interests.trim()
    ? `The traveler's interests: ${interests.trim()}.`
    : 'Mix well-known highlights with a few lesser-known favorites.';
  return (
    `Suggest 12 real, currently open places worth visiting in ${city}. ${taste} ` +
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

export function suggestionErrorMessage(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  if (/429|quota|resource.?exhausted|rate.?limit/i.test(text)) return 'Gemini’s free limit is used up for now. Try again later.';
  if (/app.?check|permission|403|deactivated|recaptcha/i.test(text)) return 'Gemini isn’t fully set up yet. SETUP.md explains the steps.';
  if (/unreadable/i.test(text)) return text;
  return 'Couldn’t reach Gemini. Check your connection and try again.';
}
