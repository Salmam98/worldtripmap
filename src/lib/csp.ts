/**
 * The Content Security Policy every page carries (as a <meta> tag, so it works on any static host).
 *
 * Its job is to back up the site's privacy promise in the browser itself: pages may only load
 * scripts, styles, fonts and images from this site, and may only send data to this site. The only
 * exceptions are the analytics provider and contact-form service chosen in the build settings.
 *
 * Inline scripts and styles are allowed because the page framework relies on them; nothing a
 * visitor types is ever inserted into the page as markup.
 */
export interface CspSettings {
  analytics: 'none' | 'plausible' | 'ga4';
  /** Address of the Plausible script, when Plausible is the provider. */
  plausibleSrc?: string;
  /** Where the contact form posts to, if a form service is configured. */
  contactEndpoint?: string;
}

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(settings: CspSettings): string {
  const script = ["'self'", "'unsafe-inline'"];
  const connect = ["'self'"];
  const img = ["'self'", 'data:', 'blob:'];
  const form = ["'self'"];

  if (settings.analytics === 'plausible') {
    const plausible = origin(settings.plausibleSrc) ?? 'https://plausible.io';
    script.push(plausible);
    connect.push(plausible);
  }
  if (settings.analytics === 'ga4') {
    script.push('https://www.googletagmanager.com');
    connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com');
    img.push('https://*.google-analytics.com', 'https://*.googletagmanager.com');
  }
  const contact = origin(settings.contactEndpoint);
  if (contact) {
    connect.push(contact);
    form.push(contact);
  }

  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${form.join(' ')}`,
  ].join('; ');
}
