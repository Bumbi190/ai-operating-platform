import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'atlas-overview-messenger.spec.ts',
    'atlas-overview-dashboard.spec.ts',
    'overview-growth.spec.ts'
  ],
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: 'http://127.0.0.1:59137',
    browserName: 'chromium',
    screenshot: 'only-on-failure'
  },
  outputDir:
    '../../.superpowers/sdd/2026-10-15-atlas-overview-messenger-plan/browser-results',
  webServer: {
    command: 'node e2e/atlas-overview-messenger-server.mjs',
    url: 'http://127.0.0.1:59137',
    reuseExistingServer: false,
    timeout: 60000
  }
})
