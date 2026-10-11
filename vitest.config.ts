import { defineConfig } from 'vitest/config';

/** Unit tests: pure logic and data. They need no build and no browser. Run with `npm test`. */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
