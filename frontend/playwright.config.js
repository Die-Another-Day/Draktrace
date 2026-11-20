// End-to-end tests: `npm run test:e2e` builds the app, serves it with vite preview and drives it in a real browser.
//   PW_CHROMIUM_PATH=/path/to/chrome   use a specific Chromium (only needed where Playwright's own download is not available)
//   PW_ALL_BROWSERS=1                  also run Firefox and WebKit (first: npx playwright install firefox webkit)
import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const chromium = { launchOptions: { executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--disable-sync'] } };
const all = Boolean(process.env.PW_ALL_BROWSERS);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000, // the effects-heavy UI renders slowly on software-GL / low-end machines; 60 s caused false timeouts
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromium }, testIgnore: /mobile\.spec\.js/ },
    { name: 'mobile-touch', use: { ...devices['Pixel 7'], ...chromium }, testMatch: /mobile\.spec\.js/ },
    ...(all
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, testMatch: /mobile\.spec\.js/ },
        ]
      : []),
  ],
});
