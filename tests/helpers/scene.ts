import { IDENTITY, multiply, parsePath, type Matrix, type Scene, type SceneNode } from '../../src/lib/poster/scene';

export type Box = [number, number, number, number];

const EMPTY: Box = [Infinity, Infinity, -Infinity, -Infinity];
const isEmpty = (b: Box) => b[0] > b[2] || b[1] > b[3];
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const intersect = (a: Box, b: Box): Box => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** The box around a path, using control points for curves (so it can only be too big, never too small). */
export function pathBox(d: string, m: Matrix): Box {
  let box = EMPTY;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Path has a non-finite coordinate: ${d.slice(0, 60)}`);
    const [tx, ty] = apply(m, x, y);
    box = union(box, [tx, ty, tx, ty]);
  };
  for (const s of parsePath(d)) {
    if (s.op === 'Z') continue;
    if (s.op === 'C') {
      add(s.x1, s.y1);
      add(s.x2, s.y2);
    }
    add(s.x, s.y);
  }
  return box;
}

export interface Drawn {
  node: SceneNode;
  /** What is actually visible, after clipping, in poster units. */
  box: Box;
}

/** Every drawn shape with the area it can touch on the page, taking transforms and clips into account. */
export function drawn(scene: Scene): Drawn[] {
  const out: Drawn[] = [];
  const walk = (nodes: SceneNode[], m: Matrix, clip: Box | null) => {
    for (const node of nodes) {
      if (node.type === 'group') {
        const gm = node.transform ? multiply(m, node.transform) : m;
        let gc = clip;
        if (node.clip) {
          const cb = pathBox(node.clip, gm);
          gc = clip ? intersect(clip, cb) : cb;
        }
        walk(node.children, gm, gc);
        continue;
      }
      let box: Box;
      if (node.type === 'image') {
        const [x0, y0] = apply(m, node.x, node.y);
        const [x1, y1] = apply(m, node.x + node.width, node.y + node.height);
        box = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
      } else {
        box = pathBox(node.d, node.transform ? multiply(m, node.transform) : m);
      }
      if (clip) box = intersect(box, clip);
      if (!isEmpty(box)) out.push({ node, box });
    }
  };
  walk(scene.nodes, IDENTITY, null);
  return out;
}

/** Shapes that reach outside the page (plus its bleed), which would be cut off in a download. */
export function outside(scene: Scene, tolerance = 0.75): Drawn[] {
  const b = scene.bleed + tolerance;
  return drawn(scene).filter(({ box }) => box[0] < -b || box[1] < -b || box[2] > scene.width + b || box[3] > scene.height + b);
}

export function describeNode(d: Drawn): string {
  const n = d.node;
  const kind = n.type === 'path' ? `path fill=${n.fill ?? '-'} stroke=${n.stroke ?? '-'} d=${n.d.slice(0, 40)}…` : n.type;
  return `${kind} box=[${d.box.map((v) => v.toFixed(1)).join(', ')}]`;
}

/** Every colour used in a scene. */
export function colours(scene: Scene): string[] {
  const set = new Set<string>([scene.background]);
  for (const { node } of drawn(scene)) {
    if (node.type !== 'path') continue;
    if (node.fill) set.add(node.fill);
    if (node.stroke) set.add(node.stroke);
  }
  return [...set];
}
