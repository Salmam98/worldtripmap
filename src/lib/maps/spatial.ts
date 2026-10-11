/**
 * Arrow-key navigation between places on a map.
 *
 * From one place, an arrow key moves to the nearest place that lies in that direction, judged
 * from label points. A place counts as "in that direction" when it is no more than about 65°
 * off the arrow, and places straight ahead are preferred to nearer ones off to the side.
 *
 * The unit tests check that, with these numbers, every place on every map can be reached from
 * every other using arrow keys alone.
 */
export type Direction = 'left' | 'right' | 'up' | 'down';

const VECTOR: Record<Direction, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/** How far off the arrow's line a place may be, as a multiple of its distance along the line. */
const CONE = 2.2;
/** How much a sideways offset counts against a candidate, compared with distance ahead. */
const SIDEWAYS_COST = 1.8;

export function nextInDirection(
  points: Iterable<readonly [string, readonly [number, number]]>,
  from: readonly [number, number],
  fromId: string,
  direction: Direction,
): string | null {
  const [dx, dy] = VECTOR[direction];
  const [x0, y0] = from;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, [x, y]] of points) {
    if (id === fromId) continue;
    const along = (x - x0) * dx + (y - y0) * dy;
    if (along <= 0) continue;
    const across = Math.abs((x - x0) * dy) + Math.abs((y - y0) * dx);
    if (across > along * CONE) continue;
    const score = along + across * SIDEWAYS_COST;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
