import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

// E2E target — injected via env, never hard-coded to a specific host.
//   CI:    the Jenkinsfile sets E2E_BASE_URL to the freshly-deployed *inactive*
//          blue/green env, so tests run before traffic is switched.
//   Local: export E2E_BASE_URL, or put it in a gitignored .env file, e.g.
//          E2E_BASE_URL=http://3.215.243.214/staging/
// Falls back to the local vite preview server when nothing is set.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173/';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['junit', { outputFile: 'playwright-report/results.xml' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
