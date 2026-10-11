import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_UPDATED, STATIC_ROUTES } from '../lib/routes';
import { absoluteUrl } from '../lib/seo';

/** Lists canonical, indexable URLs only: no redirects, no 404 page, nothing with a "#" state. */
export const GET: APIRoute = async ({ site }) => {
  const guides = await getCollection('guides');
  const entries = [
    ...STATIC_ROUTES.map((path) => ({ path, lastmod: SITE_UPDATED })),
    ...guides.map((guide) => ({ path: `/guides/${guide.id}/`, lastmod: guide.data.updated.toISOString().slice(0, 10) })),
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((e) => `  <url><loc>${absoluteUrl(e.path, site)}</loc><lastmod>${e.lastmod}</lastmod></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
