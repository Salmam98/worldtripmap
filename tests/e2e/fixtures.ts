import { readFileSync } from 'node:fs';
import { test as base, expect, type Download, type Locator, type Page } from '@playwright/test';

type MapSlug = 'canada' | 'world' | 'canada-cities';

interface Meta {
  width: number;
  height: number;
  features: Record<string, { label: [number, number]; size: number }>;
}

const META: Record<MapSlug, Meta> = {
  canada: JSON.parse(readFileSync(new URL('../../src/data/maps/canada.meta.json', import.meta.url), 'utf8')),
  world: JSON.parse(readFileSync(new URL('../../src/data/maps/world.meta.json', import.meta.url), 'utf8')),
  'canada-cities': JSON.parse(readFileSync(new URL('../../src/data/maps/canada-cities.meta.json', import.meta.url), 'utf8')),
};

export interface TrackedEvent {
  name: string;
  props: Record<string, string | number | boolean>;
}

/**
 * Every test fails if the page logs an error, throws, or trips the Content Security Policy.
 * A test that expects a particular message gives a pattern for it in `allowed`.
 */
export const test = base.extend<{ problems: string[]; allowed: RegExp | null }>({
  allowed: [null, { option: true }],
  problems: [
    async ({ page, allowed }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(message.text());
      });
      page.on('pageerror', (error) => problems.push(`Uncaught: ${error.message}`));
      await page.addInitScript(() => {
        const w = window as unknown as { __events: unknown[] };
        w.__events = [];
        window.addEventListener('wtm:track', (event) => w.__events.push((event as CustomEvent).detail));
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`Content Security Policy blocked ${event.violatedDirective}: ${event.blockedURI}`);
        });
      });
      await use(problems);
      const unexpected = problems.filter((p) => !(allowed && allowed.test(p)));
      expect(unexpected, 'errors logged by the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function events(page: Page): Promise<TrackedEvent[]> {
  return page.evaluate(() => (window as unknown as { __events: TrackedEvent[] }).__events);
}

export async function eventNames(page: Page): Promise<string[]> {
  return (await events(page)).map((e) => e.name);
}

/** Opens a map page and waits until saved marks have loaded and the map can be used. */
export async function openMap(page: Page, slug: MapSlug, hash = ''): Promise<Locator> {
  await page.goto(`/maps/${slug}/${hash}`);
  const app = page.locator(`.mapapp[data-map="${slug}"]`);
  await expect(app).toHaveAttribute('data-ready', 'true');
  return app;
}

/** Opens a poster studio and waits for the first preview to be drawn. */
export async function openStudio(page: Page, slug: MapSlug, hash = ''): Promise<Locator> {
  await page.goto(`/maps/${slug}/poster/${hash}`);
  const studio = page.locator(`.studio[data-map="${slug}"]`);
  await expect(studio).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  return studio;
}

/** Where a place's label point is on screen right now, whatever the zoom. */
export async function pointOf(page: Page, slug: MapSlug, id: string): Promise<{ x: number; y: number }> {
  const [ux, uy] = META[slug].features[id].label;
  const svg = page.locator(`.mapapp[data-map="${slug}"] .map__svg`);
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  const view = (await svg.getAttribute('viewBox'))!.split(/\s+/).map(Number);
  return { x: box.x + ((ux - view[0]) / view[2]) * box.width, y: box.y + ((uy - view[1]) / view[3]) * box.height };
}

/** Clicks (or taps) a place on the map itself, at the point where its label sits. */
export async function clickPlace(page: Page, slug: MapSlug, id: string): Promise<void> {
  const { x, y } = await pointOf(page, slug, id);
  if (page.context().browser() && (await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

export const count = (app: Locator) => app.locator('.progress__count');
export const percent = (app: Locator) => app.locator('.progress__percent strong');
export const shape = (app: Locator, id: string) => app.locator(`.map__svg [data-id="${id}"][role="checkbox"]`).first();
export const row = (app: Locator, name: string) => app.locator('.place', { has: app.page().locator('.place__name', { hasText: new RegExp(`^${name}$`) }) });

/**
 * Makes sure a place's row is on screen. The rows of a closed group are only built when it is
 * opened, so closed groups are opened in turn until the row turns up.
 */
export async function revealRow(app: Locator, name: string): Promise<Locator> {
  const target = row(app, name);
  if (!(await target.isVisible())) {
    const closed = app.locator('details.place-group:not([open])');
    for (let remaining = await closed.count(); remaining > 0 && !(await target.isVisible()); remaining--) {
      await closed.first().locator('summary').click();
    }
  }
  await expect(target).toBeVisible();
  return target;
}

/** Layout shift recorded since the page began loading, as the browser reports it for Core Web Vitals. */
export async function layoutShift(page: Page): Promise<{ total: number; moved: string[] }> {
  return page.evaluate(
    () =>
      new Promise<{ total: number; moved: string[] }>((resolve) => {
        let total = 0;
        const moved: string[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] }[]) {
            if (entry.hadRecentInput) continue;
            total += entry.value;
            for (const source of entry.sources ?? []) {
              const node = source.node as Element | null | undefined;
              if (node && node.nodeType === 1) moved.push(`${node.tagName.toLowerCase()}${node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/).join('.')}` : ''}`);
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve({ total, moved });
        }, 250);
      }),
  );
}

export async function tick(app: Locator, name: string): Promise<void> {
  const target = await revealRow(app, name);
  await target.locator('.place__main').click();
}

/** Seeds this browser's saved data before the page loads. */
export async function seed(page: Page, data: Record<string, unknown>): Promise<void> {
  await page.addInitScript((entries) => {
    // Only on the first load: a reload must show what the page itself saved.
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, data);
}

export async function saved(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

export async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFileSync(path);
}

/** Width, height and (if present) pixels per metre of a PNG. */
export function pngInfo(png: Buffer): { width: number; height: number; pixelsPerMetre: number | null } {
  expect(png.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
  expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR');
  const phys = png.indexOf(Buffer.from('pHYs', 'latin1'));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), pixelsPerMetre: phys > 0 && phys < 200 ? png.readUInt32BE(phys + 4) : null };
}

/** Page size in points of a single-page PDF made by the poster engine. */
export function pdfInfo(pdf: Buffer): { width: number; height: number; trim: number[] | null; text: string } {
  const text = pdf.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const media = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)!;
  const trim = /\/TrimBox \[([\d. ]+)\]/.exec(text);
  return { width: Number(media[1]), height: Number(media[2]), trim: trim ? trim[1].split(' ').map(Number) : null, text };
}
