import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'reconciliation.spec.ts',workers:1,retries:0,use:{baseURL:'http://127.0.0.1:54429',browserName:'chromium'},webServer:{command:'node e2e/reconciliation-server.mjs',url:'http://127.0.0.1:54429/reconciliation',reuseExistingServer:false,timeout:30000}});
