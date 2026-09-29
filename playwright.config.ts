import { defineConfig } from '@playwright/test';

/**
 * Screenshot tests for the examples. Baselines are Linux-only: run them through the Playwright
 * Docker image (`pnpm test:e2e`) so local runs match CI pixel for pixel.
 */
export default defineConfig({
  testDir: 'e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: {
    // Tiles come live from OpenFreeMap, whose data updates weekly: allow small drift.
    toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://localhost:4310',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:4310/waterford/',
    reuseExistingServer: !process.env.CI,
  },
});
