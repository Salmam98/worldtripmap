import { afterEach, describe, expect, it } from 'vitest';
import { href } from '../../src/lib/site';

const globals = globalThis as unknown as { window?: Record<string, unknown> };

describe('links built in the browser', () => {
  afterEach(() => {
    delete globals.window;
  });

  it('are left alone while the site is being built', () => {
    expect(href('/maps/canada/')).toBe('/maps/canada/');
  });

  it('are left alone on the real site', () => {
    globals.window = {};
    expect(href('/maps/canada/')).toBe('/maps/canada/');
    expect(href('/maps/canada/poster/')).toBe('/maps/canada/poster/');
  });

  it('become relative, and name the index file, in a preview copy served from a folder', () => {
    globals.window = { __WTM_ROOT__: '../../', __WTM_INDEX__: 'index.html' };
    expect(href('/maps/canada/')).toBe('../../maps/canada/index.html');
    expect(href('/')).toBe('../../index.html');
    expect(href('/samples/poster.webp')).toBe('../../samples/poster.webp');
  });

  it('never touch an address on another site', () => {
    globals.window = { __WTM_ROOT__: './', __WTM_INDEX__: 'index.html' };
    expect(href('https://example.com/a/')).toBe('https://example.com/a/');
    expect(href('#top')).toBe('#top');
  });
});
