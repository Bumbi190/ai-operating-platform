import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const port = Number(process.env.SALES_BROWSER_PORT ?? 54417)
const artifacts = process.env.SALES_BROWSER_ARTIFACT_DIR ?? '../../.superpowers/sdd/2026-10-31-harvey-b2b/browser'
export default defineConfig({
  testDir: './e2e',
  testMatch: ['sales-*.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: resolve(artifacts, 'results'),
  webServer: {
    command: 'node e2e/sales-pilot-server.mjs',
    url: `http://127.0.0.1:${port}/sales`,
    reuseExistingServer: false,
    timeout: 30000,
  },
})
