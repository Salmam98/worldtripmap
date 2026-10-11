import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests. They run against the built site, exactly as a host would serve it:
 *
 *   npm run build && npm run test:e2e
 *
 * First time on a new machine: npx playwright install chromium
 * Set CHROMIUM_PATH to use a browser that is already installed instead.
 */
const executablePath = process.env.CHROMIUM_PATH || undefined;
const port = Number(process.env.PORT ?? 4321);

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  webServer: {
    // --ignore-lock keeps the server attached to this run. Without it, Astro moves the preview
    // server to the background when it is started by a coding agent, and the tests see it "exit".
    command: `npm run preview -- --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
