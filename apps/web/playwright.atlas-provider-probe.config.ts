import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'atlas-voice-provider-probe.spec.ts', workers: 1, retries: 0,
  timeout: 115000, expect: { timeout: 10000 },
  use: { baseURL: 'http://127.0.0.1:54397', browserName: 'chromium', headless: true, viewport: { width: 412, height: 915 }, screenshot: 'only-on-failure' },
  outputDir: '../../.superpowers/provider-probe-native-results',
  webServer: { command: 'node e2e/atlas-voice-pilot-server.mjs', url: 'http://127.0.0.1:54397', reuseExistingServer: false, timeout: 60000 },
})
