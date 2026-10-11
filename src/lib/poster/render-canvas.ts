import { parsePath, type Scene, type SceneNode } from './scene';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function trace(ctx: Ctx, d: string): void {
  ctx.beginPath();
  for (const s of parsePath(d)) {
    if (s.op === 'M') ctx.moveTo(s.x, s.y);
    else if (s.op === 'L') ctx.lineTo(s.x, s.y);
    else if (s.op === 'C') ctx.bezierCurveTo(s.x1, s.y1, s.x2, s.y2, s.x, s.y);
    else ctx.closePath();
  }
}

async function draw(ctx: Ctx, node: SceneNode, images: Map<string, CanvasImageSource>): Promise<void> {
  if (node.type === 'path') {
    ctx.save();
    if (node.transform) ctx.transform(...node.transform);
    trace(ctx, node.d);
    if (node.fill) {
      ctx.globalAlpha = node.fillOpacity ?? 1;
      ctx.fillStyle = node.fill;
      ctx.fill('nonzero');
    }
    if (node.stroke) {
      ctx.globalAlpha = node.strokeOpacity ?? 1;
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node.strokeWidth ?? 1;
      ctx.lineJoin = node.lineJoin ?? 'round';
      ctx.lineCap = node.lineCap ?? 'butt';
      ctx.setLineDash(node.dash ?? []);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (node.type === 'image') {
    let image = images.get(node.href);
    if (!image) {
      image = await loadImage(node.href);
      images.set(node.href, image);
    }
    ctx.drawImage(image, node.x, node.y, node.width, node.height);
    return;
  }
  ctx.save();
  if (node.transform) ctx.transform(...node.transform);
  if (node.clip) {
    trace(ctx, node.clip);
    ctx.clip('nonzero');
  }
  for (const child of node.children) await draw(ctx, child, images);
  ctx.restore();
}

function loadImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not draw a text image.'));
    image.src = href;
  });
}

/**
 * Draws a scene on a canvas at an exact pixel size. Shapes are traced as vector paths at the
 * target resolution, so a 4,608 px export is as sharp as a 1,080 px one.
 */
export async function drawScene(canvas: HTMLCanvasElement | OffscreenCanvas, scene: Scene, pixelWidth: number): Promise<void> {
  const pixelHeight = Math.round((pixelWidth * scene.height) / scene.width);
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('This browser could not create a drawing surface of that size.');
  const k = pixelWidth / scene.width;
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const images = new Map<string, CanvasImageSource>();
  for (const node of scene.nodes) await draw(ctx, node, images);
}
