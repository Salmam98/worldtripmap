import { parsePath, type Matrix, type Scene, type SceneNode } from './scene';

/**
 * A small, dependency-free PDF writer for poster scenes.
 *
 * It writes PDF 1.4 with vector paths only: every map boundary and every letter is an outline, so
 * the file prints sharp at any size and needs no fonts on the printer's side. Colours are
 * DeviceRGB (treated as sRGB by home, photo-lab and online poster printers). The page can carry a
 * bleed margin, declared with TrimBox and BleedBox the way print shops expect.
 */

export interface PdfOptions {
  /** Trim size in points (1/72 inch). The scene is scaled to fit this exactly. */
  widthPt: number;
  heightPt: number;
  /** Bleed on each side, in points. The scene must have been composed with matching bleed. */
  bleedPt?: number;
  title?: string;
  author?: string;
  subject?: string;
  /** Fixed timestamp, so tests can produce identical bytes. Defaults to now. */
  date?: Date;
}

const encoder = new TextEncoder();

function num(v: number): string {
  if (!Number.isFinite(v)) throw new Error('A poster coordinate was not a finite number.');
  const s = v.toFixed(3);
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
}

function rgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Unsupported colour "${hex}". Use #RRGGBB.`);
  return m
    .slice(1)
    .map((c) => num(parseInt(c, 16) / 255))
    .join(' ');
}

/** A PDF text string: plain ASCII when possible, otherwise UTF-16BE with a byte-order mark. */
function textString(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return `(${value.replace(/([\\()])/g, '\\$1')})`;
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function pdfDate(date: Date): string {
  const p = (v: number, n = 2) => String(v).padStart(n, '0');
  return (
    `D:${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function pathOps(d: string): string {
  let out = '';
  for (const s of parsePath(d)) {
    if (s.op === 'M') out += `${num(s.x)} ${num(s.y)} m\n`;
    else if (s.op === 'L') out += `${num(s.x)} ${num(s.y)} l\n`;
    else if (s.op === 'C') out += `${num(s.x1)} ${num(s.y1)} ${num(s.x2)} ${num(s.y2)} ${num(s.x)} ${num(s.y)} c\n`;
    else out += 'h\n';
  }
  return out;
}

const cm = (m: Matrix) => `${m.map(num).join(' ')} cm\n`;

interface ImageResource {
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

class ContentBuilder {
  parts: string[] = [];
  alphas = new Map<string, string>();
  images: ImageResource[] = [];

  private alpha(fill: number, stroke: number): string {
    const key = `${num(fill)}/${num(stroke)}`;
    let name = this.alphas.get(key);
    if (!name) {
      name = `GS${this.alphas.size + 1}`;
      this.alphas.set(key, name);
    }
    return name;
  }

  node(node: SceneNode): void {
    if (node.type === 'path') {
      const hasFill = Boolean(node.fill);
      const hasStroke = Boolean(node.stroke);
      if (!hasFill && !hasStroke) return;
      let s = 'q\n';
      if (node.transform) s += cm(node.transform);
      const fa = node.fillOpacity ?? 1;
      const sa = node.strokeOpacity ?? 1;
      if (fa < 1 || sa < 1) s += `/${this.alpha(fa, sa)} gs\n`;
      if (hasFill) s += `${rgb(node.fill!)} rg\n`;
      if (hasStroke) {
        s += `${rgb(node.stroke!)} RG\n${num(node.strokeWidth ?? 1)} w\n`;
        s += `${{ miter: 0, round: 1, bevel: 2 }[node.lineJoin ?? 'round']} j\n`;
        s += `${{ butt: 0, round: 1, square: 2 }[node.lineCap ?? 'butt']} J\n`;
        if (node.dash?.length) s += `[${node.dash.map(num).join(' ')}] 0 d\n`;
      }
      s += pathOps(node.d);
      s += hasFill && hasStroke ? 'B\n' : hasFill ? 'f\n' : 'S\n';
      s += 'Q\n';
      this.parts.push(s);
      return;
    }
    if (node.type === 'image') {
      if (!node.rgba) return;
      const name = `Im${this.images.length + 1}`;
      this.images.push({ name, width: node.pixelWidth, height: node.pixelHeight, rgba: node.rgba });
      // Image space is a unit square with its origin at the bottom left; flip it back upright.
      this.parts.push(`q\n${cm([node.width, 0, 0, -node.height, node.x, node.y + node.height])}/${name} Do\nQ\n`);
      return;
    }
    let s = 'q\n';
    if (node.transform) s += cm(node.transform);
    if (node.clip) s += `${pathOps(node.clip)}W n\n`;
    this.parts.push(s);
    for (const child of node.children) this.node(child);
    this.parts.push('Q\n');
  }
}

export async function sceneToPdf(scene: Scene, options: PdfOptions): Promise<Uint8Array> {
  const bleed = options.bleedPt ?? 0;
  const k = options.widthPt / scene.width;
  const heightPt = options.heightPt;
  if (Math.abs(scene.height * k - heightPt) > 1) {
    throw new Error('The PDF page and the poster have different proportions.');
  }
  const mediaW = options.widthPt + bleed * 2;
  const mediaH = heightPt + bleed * 2;

  const builder = new ContentBuilder();
  // Paper, including the bleed area.
  builder.parts.push(`q\n${rgb(scene.background)} rg\n0 0 ${num(mediaW)} ${num(mediaH)} re\nf\nQ\n`);
  // Scene units run down the page; PDF units run up. One matrix handles scale, flip and bleed.
  builder.parts.push(`q\n${cm([k, 0, 0, -k, bleed, mediaH - bleed])}`);
  for (const node of scene.nodes) builder.node(node);
  builder.parts.push('Q\n');

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  let nextId = 1;
  const reserve = () => nextId++;
  const begin = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };
  const end = () => push('\nendobj\n');
  const stream = async (id: number, dictionary: string, raw: Uint8Array) => {
    const packed = await deflate(raw);
    const body = packed ?? raw;
    begin(id);
    push(`<< ${dictionary}${packed ? ' /Filter /FlateDecode' : ''} /Length ${body.length} >>\nstream\n`);
    push(body);
    push('\nendstream');
    end();
  };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const catalogId = reserve();
  const pagesId = reserve();
  const pageId = reserve();
  const contentId = reserve();
  const infoId = reserve();
  const stateIds = [...builder.alphas.entries()].map(([key, name]) => ({ key, name, id: reserve() }));
  const imageIds = builder.images.map((image) => ({ image, id: reserve(), maskId: reserve() }));

  begin(catalogId);
  push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  end();

  begin(pagesId);
  push(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  end();

  const resources =
    '<< ' +
    (stateIds.length ? `/ExtGState << ${stateIds.map((s) => `/${s.name} ${s.id} 0 R`).join(' ')} >> ` : '') +
    (imageIds.length ? `/XObject << ${imageIds.map((i) => `/${i.image.name} ${i.id} 0 R`).join(' ')} >> ` : '') +
    '>>';
  const trim = `[${num(bleed)} ${num(bleed)} ${num(bleed + options.widthPt)} ${num(bleed + heightPt)}]`;
  begin(pageId);
  push(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(mediaW)} ${num(mediaH)}] ` +
      `/BleedBox [0 0 ${num(mediaW)} ${num(mediaH)}] /TrimBox ${trim} ` +
      `/Resources ${resources} /Contents ${contentId} 0 R >>`,
  );
  end();

  await stream(contentId, '', encoder.encode(builder.parts.join('')));

  const date = pdfDate(options.date ?? new Date());
  begin(infoId);
  push(
    `<< /Title ${textString(options.title ?? 'Travel map')} ` +
      (options.author ? `/Author ${textString(options.author)} ` : '') +
      (options.subject ? `/Subject ${textString(options.subject)} ` : '') +
      `/Creator (WorldTripMap) /Producer (WorldTripMap poster engine) /CreationDate (${date}) /ModDate (${date}) >>`,
  );
  end();

  for (const state of stateIds) {
    const [fill, stroke] = state.key.split('/');
    begin(state.id);
    push(`<< /Type /ExtGState /ca ${fill} /CA ${stroke} >>`);
    end();
  }

  for (const { image, id, maskId } of imageIds) {
    const pixels = image.width * image.height;
    const colour = new Uint8Array(pixels * 3);
    const alpha = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      colour[i * 3] = image.rgba[i * 4];
      colour[i * 3 + 1] = image.rgba[i * 4 + 1];
      colour[i * 3 + 2] = image.rgba[i * 4 + 2];
      alpha[i] = image.rgba[i * 4 + 3];
    }
    const base = `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /BitsPerComponent 8`;
    await stream(id, `${base} /ColorSpace /DeviceRGB /SMask ${maskId} 0 R`, colour);
    await stream(maskId, `${base} /ColorSpace /DeviceGray`, alpha);
  }

  const xref = length;
  push(`xref\n0 ${nextId}\n0000000000 65535 f \n`);
  for (let id = 1; id < nextId; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
