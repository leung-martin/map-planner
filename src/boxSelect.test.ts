import { describe, expect, it } from 'vitest';
import { boxFrom, idsInBox } from './boxSelect';

describe('boxFrom', () => {
  it('gives the same box whichever way it was dragged', () => {
    const expected = { left: 10, top: 20, right: 50, bottom: 60 };
    expect(boxFrom({ x: 10, y: 20 }, { x: 50, y: 60 })).toEqual(expected);
    expect(boxFrom({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(boxFrom({ x: 50, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
  });
});

describe('idsInBox', () => {
  const box = { left: 0, top: 0, right: 100, bottom: 100 };
  it('keeps only pins inside, including ones on the edge', () => {
    const pins = [{ id: 'in', x: 50, y: 50 }, { id: 'edge', x: 100, y: 0 }, { id: 'right', x: 101, y: 50 }, { id: 'above', x: 50, y: -1 }];
    expect(idsInBox(box, pins)).toEqual(['in', 'edge']);
  });
  it('returns nothing when no pins are inside', () => {
    expect(idsInBox(box, [])).toEqual([]);
  });
});
