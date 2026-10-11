/** Site-wide settings. Values come from environment variables at build time; see .env.example. */

const env = import.meta.env ?? ({} as Record<string, string | undefined>);

export const SITE = {
  name: 'WorldTripMap',
  domain: 'worldtripmap.com',
  tagline: 'Your travels, on a map you made',
  description:
    'Mark the countries, provinces and cities you have explored, see your progress, and turn your travels into a poster you can print or share. Free, with no account.',
  contactEmail: (env.PUBLIC_CONTACT_EMAIL as string | undefined) || 'hello@worldtripmap.com',
  contactEndpoint: (env.PUBLIC_CONTACT_ENDPOINT as string | undefined) || '',
  analytics: ((env.PUBLIC_ANALYTICS as string | undefined) || 'none') as 'none' | 'plausible' | 'ga4',
  plausibleDomain: (env.PUBLIC_PLAUSIBLE_DOMAIN as string | undefined) || '',
  plausibleSrc: (env.PUBLIC_PLAUSIBLE_SRC as string | undefined) || 'https://plausible.io/js/script.js',
  ga4Id: (env.PUBLIC_GA4_ID as string | undefined) || '',
  gscVerification: (env.PUBLIC_GSC_VERIFICATION as string | undefined) || '',
  /** Set PUBLIC_CSP=off to leave out the Content Security Policy, e.g. to run an ad network. */
  csp: (env.PUBLIC_CSP as string | undefined) !== 'off',
  /** Date the legal pages were last revised. */
  legalUpdated: '2026-10-10',
} as const;

/**
 * Turns a root-relative path ("/maps/canada/") into a link that works wherever the site is
 * mounted. In production this returns the path unchanged.
 *
 * A relative preview copy (see scripts/preview/build-preview.mjs) is served as plain files from a
 * folder of unknown depth, so it sets two globals: __WTM_ROOT__, the path back to the site root,
 * and __WTM_INDEX__, the file name a folder address has to spell out there ("index.html").
 */
export function href(path: string): string {
  if (typeof window === 'undefined') return path;
  const preview = window as unknown as { __WTM_ROOT__?: string; __WTM_INDEX__?: string };
  if (!preview.__WTM_ROOT__ || !path.startsWith('/')) return path;
  return preview.__WTM_ROOT__ + path.slice(1) + (path.endsWith('/') ? (preview.__WTM_INDEX__ ?? '') : '');
}
