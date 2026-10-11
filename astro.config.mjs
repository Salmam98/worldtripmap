// @ts-check
import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';

// The canonical origin. Change SITE_URL at build time if you launch on another domain.
const site = process.env.SITE_URL ?? 'https://worldtripmap.com';

// PREVIEW_RELATIVE=1 builds a copy whose assets load from relative paths, for hosting the site
// inside a sub-folder or a sandboxed preview. Production builds never set it. The copy keeps its
// scripts and styles in "assets" because some file hosts reserve names that start with "_".
const relative = process.env.PREVIEW_RELATIVE === '1';

export default defineConfig({
  site,
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto', assets: relative ? 'assets' : '_astro' },
  integrations: [preact()],
  redirects: {
    '/canada': '/maps/canada/',
    '/world': '/maps/world/',
    '/poster': '/travel-map-poster/',
  },
  vite: {
    build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
    experimental: relative
      ? {
          renderBuiltUrl(_filename, { hostType }) {
            return hostType === 'html' ? undefined : { relative: true };
          },
        }
      : undefined,
  },
});
