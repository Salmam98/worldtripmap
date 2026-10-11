import { formatCount as pretty } from '../maps/stats';
import type { MapDefinition } from '../maps/types';
import { BLEED_PT, type PdfSize, type PngSize, type PosterFormat } from './formats';
import { sceneToPdf } from './pdf';
import { drawScene } from './render-canvas';
import type { Scene } from './scene';
import type { PosterSettings } from './settings';

export interface ExportedFile {
  blob: Blob;
  filename: string;
  /** Plain description for the confirmation message, e.g. "2,160 × 2,700 px". */
  detail: string;
}

function baseName(def: MapDefinition, settings: PosterSettings): string {
  return `worldtripmap-${def.slug}-${settings.template}`;
}

// ------------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Adds the print resolution to a PNG (a pHYs chunk after the header), so layout and print
 * software place the file at its intended physical size instead of assuming 72 dpi.
 */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const IHDR_END = 8 + 25;
  if (png.length < IHDR_END || String.fromCharCode(...png.slice(12, 16)) !== 'IHDR') return png;
  if (String.fromCharCode(...png.slice(IHDR_END + 4, IHDR_END + 8)) === 'pHYs') return png;
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(png.subarray(IHDR_END), IHDR_END + chunk.length);
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty'))), 'image/png');
  });
}

export async function exportPng(scene: Scene, def: MapDefinition, settings: PosterSettings, size: PngSize): Promise<ExportedFile> {
  const canvas = document.createElement('canvas');
  let blob: Blob;
  try {
    await drawScene(canvas, scene, size.width);
    blob = await canvasToBlob(canvas);
  } catch {
    throw new Error(
      `This device could not draw an image ${pretty(size.width)} pixels wide. Try the standard size, or download the PDF.`,
    );
  } finally {
    // Free the pixel buffer straight away; large canvases are expensive on phones.
    canvas.width = 0;
    canvas.height = 0;
  }
  const height = Math.round((size.width * scene.height) / scene.width);
  if (size.dpi) {
    blob = new Blob([withDpi(new Uint8Array(await blob.arrayBuffer()), size.dpi) as BlobPart], { type: 'image/png' });
  }
  return {
    blob,
    filename: `${baseName(def, settings)}-${size.width}x${height}.png`,
    detail: `${pretty(size.width)} × ${pretty(height)} px`,
  };
}

// ------------------------------------------------------------------------ PDF

export async function exportPdf(
  scene: Scene,
  def: MapDefinition,
  settings: PosterSettings,
  pdf: PdfSize,
  bleed: boolean,
): Promise<ExportedFile> {
  const bytes = await sceneToPdf(scene, {
    widthPt: pdf.widthPt,
    heightPt: pdf.heightPt,
    bleedPt: bleed ? BLEED_PT : 0,
    title: settings.title || def.defaultPosterTitle,
    author: settings.name || undefined,
    subject: `${def.name}, made with WorldTripMap`,
  });
  const slug = pdf.name.replace(/\(.*\)/, '').replace(/×/g, 'x').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    filename: `${baseName(def, settings)}-${slug}.pdf`,
    detail: `${pdf.name}, vector PDF${bleed ? ' with 3 mm bleed' : ''}`,
  };
}

/** Bleed in poster units for a scene that will be written at this PDF size. */
export function bleedUnits(format: PosterFormat, pdf: PdfSize): number {
  return BLEED_PT / (pdf.widthPt / format.width);
}

// ------------------------------------------------------------------- delivery

export function saveFile(file: ExportedFile): string {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return url;
}

export function canShareFile(file: ExportedFile): boolean {
  try {
    const candidate = new File([file.blob], file.filename, { type: file.blob.type });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [candidate] });
  } catch {
    return false;
  }
}

export async function shareFile(file: ExportedFile, text: string, url?: string): Promise<boolean> {
  try {
    const candidate = new File([file.blob], file.filename, { type: file.blob.type });
    await navigator.share({ files: [candidate], title: 'WorldTripMap', text, ...(url ? { url } : {}) });
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
