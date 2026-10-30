import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./e2e/reference-picker',testMatch:'picker.spec.ts',workers:1,retries:0,timeout:30000,expect:{timeout:5000},
 use:{baseURL:'http://127.0.0.1:54406',browserName:'chromium',screenshot:'only-on-failure'},
 outputDir:'../../.superpowers/reference-picker-20261030',
 webServer:{command:'node e2e/reference-picker/server.mjs',url:'http://127.0.0.1:54406/picker',reuseExistingServer:false,timeout:30000}})
