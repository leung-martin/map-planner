import { describe, expect, it } from 'vitest';
import { buildPrompt, parseIdeas, suggestionErrorMessage, withFallback } from './suggest';

describe('buildPrompt', () => {
  it('includes the city and interests when given', () => {
    const prompt = buildPrompt('Tokyo', ' onsen, design ');
    expect(prompt).toContain('in Tokyo');
    expect(prompt).toContain('interests: onsen, design.');
  });
  it('asks for a mix when no interests are given', () => {
    expect(buildPrompt('Tokyo', '  ')).toContain('Mix well-known');
  });
});

describe('parseIdeas', () => {
  it('reads ideas, trims them, and drops blanks and repeats', () => {
    const ideas = parseIdeas(JSON.stringify({ ideas: [
      { name: ' Ueno Park ', why: ' Museums and gardens. ' }, { name: 'ueno park', why: 'Again' }, { name: '', why: 'x' }, { name: 'Odaiba' },
    ] }));
    expect(ideas).toEqual([{ name: 'Ueno Park', why: 'Museums and gardens.' }, { name: 'Odaiba', why: '' }]);
  });
  it('caps a long answer', () => {
    const ideas = Array.from({ length: 40 }, (_, i) => ({ name: `P${i}`, why: '' }));
    expect(parseIdeas(JSON.stringify({ ideas }))).toHaveLength(15);
  });
  it('rejects anything that is not the expected shape', () => {
    expect(() => parseIdeas('nope')).toThrow(/unreadable/);
    expect(() => parseIdeas('{"other":1}')).toThrow(/unreadable/);
    expect(() => parseIdeas('null')).toThrow(/unreadable/);
  });
});

describe('withFallback', () => {
  const fail = (message: string) => () => Promise.reject(new Error(message));
  const lighter = () => Promise.resolve('lighter');

  it('keeps the first answer when it works, without calling the fallback', async () => {
    let called = false;
    const result = await withFallback(() => Promise.resolve('main'), async () => { called = true; return 'lighter'; });
    expect(result).toBe('main');
    expect(called).toBe(false);
  });
  it('uses the fallback when the model is overloaded or out of quota', async () => {
    await expect(withFallback(fail('[500 ] This model is currently experiencing high demand.'), lighter)).resolves.toBe('lighter');
    await expect(withFallback(fail('[503 ] Service Unavailable'), lighter)).resolves.toBe('lighter');
    await expect(withFallback(fail('[429] RESOURCE_EXHAUSTED'), lighter)).resolves.toBe('lighter');
  });
  it('does not retry setup problems, since the other model would fail too', async () => {
    await expect(withFallback(fail('[401 ] Firebase App Check token is invalid.'), lighter)).rejects.toThrow(/App Check/);
  });
  it('reports the fallback failure when both models fail', async () => {
    await expect(withFallback(fail('[500 ] high demand'), fail('[429] quota'))).rejects.toThrow(/quota/);
  });
});

describe('suggestionErrorMessage', () => {
  it('explains a busy model instead of blaming the connection', () => {
    expect(suggestionErrorMessage(new Error('[500 ] This model is currently experiencing high demand.'))).toMatch(/very busy/);
  });
  it('explains limits and setup problems in plain words', () => {
    expect(suggestionErrorMessage(new Error('[429] RESOURCE_EXHAUSTED'))).toMatch(/free limit/);
    expect(suggestionErrorMessage(new Error('PERMISSION_DENIED: you must enforce Firebase App Check'))).toMatch(/set up/);
    expect(suggestionErrorMessage(new Error('Failed to fetch'))).toMatch(/connection/);
  });
});
