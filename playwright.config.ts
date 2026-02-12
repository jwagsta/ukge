import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './tests/visual/test-results',
  snapshotDir: './tests/visual/snapshots',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    // Desktop - wide layout (>= 1000px)
    {
      name: 'desktop-wide',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    // Tablet - narrow layout (640-999px)
    {
      name: 'tablet-narrow',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    // Mobile portrait (< 640px) - Map tab
    {
      name: 'mobile-portrait',
      use: {
        ...devices['iPhone 13'],
      },
    },
    // Mobile landscape
    {
      name: 'mobile-landscape',
      use: {
        ...devices['iPhone 13 landscape'],
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
