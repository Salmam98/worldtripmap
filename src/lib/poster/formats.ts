/**
 * Output formats. Posters are composed in "poster units" (1,080 units on the short side), then
 * scaled to pixels for PNG or to points for PDF. PNG sizes stay under 16.7 million pixels, the
 * largest canvas older iPhones can draw, so the same export works on phones and desktops.
 */
export type FormatId = 'post' | 'story' | 'pin' | 'print' | 'print-wide' | 'a-series' | 'a-series-wide';

export interface PngSize {
  id: 'standard' | 'large';
  width: number;
  height: number;
  note: string;
  /** Print resolution written into the file, for sizes meant for paper. */
  dpi?: number;
}

export interface PdfSize {
  /** Printed name, e.g. "18 × 24 in". */
  name: string;
  widthPt: number;
  heightPt: number;
  note: string;
}

export interface PosterFormat {
  id: FormatId;
  name: string;
  detail: string;
  group: 'share' | 'print';
  /** Design size in poster units. */
  width: number;
  height: number;
  /** Extra room kept clear at the top and bottom, for app controls drawn over full-screen stories. */
  safeTop?: number;
  safeBottom?: number;
  png: PngSize[];
  pdf: PdfSize | null;
}

const IN = 72;
const MM = 72 / 25.4;

export const FORMATS: PosterFormat[] = [
  {
    id: 'post',
    name: 'Post',
    detail: '4:5, for Instagram and Facebook feeds and messaging apps',
    group: 'share',
    width: 1080,
    height: 1350,
    png: [
      { id: 'standard', width: 1080, height: 1350, note: 'The size feeds display' },
      { id: 'large', width: 2160, height: 2700, note: 'Twice the detail, for zooming in' },
    ],
    pdf: { name: '8 × 10 in', widthPt: 8 * IN, heightPt: 10 * IN, note: 'Also prints at 16 × 20 in' },
  },
  {
    id: 'story',
    name: 'Story',
    detail: '9:16, full screen for Instagram Stories and TikTok',
    group: 'share',
    width: 1080,
    height: 1920,
    safeTop: 150,
    safeBottom: 210,
    png: [
      { id: 'standard', width: 1080, height: 1920, note: 'Full-screen phone size' },
      { id: 'large', width: 2160, height: 3840, note: 'Twice the detail' },
    ],
    pdf: null,
  },
  {
    id: 'pin',
    name: 'Pin',
    detail: '2:3, the shape Pinterest shows best',
    group: 'share',
    width: 1080,
    height: 1620,
    png: [
      { id: 'standard', width: 1000, height: 1500, note: 'Pinterest’s recommended size' },
      { id: 'large', width: 2000, height: 3000, note: 'Twice the detail' },
    ],
    pdf: null,
  },
  {
    id: 'print',
    name: 'Poster, upright',
    detail: '3:4, the common 18 × 24 in frame',
    group: 'print',
    width: 1080,
    height: 1440,
    png: [
      { id: 'standard', width: 2700, height: 3600, note: '300 dpi at 9 × 12 in', dpi: 300 },
      { id: 'large', width: 3456, height: 4608, note: '288 dpi at 12 × 16 in', dpi: 288 },
    ],
    pdf: { name: '18 × 24 in', widthPt: 18 * IN, heightPt: 24 * IN, note: 'Vector: also sharp at 12 × 16 in and 9 × 12 in' },
  },
  {
    id: 'print-wide',
    name: 'Poster, wide',
    detail: '4:3, a 24 × 18 in frame on its side',
    group: 'print',
    width: 1440,
    height: 1080,
    png: [
      { id: 'standard', width: 3600, height: 2700, note: '300 dpi at 12 × 9 in', dpi: 300 },
      { id: 'large', width: 4608, height: 3456, note: '288 dpi at 16 × 12 in', dpi: 288 },
    ],
    pdf: { name: '24 × 18 in', widthPt: 24 * IN, heightPt: 18 * IN, note: 'Vector: also sharp at 16 × 12 in and 12 × 9 in' },
  },
  {
    id: 'a-series',
    name: 'A3, upright',
    detail: 'ISO paper: the same file prints on A4 and A2',
    group: 'print',
    width: 1080,
    // 1,527.5 units is A-series proportion to within a fifth of a point, and gives whole pixel sizes.
    height: 1527.5,
    png: [
      { id: 'standard', width: 2480, height: 3508, note: '300 dpi at A4', dpi: 300 },
      { id: 'large', width: 3400, height: 4809, note: '291 dpi at A3', dpi: 291 },
    ],
    pdf: { name: 'A3 (297 × 420 mm)', widthPt: 297 * MM, heightPt: 420 * MM, note: 'Vector: also sharp at A4 and A2' },
  },
  {
    id: 'a-series-wide',
    name: 'A3, wide',
    detail: 'ISO paper on its side',
    group: 'print',
    width: 1527.5,
    height: 1080,
    png: [
      { id: 'standard', width: 3508, height: 2480, note: '300 dpi at A4', dpi: 300 },
      { id: 'large', width: 4809, height: 3400, note: '291 dpi at A3', dpi: 291 },
    ],
    pdf: { name: 'A3 (420 × 297 mm)', widthPt: 420 * MM, heightPt: 297 * MM, note: 'Vector: also sharp at A4 and A2' },
  },
];

export function getFormat(id: string | undefined): PosterFormat {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

/** Bleed offered for print PDFs: 3 mm on every side, the usual request from print shops. */
export const BLEED_MM = 3;
export const BLEED_PT = BLEED_MM * MM;
