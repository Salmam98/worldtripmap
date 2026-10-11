import { describe, expect, it } from 'vitest';
import { MAP_IDS } from '../../src/lib/maps/registry';
import { nextInDirection, type Direction } from '../../src/lib/maps/spatial';
import { mapData } from '../helpers/geo';

const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down'];

describe('arrow-key navigation', () => {
  const square: [string, [number, number]][] = [
    ['nw', [0, 0]],
    ['ne', [10, 0]],
    ['sw', [0, 10]],
    ['se', [10, 10]],
    ['far', [100, 0]],
  ];

  it('moves to the nearest place in the direction of the arrow', () => {
    expect(nextInDirection(square, [0, 0], 'nw', 'right')).toBe('ne');
    expect(nextInDirection(square, [0, 0], 'nw', 'down')).toBe('sw');
    expect(nextInDirection(square, [10, 10], 'se', 'up')).toBe('ne');
    expect(nextInDirection(square, [10, 10], 'se', 'left')).toBe('sw');
    expect(nextInDirection(square, [10, 0], 'ne', 'right')).toBe('far');
  });

  it('stays put at the edge of the map', () => {
    expect(nextInDirection(square, [0, 0], 'nw', 'left')).toBeNull();
    expect(nextInDirection(square, [0, 0], 'nw', 'up')).toBeNull();
    expect(nextInDirection(square, [100, 0], 'far', 'right')).toBeNull();
  });

  it('prefers a place straight ahead to a nearer one off to the side', () => {
    const points: [string, [number, number]][] = [
      ['start', [0, 0]],
      ['ahead', [12, 0]],
      ['diagonal', [7, 6]],
    ];
    expect(nextInDirection(points, [0, 0], 'start', 'right')).toBe('ahead');
  });

  it.each(MAP_IDS)('can reach every place on the %s map from every other', (id) => {
    const { def, meta, geometry } = mapData(id);
    const points = def.features.map((f) => [f.id, (geometry.points?.[f.id] ?? meta.features[f.id].label) as [number, number]] as const);
    const at = new Map(points);
    const next = new Map(points.map(([from, p]) => [from, DIRECTIONS.map((d) => nextInDirection(points, p, from, d)).filter((x): x is string => Boolean(x))]));

    // Nobody is a dead end, and nobody is unreachable.
    for (const [from, targets] of next) expect(targets.length, `${from} has nowhere to go`).toBeGreaterThan(0);
    const inbound = new Set([...next.values()].flat());
    expect(def.features.filter((f) => !inbound.has(f.id)).map((f) => f.id)).toEqual([]);

    for (const start of at.keys()) {
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        for (const target of next.get(queue.shift()!)!) {
          if (!seen.has(target)) {
            seen.add(target);
            queue.push(target);
          }
        }
      }
      if (seen.size !== at.size) {
        throw new Error(`From ${start}, arrow keys reach ${seen.size} of ${at.size} places on the ${id} map.`);
      }
    }
  });
});
