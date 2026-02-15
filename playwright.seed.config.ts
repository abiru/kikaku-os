import { defineConfig } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:4321';
const apiBaseUrl = process.env.E2E_API_BASE ?? 'http://localhost:8787';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['github']]
    : [['list'], ['html', { open: 'never', outputFolder: 'codex-runs/playwright-report' }]],
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1365, height: 900 },
  },
  webServer: [
    {
      command: 'PORT=8787 pnpm -C apps/api dev',
      url: `${apiBaseUrl}/dev/ping`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm -C apps/storefront dev -- --host localhost --port 4321 --strictPort',
      url: baseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        PUBLIC_API_BASE: apiBaseUrl,
      },
    },
  ],
});
