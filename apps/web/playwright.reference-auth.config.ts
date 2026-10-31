import {defineConfig} from '@playwright/test'
export default defineConfig({
 testDir:'./e2e/reference-auth',testMatch:'browser.spec.ts',workers:1,retries:0,
 timeout:120000,expect:{timeout:15000},
 use:{baseURL:process.env.ATLAS_REFERENCE_BROWSER_URL,browserName:'chromium',actionTimeout:15000,navigationTimeout:30000,trace:'off',screenshot:'off',video:'off'},
 outputDir:'../../.superpowers/reference-auth-browser-results',
 reporter:'list',
})
