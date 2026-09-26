import { defineConfig, devices } from '@playwright/test';

// The Windows launcher (or equivalent local processes) must finish bootstrapping first.
export default defineConfig({
  fullyParallel: false,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: 'line',
  retries: 0,
  testDir: './tests/local-demo',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:3020', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  workers: 1,
});
