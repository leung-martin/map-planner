import { describe, expect, it } from 'vitest';
import { groupByLocation } from './autoGroup';

const at = (id: string, lat: number, lng: number) => ({ id, location: { lat, lng } });
const ids = (groups: { id: string }[][]) => groups.map((group) => group.map((item) => item.id).sort());

describe('groupByLocation', () => {
  it('puts neighbors together and orders groups west to east', () => {
    const items = [at('east1', 35.66, 139.8), at('west1', 35.66, 139.7), at('east2', 35.661, 139.801), at('west2', 35.661, 139.701)];
    expect(ids(groupByLocation(items, 2))).toEqual([['west1', 'west2'], ['east1', 'east2']]);
  });

  it('keeps one dense area from taking almost everything', () => {
    const dense = Array.from({ length: 9 }, (_, i) => at(`d${i}`, 35.66 + i * 0.0001, 139.7));
    const groups = groupByLocation([...dense, at('far', 35.9, 140.2)], 2);
    expect(groups).toHaveLength(2);
    expect(Math.max(...groups.map((group) => group.length))).toBeLessThanOrEqual(6);
  });

  it('uses every place exactly once', () => {
    const items = Array.from({ length: 17 }, (_, i) => at(`p${i}`, 35.6 + (i * 37) % 11 * 0.01, 139.7 + (i * 53) % 13 * 0.01));
    const groups = groupByLocation(items, 4);
    expect(groups.flat().map((item) => item.id).sort()).toEqual(items.map((item) => item.id).sort());
    expect(groups).toHaveLength(4);
  });

  it('gives the same answer every run', () => {
    const items = Array.from({ length: 12 }, (_, i) => at(`p${i}`, 35.6 + (i * 7) % 5 * 0.02, 139.7 + (i * 3) % 7 * 0.02));
    expect(ids(groupByLocation(items, 3))).toEqual(ids(groupByLocation(items, 3)));
  });

  it('handles more days than places, identical pins, and nothing to group', () => {
    expect(groupByLocation([at('a', 1, 1), at('b', 2, 2)], 5)).toHaveLength(2);
    expect(groupByLocation([at('a', 1, 1), at('b', 1, 1), at('c', 1, 1)], 3).flat()).toHaveLength(3);
    expect(groupByLocation([], 3)).toEqual([]);
    expect(groupByLocation([at('a', 1, 1)], 0)).toEqual([]);
  });
});
