import { describe, expect, it } from 'vitest';
import { buildScorePrompt, parseScores, RUBRIC_VERSION } from './scoring';

describe('buildScorePrompt', () => {
  it('names the place, its location, and all four dimensions', () => {
    const prompt = buildScorePrompt({ name: 'Azabudai Hills', area: 'Azabudai, Minato City', city: 'Tokyo' });
    expect(prompt).toContain('Place: Azabudai Hills');
    expect(prompt).toContain('Location: Azabudai, Minato City, Tokyo');
    for (const key of ['visual:', 'entertainment:', 'shopping:', 'culture:']) expect(prompt).toContain(key);
  });
  it('leaves no stray comma when the area is unknown', () => {
    expect(buildScorePrompt({ name: 'X', area: '', city: 'Tokyo' })).toContain('Location: Tokyo\n');
  });
});

describe('parseScores', () => {
  it('reads valid scores and records the rubric used', () => {
    expect(parseScores('{"visual":5,"entertainment":0,"shopping":3,"culture":1}')).toEqual({
      visual: 5, entertainment: 0, shopping: 3, culture: 1, rubric: RUBRIC_VERSION,
    });
  });
  it.each([
    ['not json', 'nope'],
    ['null', 'null'],
    ['a missing dimension', '{"visual":5,"entertainment":0,"shopping":3}'],
    ['out of range', '{"visual":6,"entertainment":0,"shopping":3,"culture":1}'],
    ['a fraction', '{"visual":2.5,"entertainment":0,"shopping":3,"culture":1}'],
    ['a string', '{"visual":"5","entertainment":0,"shopping":3,"culture":1}'],
  ])('rejects %s', (_, text) => {
    expect(() => parseScores(text)).toThrow(/unreadable/);
  });
});
