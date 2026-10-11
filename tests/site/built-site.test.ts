import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse, type HTMLElement } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { STATIC_ROUTES } from '../../src/lib/routes';

/**
 * Checks on the files a host would actually serve. Run `npm run build` first.
 * These cover the technical SEO promises: unique titles and descriptions, one H1, canonicals,
 * a truthful sitemap, working internal links, honest structured data, and no stray third parties.
 */

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const ORIGIN = 'https://worldtripmap.com';

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('dist/ is missing. Run `npm run build` before `npm run test:site`.');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

interface Page {
  file: string;
  /** URL path the host serves this file at. */
  path: string;
  html: string;
  root: HTMLElement;
  redirect: boolean;
  noindex: boolean;
}

const files = walk(dist);
const pages: Page[] = files
  .filter((f) => f.endsWith('.html'))
  .map((file) => {
    const html = readFileSync(file, 'utf8');
    const root = parse(html);
    const rel = relative(dist, file).replace(/\\/g, '/');
    const path = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
    const robots = root.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
    return { file, path, html, root, redirect: Boolean(root.querySelector('meta[http-equiv="refresh"]')), noindex: /noindex/.test(robots) };
  });

const content = pages.filter((p) => !p.redirect);
const indexable = content.filter((p) => !p.noindex);
const byPath = new Map(pages.map((p) => [p.path, p]));
const text = (el: HTMLElement | null | undefined) => (el?.text ?? '').replace(/\s+/g, ' ').trim();
const meta = (p: Page, selector: string) => p.root.querySelector(selector)?.getAttribute('content') ?? '';

/** Does the built site serve something at this root-relative URL? */
function served(url: string): boolean {
  const clean = url.split('#')[0].split('?')[0];
  if (clean.endsWith('/')) return existsSync(join(dist, clean, 'index.html'));
  return existsSync(join(dist, clean));
}

describe('pages that exist', () => {
  it('builds every page the route list promises, and nothing unexpected', () => {
    const guides = indexable.filter((p) => /^\/guides\/[^/]+\/$/.test(p.path)).map((p) => p.path);
    expect(guides.length).toBeGreaterThanOrEqual(11);
    expect(indexable.map((p) => p.path).sort()).toEqual([...STATIC_ROUTES, ...guides].sort());
  });

  it('has a custom 404 page that search engines are told to skip', () => {
    const lost = byPath.get('/404.html')!;
    expect(lost).toBeDefined();
    expect(lost.noindex).toBe(true);
    expect(text(lost.root.querySelector('h1'))).toBe('This page is not on the map');
    expect(lost.root.querySelectorAll('main a').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the short addresses working as redirects to real pages', () => {
    const redirects = pages.filter((p) => p.redirect);
    expect(redirects.map((p) => p.path).sort()).toEqual(['/canada/', '/poster/', '/world/']);
    for (const r of redirects) {
      const target = /url=([^"]+)/.exec(r.root.querySelector('meta[http-equiv="refresh"]')!.getAttribute('content')!)![1];
      expect(byPath.get(target)?.redirect, `${r.path} -> ${target}`).toBe(false);
      expect(r.noindex).toBe(true);
    }
  });
});

describe.each(content.map((p) => [p.path, p] as const))('%s', (_path, page) => {
  it('declares its language, encoding and viewport', () => {
    expect(page.root.querySelector('html')?.getAttribute('lang')).toBe('en-CA');
    expect(page.html.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(page.root.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    expect(meta(page, 'meta[name="viewport"]')).toBe('width=device-width, initial-scale=1');
  });

  it('has exactly one H1, and headings that do not skip levels', () => {
    const h1 = page.root.querySelectorAll('h1');
    expect(h1).toHaveLength(1);
    expect(text(h1[0]).length).toBeGreaterThan(3);
    let previous = 0;
    for (const h of page.root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = Number(h.tagName[1]);
      expect(level - previous, `"${text(h)}" is an h${level} after an h${previous}`).toBeLessThanOrEqual(1);
      previous = level;
    }
  });

  it('has a title and description of a sensible length', () => {
    const title = text(page.root.querySelector('title'));
    const description = meta(page, 'meta[name="description"]');
    // Search results show roughly the first 60 characters of a title.
    expect(title.length, title).toBeGreaterThanOrEqual(15);
    expect(title.length, title).toBeLessThanOrEqual(62);
    // The site name is part of the title wherever it fits; long guide headlines go without it.
    if (!title.includes('WorldTripMap')) expect(`${title} | WorldTripMap`.length, title).toBeGreaterThan(62);
    expect(description.length, description).toBeGreaterThanOrEqual(page.noindex ? 20 : 70);
    expect(description.length, description).toBeLessThanOrEqual(170);
  });

  it('has complete social sharing tags with an image that exists', () => {
    expect(meta(page, 'meta[property="og:title"]')).toBe(text(page.root.querySelector('title')));
    expect(meta(page, 'meta[property="og:description"]')).toBe(meta(page, 'meta[name="description"]'));
    expect(meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    const image = meta(page, 'meta[property="og:image"]');
    expect(image.startsWith(`${ORIGIN}/og/`), image).toBe(true);
    expect(served(image.slice(ORIGIN.length)), image).toBe(true);
    expect(meta(page, 'meta[property="og:image:alt"]').length).toBeGreaterThan(10);
  });

  it('links only to pages and files that exist, with no placeholders', () => {
    for (const a of page.root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href')!;
      expect(href, `empty or placeholder link "${text(a)}"`).not.toMatch(/^(#|javascript:|)$/i);
      if (href.startsWith('/')) {
        expect(served(href), `${href} ("${text(a)}")`).toBe(true);
        const [target, fragment] = href.split('#');
        if (fragment) expect(byPath.get(target)?.root.querySelector(`[id="${fragment}"]`), href).toBeTruthy();
        // Internal links use the canonical form, so no visitor or crawler meets a redirect.
        if (!/\.[a-z0-9]+$/i.test(target)) expect(target.endsWith('/'), `${href} should end in a slash`).toBe(true);
        expect(byPath.get(target)?.redirect ?? false, `${href} points at a redirect`).toBe(false);
      } else if (href.startsWith('#')) {
        expect(page.root.querySelector(`[id="${href.slice(1)}"]`), href).toBeTruthy();
      } else {
        expect(href, href).toMatch(/^(https:\/\/|mailto:)/);
      }
    }
  });

  it('gives every link and button a name', () => {
    for (const el of page.root.querySelectorAll('a[href], button')) {
      const name = text(el) || el.getAttribute('aria-label') || el.querySelector('img')?.getAttribute('alt') || '';
      // Decorative duplicate links are allowed when hidden from assistive technology and the tab order.
      if (el.getAttribute('aria-hidden') === 'true' && el.getAttribute('tabindex') === '-1') continue;
      expect(name.length, el.outerHTML.slice(0, 120)).toBeGreaterThan(0);
    }
  });

  it('describes every image and reserves its space', () => {
    for (const img of page.root.querySelectorAll('img')) {
      expect(img.hasAttribute('alt'), img.outerHTML.slice(0, 120)).toBe(true);
      expect(Number(img.getAttribute('width')), 'width').toBeGreaterThan(0);
      expect(Number(img.getAttribute('height')), 'height').toBeGreaterThan(0);
      const src = img.getAttribute('src')!;
      expect(served(src), src).toBe(true);
      for (const candidate of (img.getAttribute('srcset') ?? '').split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean)) {
        expect(served(candidate), candidate).toBe(true);
      }
    }
  });

  it('loads nothing from another company', () => {
    const urls = [
      ...page.root.querySelectorAll('script[src]').map((s) => s.getAttribute('src')!),
      ...page.root.querySelectorAll('link[href]').filter((l) => l.getAttribute('rel') !== 'canonical').map((l) => l.getAttribute('href')!),
      ...page.root.querySelectorAll('img[src], iframe[src], source[src], video[src]').map((s) => s.getAttribute('src')!),
    ];
    for (const url of urls) expect(url.startsWith('/') || url.startsWith('data:'), url).toBe(true);
    expect(page.html).not.toMatch(/googletagmanager|google-analytics|plausible\.io|fonts\.googleapis|facebook\.net|doubleclick/);
  });

  it('references scripts, styles and fonts that were actually built', () => {
    const assets = [
      ...page.root.querySelectorAll('script[src]').map((s) => s.getAttribute('src')!),
      ...page.root.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"], link[rel="icon"], link[rel="manifest"], link[rel="apple-touch-icon"]').map((l) => l.getAttribute('href')!),
    ];
    expect(assets.length).toBeGreaterThan(3);
    for (const url of assets) expect(served(url), url).toBe(true);
  });

  it('carries structured data only of the kinds the site can stand behind', () => {
    const allowed = new Set(['Organization', 'WebSite', 'BreadcrumbList', 'Article']);
    for (const script of page.root.querySelectorAll('script[type="application/ld+json"]')) {
      const data = JSON.parse(script.text) as Record<string, unknown>;
      expect(data['@context']).toBe('https://schema.org');
      expect(allowed.has(String(data['@type'])), String(data['@type'])).toBe(true);
      expect(script.text).not.toMatch(/aggregateRating|"Review"|ratingValue|FAQPage|SearchAction/);
    }
  });

  it('makes no promise the site cannot keep', () => {
    // The About page says, in so many words, that the site has none of these. That sentence is the one exception.
    const body = text(page.root.querySelector('body')).replace('You will not find testimonials, user counts or star ratings here that we cannot back up.', '');
    for (const claim of [/\b4K\b/i, /\bunlimited\b/i, /\bpremium\b/i, /\btestimonials?\b/i, /\btrusted by\b/i, /\brated\b/i, /\bstar ratings?\b/i, /\d[\d,.]*\s*(million|thousand|k\+?)?\s+(users|travellers|travelers|customers|downloads)\b/i, /\bbest[- ]selling\b/i, /\baward[- ]winning\b/i, /#1\b/]) {
      expect(body, `${claim} on ${page.path}`).not.toMatch(claim);
    }
    expect(body).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b|\bplaceholder text\b/i);
  });

  it('carries the content security policy before anything else can load', () => {
    const policy = meta(page, 'meta[http-equiv="Content-Security-Policy"]');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("object-src 'none'");
    const head = page.html.slice(0, page.html.indexOf('</head>'));
    const at = head.indexOf('Content-Security-Policy');
    for (const tag of ['<script', '<link', '<style']) {
      const first = head.indexOf(tag);
      if (first !== -1) expect(at, `${tag} comes before the policy`).toBeLessThan(first);
    }
  });
});

describe.each(indexable.map((p) => [p.path, p] as const))('%s is indexable', (_path, page) => {
  it('names itself as the canonical address, on HTTPS with a trailing slash', () => {
    const canonical = page.root.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].getAttribute('href')).toBe(ORIGIN + page.path);
    expect(meta(page, 'meta[property="og:url"]')).toBe(ORIGIN + page.path);
    expect(page.path.endsWith('/')).toBe(true);
    expect(page.path).toMatch(/^[a-z0-9/-]+$/);
  });

  it('has breadcrumbs in the page that match the breadcrumb data, except on the home page', () => {
    const ld = page.root
      .querySelectorAll('script[type="application/ld+json"]')
      .map((s) => JSON.parse(s.text) as { '@type': string; itemListElement?: { name: string; item: string; position: number }[] })
      .find((d) => d['@type'] === 'BreadcrumbList');
    if (page.path === '/') {
      expect(ld).toBeUndefined();
      return;
    }
    expect(ld, 'BreadcrumbList').toBeDefined();
    const items = ld!.itemListElement!;
    expect(items[0]).toMatchObject({ position: 1, name: 'Home', item: `${ORIGIN}/` });
    expect(items[items.length - 1].item).toBe(ORIGIN + page.path);
    items.forEach((item, i) => {
      expect(item.position).toBe(i + 1);
      expect(served(item.item.slice(ORIGIN.length)), item.item).toBe(true);
    });
    const visible = page.root.querySelectorAll('nav.breadcrumbs li').map((li) => text(li));
    expect(visible).toEqual(items.map((item) => item.name));
  });
});

describe('home page', () => {
  it('carries the headline exactly, as one phrase with its spaces', () => {
    // Each sentence is its own line on screen. Read without styles, by a crawler or a screen
    // reader, it must still be three sentences and not "Travels.Your World.Your".
    expect(byPath.get('/')!.root.querySelector('h1')!.text.trim()).toBe('Your Travels. Your World. Your Map.');
  });
});

describe('across the site', () => {
  it('gives every indexable page its own title, description and H1', () => {
    for (const [label, pick] of [
      ['title', (p: Page) => text(p.root.querySelector('title'))],
      ['description', (p: Page) => meta(p, 'meta[name="description"]')],
      ['h1', (p: Page) => text(p.root.querySelector('h1'))],
    ] as const) {
      const seen = new Map<string, string>();
      for (const p of indexable) {
        const value = pick(p);
        expect(seen.get(value), `${label} "${value}" is shared by ${seen.get(value)} and ${p.path}`).toBeUndefined();
        seen.set(value, p.path);
      }
    }
  });

  it('can reach every indexable page by following links from the home page', () => {
    const reached = new Set<string>(['/']);
    const queue = ['/'];
    while (queue.length) {
      const current = byPath.get(queue.shift()!)!;
      for (const a of current.root.querySelectorAll('a[href^="/"]')) {
        const target = a.getAttribute('href')!.split('#')[0].split('?')[0];
        if (byPath.has(target) && !reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    for (const p of indexable) expect(reached.has(p.path), `${p.path} is an orphan`).toBe(true);
  });

  it('gives each guide at least three internal links in its text, including one to a map or poster tool', () => {
    for (const p of indexable.filter((x) => /^\/guides\/[^/]+\/$/.test(x.path))) {
      const links = p.root.querySelectorAll('article a[href^="/"]').map((a) => a.getAttribute('href')!);
      expect(new Set(links).size, p.path).toBeGreaterThanOrEqual(3);
      expect(links.some((href) => href.startsWith('/maps/')), p.path).toBe(true);
    }
  });

  it('marks up each guide as an article with dates, an author and its sources', () => {
    for (const p of indexable.filter((x) => /^\/guides\/[^/]+\/$/.test(x.path))) {
      const article = p.root
        .querySelectorAll('script[type="application/ld+json"]')
        .map((s) => JSON.parse(s.text) as Record<string, any>)
        .find((d) => d['@type'] === 'Article')!;
      expect(article, p.path).toBeDefined();
      expect(article.headline).toBe(text(p.root.querySelector('h1')));
      expect(Number.isNaN(Date.parse(article.datePublished))).toBe(false);
      expect(Date.parse(article.dateModified)).toBeGreaterThanOrEqual(Date.parse(article.datePublished));
      expect(article.author.name).toBe('WorldTripMap');
      expect(article.mainEntityOfPage).toBe(ORIGIN + p.path);
      expect(meta(p, 'meta[property="og:type"]')).toBe('article');
      expect(p.root.querySelectorAll('.article__sources li a[href^="https://"]').length, `${p.path} sources`).toBeGreaterThanOrEqual(1);
      expect(p.root.querySelector('time[datetime]')).toBeTruthy();
    }
  });

  it('describes the organisation and the site once, on the home page', () => {
    const types = (p: Page) => p.root.querySelectorAll('script[type="application/ld+json"]').map((s) => (JSON.parse(s.text) as { '@type': string })['@type']);
    expect(types(byPath.get('/')!).sort()).toEqual(['Organization', 'WebSite']);
    for (const p of content.filter((x) => x.path !== '/')) expect(types(p)).not.toContain('Organization');
  });

  it('never links a map that is only planned', () => {
    for (const path of ['/', '/maps/']) {
      const page = byPath.get(path)!;
      const soon = page.root.querySelectorAll('.tag--soon');
      expect(soon.length, path).toBeGreaterThanOrEqual(2);
      for (const tag of soon) {
        expect(text(tag)).toBe('Coming soon');
        let el: HTMLElement | null = tag;
        while (el) {
          expect(el.tagName, `"Coming soon" inside a link on ${path}`).not.toBe('A');
          el = el.parentNode as HTMLElement | null;
        }
      }
    }
  });

  it('labels every example poster as sample data', () => {
    for (const p of content) {
      for (const img of p.root.querySelectorAll('img[src^="/samples/"]')) {
        expect(img.getAttribute('alt'), p.path).toMatch(/Sample data\.$/);
      }
    }
    const home = byPath.get('/')!;
    expect(home.root.querySelectorAll('img[src^="/samples/"]').length).toBeGreaterThanOrEqual(4);
    expect(text(home.root.querySelector('body'))).toContain('Sample data');
  });
});

describe('guides', () => {
  const guidePages = indexable.filter((p) => /^\/guides\/[^/]+\/$/.test(p.path));
  const index = byPath.get('/guides/')!;

  it('are shelved once each on the guides page, under three headings', () => {
    const shelves = index.root.querySelectorAll('section.shelf');
    expect(shelves.map((shelf) => text(shelf.querySelector('h2')))).toEqual([
      'The world, and how to count it',
      'Canada, province by province',
      'Making your map and printing it',
    ]);
    const listed = shelves.flatMap((shelf) => shelf.querySelectorAll('.guide h3 a').map((a) => a.getAttribute('href')!));
    expect([...listed].sort()).toEqual(guidePages.map((p) => p.path).sort());
    for (const shelf of shelves) expect(shelf.querySelectorAll('.guide').length).toBeGreaterThanOrEqual(2);
    // Each listing shows the guide's own headline.
    for (const a of index.root.querySelectorAll('.guide h3 a')) expect(text(a)).toBe(text(byPath.get(a.getAttribute('href')!)!.root.querySelector('h1')));
  });

  it('show six on the home page, two from each shelf, and a way to the rest', () => {
    const home = byPath.get('/')!;
    const shown = home.root.querySelectorAll('.inspiration__list a').map((a) => a.getAttribute('href')!);
    expect(shown).toHaveLength(6);
    expect(new Set(shown).size).toBe(6);
    const more = home.root.querySelector('.inspiration__more a')!;
    expect(more.getAttribute('href')).toBe('/guides/');
    expect(text(more)).toBe(`See all ${guidePages.length} guides`);
  });

  it('are listed on the map each one was written for', () => {
    const listed = (path: string) => byPath.get(path)!.root.querySelectorAll('.map-guides__list a').map((a) => a.getAttribute('href')!);
    expect(listed('/maps/world/').length).toBeGreaterThanOrEqual(6);
    expect(listed('/maps/canada/')).toEqual(expect.arrayContaining(['/guides/canada-national-parks-checklist/', '/guides/unesco-world-heritage-sites-in-canada/', '/guides/canada-provinces-and-territories/']));
    expect(listed('/maps/canada-cities/')).toEqual(['/guides/largest-cities-in-canada/']);
    const all = ['/maps/world/', '/maps/canada/', '/maps/canada-cities/'].flatMap(listed);
    expect([...all].sort()).toEqual(guidePages.map((p) => p.path).sort());
  });

  it('link to every other guide from the foot of the page, the same shelf first', () => {
    for (const p of guidePages) {
      const more = p.root.querySelectorAll('.article__more a').map((a) => a.getAttribute('href')!);
      expect([...more].sort(), p.path).toEqual(guidePages.map((g) => g.path).filter((path) => path !== p.path).sort());
    }
  });

  it('put every table in a wrapper that scrolls on its own and can be reached by keyboard', () => {
    let tables = 0;
    for (const p of guidePages) {
      for (const table of p.root.querySelectorAll('.prose table')) {
        tables++;
        const wrapper = table.parentNode as HTMLElement;
        expect(wrapper.getAttribute('class'), p.path).toBe('table-scroll');
        expect(wrapper.getAttribute('role'), p.path).toBe('region');
        expect(wrapper.getAttribute('tabindex'), p.path).toBe('0');
        expect((wrapper.getAttribute('aria-label') ?? '').length, p.path).toBeGreaterThan(10);
        expect(table.querySelectorAll('thead th').length, p.path).toBeGreaterThanOrEqual(2);
      }
    }
    expect(tables).toBeGreaterThanOrEqual(12);
  });

  it('print the checklists as real lists: 195 countries, 42 territories, 48 parks and one urban park', () => {
    const boxes = (path: string) => byPath.get(path)!.root.querySelectorAll('.prose .checklist li');
    expect(boxes('/guides/countries-visited-checklist/')).toHaveLength(195 + 42);
    expect(boxes('/guides/canada-national-parks-checklist/')).toHaveLength(49);
    const countries = byPath.get('/guides/countries-visited-checklist/')!;
    expect(countries.root.querySelectorAll('.prose h3').map((h) => text(h))).toEqual(['Africa (54)', 'Asia (48)', 'Europe (44)', 'North America (23)', 'South America (12)', 'Oceania (14)']);
  });

  it('offer each printable checklist as two PDFs that exist, with their size and a picture of the sheet', () => {
    const withFiles = guidePages.filter((p) => p.root.querySelector('.downloads'));
    expect(withFiles.map((p) => p.path).sort()).toEqual(['/guides/canada-national-parks-checklist/', '/guides/countries-visited-checklist/']);
    for (const p of withFiles) {
      const box = p.root.querySelector('.downloads')!;
      const links = box.querySelectorAll('a[href]');
      expect(links.map((a) => a.getAttribute('href')!.replace(/^.*-(letter|a4)\.pdf$/, '$1'))).toEqual(['letter', 'a4']);
      for (const a of links) {
        const href = a.getAttribute('href')!;
        expect(a.getAttribute('type')).toBe('application/pdf');
        const file = readFileSync(join(dist, href));
        expect(file.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
        expect(file.length, href).toBeLessThan(150_000);
        // The size on the page is the size of the file.
        const stated = /(\d+) KB/.exec(text(a.parentNode as HTMLElement))!;
        expect(Number(stated[1]), href).toBe(Math.max(1, Math.round(file.length / 1024)));
      }
      const picture = box.querySelector('img')!;
      expect(picture.getAttribute('src')).toMatch(/^\/downloads\/[a-z-]+-240\.webp$/);
      expect(picture.getAttribute('alt')!.length).toBeGreaterThan(60);
      // The box comes before the article's own first heading, so the files are found at once.
      expect(p.html.indexOf('class="downloads"')).toBeLessThan(p.html.indexOf('class="prose"'));
    }
  });

  it('carry the data markers only as comments, never as visible text', () => {
    for (const p of guidePages) expect(text(p.root.querySelector('.prose')), p.path).not.toMatch(/data:[a-z-]+/);
  });
});

describe('sitemap and robots', () => {
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('lists exactly the indexable pages, by their canonical addresses', () => {
    expect([...locs].sort()).toEqual(indexable.map((p) => ORIGIN + p.path).sort());
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('gives each entry a real date', () => {
    const dates = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(dates).toHaveLength(locs.length);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(d)).toBeLessThanOrEqual(Date.now() + 86_400_000);
    }
  });

  it('is valid XML in the sitemap namespace', () => {
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect((sitemap.match(/<url>/g) ?? []).length).toBe((sitemap.match(/<\/url>/g) ?? []).length);
  });

  it('lets crawlers in and points them at the sitemap', () => {
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
  });

  it('ships no llms.txt, which the site does not need', () => {
    expect(existsSync(join(dist, 'llms.txt'))).toBe(false);
  });
});

describe('host configuration', () => {
  it('ships redirect and header rules for Netlify and Cloudflare Pages', () => {
    const redirects = readFileSync(join(dist, '_redirects'), 'utf8');
    for (const from of ['/canada', '/world', '/poster']) expect(redirects).toMatch(new RegExp(`^${from}\\s+/\\S+/\\s+301$`, 'm'));
    const headers = readFileSync(join(dist, '_headers'), 'utf8');
    for (const header of ['X-Content-Type-Options: nosniff', 'Referrer-Policy:', 'X-Frame-Options: SAMEORIGIN', 'Permissions-Policy:']) expect(headers).toContain(header);
    expect(headers).toMatch(/\/_astro\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  });

  it('has a web app manifest whose icons exist', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'site.webmanifest'), 'utf8')) as { name: string; icons: { src: string; sizes: string }[] };
    expect(manifest.name).toBe('WorldTripMap');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) expect(served(icon.src), icon.src).toBe(true);
  });

  it('has social images at exactly 1,200 by 630 pixels', () => {
    for (const file of readdirSync(join(dist, 'og'))) {
      const png = readFileSync(join(dist, 'og', file));
      expect(png.readUInt32BE(16), `${file} width`).toBe(1200);
      expect(png.readUInt32BE(20), `${file} height`).toBe(630);
      expect(png.length, `${file} size`).toBeLessThan(400_000);
    }
  });
});

describe('weight', () => {
  const gz = (file: string) => gzipSync(readFileSync(file)).length;

  /** The files a built script imports as soon as it runs. Imports it only makes later, on demand, are left out. */
  function importsOf(url: string): string[] {
    const code = readFileSync(join(dist, url), 'utf8');
    const found = code.matchAll(/(?:import|export)\s*(?:[^"'`()]*?from\s*)?["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g);
    return [...found].map((m) => posix.join(posix.dirname(url), m[1]));
  }

  /** Every script a page runs before anyone interacts with it: what the HTML asks for, and all that those files import. */
  function initialScripts(page: Page): string[] {
    const seen = new Set<string>();
    const queue = [
      ...page.root.querySelectorAll('script[src]').map((s) => s.getAttribute('src')!),
      ...page.root.querySelectorAll('link[rel="modulepreload"]').map((l) => l.getAttribute('href')!),
      ...page.root.querySelectorAll('astro-island').flatMap((i) => [i.getAttribute('component-url'), i.getAttribute('renderer-url')].filter(Boolean) as string[]),
    ];
    while (queue.length) {
      const url = queue.pop()!;
      if (seen.has(url)) continue;
      seen.add(url);
      queue.push(...importsOf(url));
    }
    return [...seen];
  }

  /** Scripts and styles a page asks for before anyone interacts with it, in bytes as a host would send them. */
  function initial(page: Page): { js: number; css: number; html: number } {
    const styles = page.root.querySelectorAll('link[rel="stylesheet"]').map((l) => l.getAttribute('href')!);
    const sum = (urls: string[]) => [...new Set(urls)].reduce((total, url) => total + gz(join(dist, url)), 0);
    return { js: sum(initialScripts(page)), css: sum(styles), html: gzipSync(Buffer.from(page.html)).length };
  }

  it('keeps reading pages free of JavaScript frameworks', () => {
    for (const path of ['/about/', '/methodology/', '/terms/', '/how-it-works/', '/guides/', '/guides/how-many-countries-are-there/', '/guides/countries-visited-checklist/', '/guides/largest-cities-in-canada/']) {
      const { js } = initial(byPath.get(path)!);
      expect(js, `${path} loads ${js} bytes of script`).toBeLessThan(6_000);
    }
  });

  it('keeps every page light before interaction', () => {
    for (const p of content) {
      const { html, css } = initial(p);
      expect(html, `${p.path} HTML is ${html} bytes gzipped`).toBeLessThan(45_000);
      expect(css, `${p.path} CSS is ${css} bytes gzipped`).toBeLessThan(30_000);
    }
  });

  it('keeps each tool within its script budget', () => {
    // Bytes gzipped, before anyone interacts. Most of it is the map itself: the world's geometry
    // is about 60 KB and Canada's about 27 KB. The poster studio adds its engine on top, then
    // fetches the font library and typefaces once it is open.
    const budgets: Record<string, number> = {
      '/': 12_000,
      '/maps/canada/': 80_000,
      '/maps/canada-cities/': 80_000,
      '/maps/world/': 110_000,
      '/maps/canada/poster/': 95_000,
      '/maps/canada-cities/poster/': 95_000,
      '/maps/world/poster/': 125_000,
    };
    for (const [path, budget] of Object.entries(budgets)) {
      const { js } = initial(byPath.get(path)!);
      expect(js, `${path} loads ${js} bytes of script`).toBeLessThan(budget);
      // A sign the measurement itself still works: every one of these pages runs real code.
      expect(js, `${path} loads ${js} bytes of script`).toBeGreaterThan(5_000);
    }
  });

  it('never makes a map page download the font library, which only posters need', () => {
    // The bundler once tucked a small shared helper into the same file as the font library, and
    // every map page then downloaded 170 KB it never used. The library is found by what is in
    // the file, not by its name.
    const hasFontLibrary = (url: string) => readFileSync(join(dist, url), 'utf8').includes('Unsupported OpenType signature');
    const chunks = files.filter((f) => f.endsWith('.js')).map((f) => `/${relative(dist, f).replace(/\\/g, '/')}`);
    expect(chunks.filter(hasFontLibrary), 'the font library is in exactly one file').toHaveLength(1);
    for (const p of content) {
      const loaded = initialScripts(p).filter(hasFontLibrary);
      expect(loaded, `${p.path} loads the font library up front`).toEqual([]);
    }
  });

  it('never ships the print-resolution map data in a page: it is fetched only for a large export', () => {
    const print = files.filter((f) => /\.print\.[\w-]+\.js$/.test(f) || /print\.[A-Za-z0-9_-]+\.js$/.test(f));
    expect(print.length, 'print geometry chunks').toBeGreaterThanOrEqual(2);
    for (const p of content) for (const chunk of print) expect(p.html.includes(relative(dist, chunk)), `${p.path} references ${chunk}`).toBe(false);
  });
});
