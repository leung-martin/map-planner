import { describe, expect, it } from 'vitest';
import { buildPrompt, parseIdeas, suggestionErrorMessage } from './suggest';

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

describe('suggestionErrorMessage', () => {
  it('explains limits and setup problems in plain words', () => {
    expect(suggestionErrorMessage(new Error('[429] RESOURCE_EXHAUSTED'))).toMatch(/free limit/);
    expect(suggestionErrorMessage(new Error('PERMISSION_DENIED: you must enforce Firebase App Check'))).toMatch(/set up/);
    expect(suggestionErrorMessage(new Error('Failed to fetch'))).toMatch(/connection/);
  });
});
