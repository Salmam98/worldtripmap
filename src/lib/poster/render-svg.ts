import type { Matrix, Scene, SceneNode } from './scene';

const n = (v: number) => Number(v.toFixed(3));

function matrix(m: Matrix | undefined): string {
  return m ? ` transform="matrix(${m.map(n).join(' ')})"` : '';
}

function attr(name: string, value: string | number | undefined): string {
  return value === undefined ? '' : ` ${name}="${value}"`;
}

function render(node: SceneNode, ids: { next: number; prefix: string }): string {
  if (node.type === 'path') {
    return (
      `<path d="${node.d}"` +
      attr('fill', node.fill ?? 'none') +
      attr('fill-opacity', node.fillOpacity) +
      attr('stroke', node.stroke) +
      attr('stroke-width', node.stroke ? n(node.strokeWidth ?? 1) : undefined) +
      attr('stroke-opacity', node.strokeOpacity) +
      attr('stroke-linejoin', node.stroke ? (node.lineJoin ?? 'round') : undefined) +
      attr('stroke-linecap', node.stroke && node.lineCap ? node.lineCap : undefined) +
      attr('stroke-dasharray', node.dash ? node.dash.map(n).join(' ') : undefined) +
      matrix(node.transform) +
      '/>'
    );
  }
  if (node.type === 'image') {
    // Images are only ever text that this page rasterised itself. Anything else is left out.
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(node.href)) return '';
    return `<image x="${n(node.x)}" y="${n(node.y)}" width="${n(node.width)}" height="${n(node.height)}" preserveAspectRatio="none" href="${node.href}"/>`;
  }
  let open = `<g${matrix(node.transform)}>`;
  let close = '</g>';
  if (node.clip) {
    const id = `${ids.prefix}c${ids.next++}`;
    open = `<g${matrix(node.transform)}><clipPath id="${id}"><path d="${node.clip}"/></clipPath><g clip-path="url(#${id})">`;
    close = '</g></g>';
  }
  return open + node.children.map((child) => render(child, ids)).join('') + close;
}

export interface SvgOptions {
  /** Unique prefix for ids, needed when several posters share one page. */
  idPrefix?: string;
  /** Include the bleed area. The preview shows the trimmed poster; print files include it. */
  withBleed?: boolean;
  /** Rendered width and height attributes. Omit for a scalable SVG. */
  pixelWidth?: number;
}

/** Serialises a scene as a standalone SVG document. The scene holds only shapes, so no escaping of user text is involved. */
export function sceneToSvg(scene: Scene, options: SvgOptions = {}): string {
  const bleed = options.withBleed ? scene.bleed : 0;
  const w = scene.width + bleed * 2;
  const h = scene.height + bleed * 2;
  const ids = { next: 0, prefix: options.idPrefix ?? 'p' };
  const size = options.pixelWidth
    ? ` width="${options.pixelWidth}" height="${Math.round((options.pixelWidth * h) / w)}"`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-bleed} ${-bleed} ${n(w)} ${n(h)}"${size}>` +
    scene.nodes.map((node) => render(node, ids)).join('') +
    '</svg>'
  );
}
