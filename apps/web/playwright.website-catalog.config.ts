import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./e2e/website-catalog',testMatch:'catalog.spec.ts',workers:1,retries:0,timeout:30000,expect:{timeout:5000},
 use:{baseURL:'http://127.0.0.1:54427',browserName:'chromium',screenshot:'only-on-failure'},
 outputDir:'../../.superpowers/sdd/2026-10-31-web-studio-catalog-preview/browser',
 webServer:{command:'node ../../node_modules/tsx/dist/cli.mjs e2e/website-catalog/server.ts',url:'http://127.0.0.1:54427/',reuseExistingServer:false,timeout:30000}})
