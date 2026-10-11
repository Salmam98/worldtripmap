#!/usr/bin/env node
/**
 * Builds dist-preview/: a copy of the site that runs as plain files from any folder.
 *
 *   npm run preview:build
 *
 * It is for showing the site somewhere other than its own domain, such as a file host or a
 * sandboxed viewer. It is NOT the production build; deploy `npm run build` (dist/).
 *
 * How the copy differs from production:
 *   - every link, script and image address is relative, and a link to a folder names index.html;
 *   - the web fonts are embedded in the stylesheets;
 *   - the Content Security Policy tag, analytics, search-engine tags, redirects, sitemap,
 *     robots.txt, icons and social images are left out, and pages are marked noindex;
 *   - a slim bar on every page says it is a preview;
 *   - inside a frame that blocks downloads, a finished poster or a printable checklist is handed
 *     to the host's own "save file" dialog when it has one (window.claude), and shown on screen
 *     otherwise.
 *
 * It also writes dist-preview/files.json, which maps every file except the home page to its
 * address, for hosts that take a page plus a list of supporting files.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'dist-preview');
const INDEX = 'index.html';

rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['astro', 'build', '--outDir', out], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PREVIEW_RELATIVE: '1', PUBLIC_CSP: 'off', PUBLIC_ANALYTICS: 'none', ASTRO_TELEMETRY_DISABLED: '1' },
});

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const rel = (file) => relative(out, file).split('\\').join('/');

// ---------------------------------------------------------------------------------------------
// 1. Leave out what only matters on the real domain.
// ---------------------------------------------------------------------------------------------

for (const name of ['_headers', '_redirects', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'favicon.svg', '404.html', 'icons', 'og']) {
  rmSync(join(out, name), { recursive: true, force: true });
}
// Short addresses that only redirect (/canada, /world, /poster).
for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
  if (/<meta http-equiv="refresh"/i.test(readFileSync(file, 'utf8'))) rmSync(dirname(file), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// 2. Embed the web fonts, so the copy does not depend on the host serving font files.
// ---------------------------------------------------------------------------------------------

const embedded = new Set();
for (const file of walk(out).filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(file, 'utf8');
  const next = css.replace(/url\((["']?)([^"')]+\.woff2)\1\)/g, (match, _quote, address) => {
    const font = address.startsWith('/') ? join(out, address) : join(dirname(file), address);
    if (!existsSync(font)) return match;
    embedded.add(font);
    return `url(data:font/woff2;base64,${readFileSync(font).toString('base64')})`;
  });
  if (next !== css) writeFileSync(file, next);
}
for (const font of embedded) rmSync(font);

// ---------------------------------------------------------------------------------------------
// 3. Make every page relative.
// ---------------------------------------------------------------------------------------------

/** "/maps/canada/#x" seen from a page two folders deep becomes "../../maps/canada/index.html#x". */
function relativise(address, back) {
  if (!address.startsWith('/') || address.startsWith('//')) return address;
  const cut = address.search(/[?#]/);
  const path = cut < 0 ? address : address.slice(0, cut);
  const rest = cut < 0 ? '' : address.slice(cut);
  return back + path.slice(1) + (path.endsWith('/') ? INDEX : '') + rest;
}

const BAR = `<div class="wtm-preview-bar" role="note">Preview copy of WorldTripMap. Share links only work on the deployed site.</div>
<style>.wtm-preview-bar{padding:.4rem 1rem;background:#101B2D;color:#F8F6F0;font:500 .78rem/1.4 Manrope,system-ui,sans-serif;text-align:center}</style>`;

/**
 * Inside a frame that blocks downloads, the site's "click a hidden link" way of saving a file does
 * nothing. This offers the file through the host's own save dialog when there is one, and
 * otherwise shows it. Outside a frame the site saves files the normal way and none of this runs.
 */
const SAVE_SHIM = `(function () {
  var framed = false;
  try { framed = window.top !== window.self; } catch (error) { framed = true; }
  var host = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
  if (!framed && !host) return;

  var blobs = new Map();
  var make = URL.createObjectURL.bind(URL);
  var drop = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (object) {
    var url = make(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    blobs.delete(url);
    drop(url);
  };

  function show(blob, filename) {
    var old = document.getElementById('wtm-preview-file');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'wtm-preview-file';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Your file');
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:1rem;background:rgb(16 27 45 / .82)';
    var card = document.createElement('div');
    card.style.cssText = 'display:grid;gap:.75rem;max-width:min(34rem,100%);max-height:100%;overflow:auto;padding:1rem;border-radius:8px;background:#F8F6F0;color:#101B2D;font:500 .9rem/1.5 Manrope,system-ui,sans-serif';
    var text = document.createElement('p');
    text.style.margin = '0';
    var image = /^image\\//.test(blob.type);
    text.textContent = image
      ? filename + ' is ready. This preview cannot save files for you: press and hold the picture (or right-click it) and choose Save.'
      : filename + (blob.size ? ' is ready (' + Math.max(1, Math.round(blob.size / 1024)).toLocaleString() + ' KB), but this' : ': this') + ' preview cannot hand files to your device. On the deployed site it downloads or opens as usual.';
    card.appendChild(text);
    if (image) {
      var picture = document.createElement('img');
      picture.src = make(blob);
      picture.alt = filename;
      picture.style.cssText = 'max-width:100%;height:auto;justify-self:center;box-shadow:0 2px 12px rgb(16 27 45 / .25)';
      card.appendChild(picture);
    }
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'justify-self:end;padding:.5rem 1rem;border:0;border-radius:6px;background:#101B2D;color:#F8F6F0;font:inherit;cursor:pointer';
    close.addEventListener('click', function () { box.remove(); });
    card.appendChild(close);
    box.appendChild(card);
    document.body.appendChild(box);
    close.focus();
  }

  function hand(blob, filename) {
    var asked = host ? host.use('downloads') : Promise.resolve(null);
    asked.then(function (downloads) {
      if (!downloads) return show(blob, filename);
      return downloads.save({ filename: filename, data: blob }).catch(function (error) {
        if (!error || error.code !== 'declined') show(blob, filename);
      });
    }, function () { show(blob, filename); });
  }

  function offer(anchor) {
    var blob = blobs.get(anchor.href);
    if (!blob) return false;
    hand(blob, anchor.getAttribute('download') || 'worldtripmap');
    return true;
  }

  // A link to a PDF that is part of the copy (the printable checklists). A frame cannot open one,
  // so the file is fetched and handed over the same way as a poster.
  function offerFile(anchor) {
    var filename = (anchor.getAttribute('href') || '').split('/').pop() || 'worldtripmap.pdf';
    fetch(anchor.href).then(function (response) {
      if (!response.ok) throw new Error('missing');
      return response.blob();
    }).then(function (blob) {
      hand(new Blob([blob], { type: 'application/pdf' }), filename);
    }, function () {
      show(new Blob([], { type: 'application/pdf' }), filename);
    });
  }

  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && offer(this)) return;
    return click.call(this);
  };
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;
    if (anchor && offer(anchor)) return event.preventDefault();
    var file = event.target && event.target.closest ? event.target.closest('a[href$=".pdf"]') : null;
    if (file && !file.hasAttribute('download')) {
      event.preventDefault();
      offerFile(file);
    }
  }, true);
})();`;

const pages = walk(out).filter((f) => f.endsWith('.html'));
for (const file of pages) {
  const depth = rel(file).split('/').length - 1;
  const back = depth === 0 ? './' : '../'.repeat(depth);
  let html = readFileSync(file, 'utf8');

  // Tags that describe the page to search engines and apps on the real domain.
  html = html
    .replace(/<link rel="(?:canonical|icon|apple-touch-icon|manifest|preload)"[^>]*>/g, '')
    .replace(/<meta (?:property="og:[^"]*"|name="twitter:[^"]*"|name="theme-color"|name="google-site-verification"|name="robots")[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

  html = html
    .replace(/(\s(?:href|src|component-url|renderer-url|before-hydration-url))="(\/[^"]*)"/g, (_m, name, address) => `${name}="${relativise(address, back)}"`)
    .replace(/(\ssrcset)="([^"]*)"/g, (_m, name, list) => {
      const fixed = list.split(',').map((part) => {
        const [address, ...size] = part.trim().split(/\s+/);
        return [relativise(address, back), ...size].join(' ');
      });
      return `${name}="${fixed.join(', ')}"`;
    });

  const setup = `<meta name="robots" content="noindex"><script>window.__WTM_ROOT__=${JSON.stringify(back)};window.__WTM_INDEX__=${JSON.stringify(INDEX)};</script><script>${SAVE_SHIM}</script>`;
  html = html.replace('<head>', `<head>${setup}`).replace(/<body([^>]*)>/, `<body$1>${BAR}`);

  if (/(?:href|src|component-url|renderer-url)="\/(?!\/)/.test(html)) throw new Error(`${rel(file)} still has an address that starts at the site root.`);
  writeFileSync(file, html);
}

// ---------------------------------------------------------------------------------------------
// 4. The home page, a second time, as a fragment: some hosts wrap the page they are given in
//    their own <html>, <head> and <body>, and want only what goes inside.
// ---------------------------------------------------------------------------------------------

const home = readFileSync(join(out, INDEX), 'utf8');
const head = home.slice(home.indexOf('<head>') + 6, home.indexOf('</head>'));
const body = home.slice(home.indexOf('>', home.indexOf('<body')) + 1, home.lastIndexOf('</body>'));
const lang = /<html[^>]*\slang="([^"]*)"/.exec(home)?.[1] ?? 'en';
const keep = head.match(/<link rel="stylesheet"[^>]*>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g) ?? [];
mkdirSync(join(out, '_host'), { recursive: true });
writeFileSync(
  join(out, '_host', 'home.html'),
  `<title>WorldTripMap Preview</title>\n<script>document.documentElement.lang=${JSON.stringify(lang)};</script>\n${keep.join('\n')}\n${body}\n`,
);

// ---------------------------------------------------------------------------------------------
// 5. A list of every supporting file, and a last check that nothing points outside the copy.
// ---------------------------------------------------------------------------------------------

const files = walk(out)
  .map(rel)
  .filter((path) => path !== INDEX && !path.startsWith('_host/') && path !== 'files.json')
  .sort();
writeFileSync(join(out, 'files.json'), JSON.stringify(Object.fromEntries(files.map((path) => [path, `dist-preview/${path}`])), null, 2));

const missing = [];
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\s(?:href|src|component-url|renderer-url)="([^"#?]+)[^"]*"/g)) {
    const address = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(address)) continue; // another site, mailto:, data:
    const target = posix.normalize(posix.join(posix.dirname(rel(file)), address));
    if (!existsSync(join(out, target)) || statSync(join(out, target)).isDirectory()) missing.push(`${rel(file)} -> ${address}`);
  }
}
if (missing.length) throw new Error(`Links to files that are not in the copy:\n${missing.slice(0, 20).join('\n')}`);

const bytes = files.reduce((total, path) => total + statSync(join(out, path)).size, 0) + statSync(join(out, INDEX)).size;
const kinds = {};
for (const path of [INDEX, ...files]) kinds[extname(path) || '(none)'] = (kinds[extname(path) || '(none)'] ?? 0) + 1;
console.log(`\ndist-preview: ${files.length + 1} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`, kinds);
