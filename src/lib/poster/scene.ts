/**
 * A poster is a resolution-independent list of shapes, the "scene". Text is turned into outlines
 * before it gets here, so a scene contains no fonts at all. Three small renderers draw the same
 * scene as SVG (the live preview), on a canvas (PNG) and as PDF (print), which is why what you see
 * is what you download.
 */

/** [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface PathNode {
  type: 'path';
  /** SVG path data using M, L, C, Q and Z in absolute or relative form. */
  d: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  /** In the node's own coordinates, so it scales with any transform. */
  strokeWidth?: number;
  strokeOpacity?: number;
  lineJoin?: 'round' | 'miter' | 'bevel';
  lineCap?: 'butt' | 'round' | 'square';
  dash?: number[];
  transform?: Matrix;
}

export interface GroupNode {
  type: 'group';
  transform?: Matrix;
  /** Path data, in the group's coordinates, that clips everything inside. */
  clip?: string;
  children: SceneNode[];
}

/** A bitmap, used only for text in scripts the bundled fonts do not cover. */
export interface ImageNode {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  /** PNG data URL. */
  href: string;
  /** Straight (non-premultiplied) RGBA pixels, for the PDF writer. */
  rgba?: Uint8ClampedArray;
}

export type SceneNode = PathNode | GroupNode | ImageNode;

export interface Scene {
  /** Trim size in poster units. */
  width: number;
  height: number;
  /** Extra background drawn beyond each edge, in poster units. */
  bleed: number;
  /** Paper colour, also used behind the page in previews. */
  background: string;
  nodes: SceneNode[];
  /** One sentence describing the poster for screen readers. */
  description: string;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function scale(s: number): Matrix {
  return [s, 0, 0, s, 0, 0];
}

export function rotate(degrees: number, cx = 0, cy = 0): Matrix {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

// ------------------------------------------------------------------ path data

export type Segment =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Z' };

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };

/**
 * Parses the subset of SVG path data the engine produces (M L H V C Q Z, absolute or relative,
 * with implicit repeats) into absolute moves, lines and cubic curves.
 */
export function parsePath(d: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = '';
  const n = d.length;

  const skip = () => {
    while (i < n) {
      const c = d.charCodeAt(i);
      if (c === 32 || c === 44 || c === 10 || c === 9 || c === 13) i++;
      else break;
    }
  };
  const number = (): number => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) throw new Error(`Bad path data near "${d.slice(Math.max(0, i - 10), i + 10)}"`);
    i = NUMBER.lastIndex;
    return Number(match[0]);
  };

  while (true) {
    skip();
    if (i >= n) break;
    const ch = d[i];
    if (/[a-zA-Z]/.test(ch)) {
      command = ch;
      i++;
    } else if (!command) {
      throw new Error('Path data must start with a command.');
    } else if (command === 'M') {
      command = 'L';
    } else if (command === 'm') {
      command = 'l';
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;
    const arity = ARITY[upper];
    if (arity === undefined) throw new Error(`Unsupported path command "${command}".`);

    if (upper === 'Z') {
      out.push({ op: 'Z' });
      x = startX;
      y = startY;
      command = '';
      continue;
    }
    const a: number[] = [];
    for (let k = 0; k < arity; k++) a.push(number());
    const bx = relative ? x : 0;
    const by = relative ? y : 0;

    switch (upper) {
      case 'M':
        x = a[0] + bx;
        y = a[1] + by;
        startX = x;
        startY = y;
        out.push({ op: 'M', x, y });
        break;
      case 'L':
        x = a[0] + bx;
        y = a[1] + by;
        out.push({ op: 'L', x, y });
        break;
      case 'H':
        x = a[0] + bx;
        out.push({ op: 'L', x, y });
        break;
      case 'V':
        y = a[0] + by;
        out.push({ op: 'L', x, y });
        break;
      case 'C':
        out.push({ op: 'C', x1: a[0] + bx, y1: a[1] + by, x2: a[2] + bx, y2: a[3] + by, x: a[4] + bx, y: a[5] + by });
        x = a[4] + bx;
        y = a[5] + by;
        break;
      case 'Q': {
        // A quadratic curve is drawn as the equivalent cubic.
        const qx = a[0] + bx;
        const qy = a[1] + by;
        const ex = a[2] + bx;
        const ey = a[3] + by;
        out.push({
          op: 'C',
          x1: x + (2 / 3) * (qx - x),
          y1: y + (2 / 3) * (qy - y),
          x2: ex + (2 / 3) * (qx - ex),
          y2: ey + (2 / 3) * (qy - ey),
          x: ex,
          y: ey,
        });
        x = ex;
        y = ey;
        break;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- shape helpers

const K = 0.5522847498307936;
const f = (v: number) => Number(v.toFixed(3));

export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
}

export function circlePath(cx: number, cy: number, r: number): string {
  const k = K * r;
  return (
    `M${f(cx + r)} ${f(cy)}` +
    `C${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)}` +
    `C${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}` +
    `C${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)}` +
    `C${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Z`
  );
}

export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
}

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = K * r;
  return (
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}C${f(x + w - r + k)} ${f(y)} ${f(x + w)} ${f(y + r - k)} ${f(x + w)} ${f(y + r)}` +
    `V${f(y + h - r)}C${f(x + w)} ${f(y + h - r + k)} ${f(x + w - r + k)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}` +
    `H${f(x + r)}C${f(x + r - k)} ${f(y + h)} ${f(x)} ${f(y + h - r + k)} ${f(x)} ${f(y + h - r)}` +
    `V${f(y + r)}C${f(x)} ${f(y + r - k)} ${f(x + r - k)} ${f(y)} ${f(x + r)} ${f(y)}Z`
  );
}
