import { defineConfig } from 'vitest/config';

/** Checks on the built site in dist/. Run `npm run build` first, then `npm run test:site`. */
export default defineConfig({
  test: {
    include: ['tests/site/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
