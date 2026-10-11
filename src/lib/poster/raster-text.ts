import type { RasterText } from './painter';

/**
 * Text the bundled fonts cannot draw (Bengali, Chinese, Arabic, emoji and so on) is drawn with the
 * visitor's own system fonts on a small canvas and placed on the poster as an image. It is the one
 * part of a poster that is not vector, and it is rendered at six times poster resolution so it
 * still prints cleanly.
 */

const SCALE = 6;
const cache = new Map<string, ReturnType<RasterText>>();

export const rasterText: RasterText = (text, css, size, fill, trackingEm) => {
  const key = `${text}|${css.family}|${css.weight}|${css.style}|${size}|${fill}|${trackingEm}`;
  if (cache.has(key)) return cache.get(key)!;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const font = `${css.style} ${css.weight} ${size * SCALE}px ${css.family}`;
  const spacing = `${(trackingEm * size * SCALE).toFixed(2)}px`;
  const prepare = () => {
    ctx.font = font;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
    ctx.textBaseline = 'alphabetic';
  };
  prepare();
  const metrics = ctx.measureText(text);
  const pad = 2 * SCALE;
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || size * SCALE * 0.9) + pad;
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || size * SCALE * 0.3) + pad;
  const width = Math.ceil(metrics.width) + pad * 2;
  if (width <= pad * 2 || width > 16000) return null;
  canvas.width = width;
  canvas.height = ascent + descent;
  prepare();
  ctx.fillStyle = fill;
  ctx.fillText(text, pad, ascent);

  let result: ReturnType<RasterText> = null;
  try {
    result = {
      href: canvas.toDataURL('image/png'),
      width: (width - pad * 2) / SCALE,
      ascent: ascent / SCALE,
      descent: descent / SCALE,
      pixelWidth: width,
      pixelHeight: canvas.height,
      rgba: ctx.getImageData(0, 0, width, canvas.height).data,
    };
    // The image includes a little padding so glyphs are never clipped; widen it to match.
    result.width = width / SCALE;
  } catch {
    result = null;
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, result);
  return result;
};
