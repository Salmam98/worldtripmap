import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/lib/csp';

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))!
    .split(' ')
    .slice(1);

describe('content security policy', () => {
  it('by default lets pages load from, and send data to, this site only', () => {
    const csp = buildCsp({ analytics: 'none' });
    expect(csp).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  it('never allows eval, plain HTTP or a wildcard source', () => {
    for (const analytics of ['none', 'plausible', 'ga4'] as const) {
      const csp = buildCsp({ analytics, plausibleSrc: 'https://plausible.io/js/script.js', contactEndpoint: 'https://formspree.io/f/abc' });
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toMatch(/\shttp:/);
      expect(csp).not.toMatch(/\s\*(\s|;|$)/);
      expect(csp).not.toMatch(/\shttps:(\s|;|$)/);
    }
  });

  it('opens up only the analytics provider that was chosen', () => {
    const plausible = buildCsp({ analytics: 'plausible', plausibleSrc: 'https://stats.example.com/js/script.js' });
    expect(directive(plausible, 'script-src')).toContain('https://stats.example.com');
    expect(directive(plausible, 'connect-src')).toEqual(["'self'", 'https://stats.example.com']);
    expect(plausible).not.toContain('google');

    const ga4 = buildCsp({ analytics: 'ga4' });
    expect(directive(ga4, 'script-src')).toContain('https://www.googletagmanager.com');
    expect(directive(ga4, 'connect-src')).toContain('https://*.google-analytics.com');
    expect(ga4).not.toContain('plausible');
  });

  it('falls back to the standard Plausible address when none is given', () => {
    expect(directive(buildCsp({ analytics: 'plausible' }), 'script-src')).toContain('https://plausible.io');
  });

  it('lets the contact form reach its service, and nothing else', () => {
    const csp = buildCsp({ analytics: 'none', contactEndpoint: 'https://formspree.io/f/abcdwxyz' });
    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'https://formspree.io']);
    expect(directive(csp, 'form-action')).toEqual(["'self'", 'https://formspree.io']);
  });

  it('ignores an endpoint that is not a valid HTTPS address', () => {
    for (const bad of ['http://insecure.example/form', 'javascript:alert(1)', 'not a url', '']) {
      expect(buildCsp({ analytics: 'none', contactEndpoint: bad })).toBe(buildCsp({ analytics: 'none' }));
    }
  });
});
