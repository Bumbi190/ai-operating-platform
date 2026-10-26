import {defineConfig} from '@playwright/test';
const port=Number(process.env.CALENDAR_TEST_PORT||54433);
export default defineConfig({testDir:'./e2e',testMatch:'calendar-media-queue.spec.ts',workers:1,retries:0,timeout:25000,use:{baseURL:'http://127.0.0.1:'+port,browserName:'chromium',screenshot:'only-on-failure'},outputDir:'../../.superpowers/sdd/2026-10-26-the-prompt-calendar-visibility/browser',webServer:{command:'node e2e/calendar-server.mjs',env:{CALENDAR_TEST_PORT:String(port)},url:'http://127.0.0.1:'+port+'/calendar',reuseExistingServer:false,timeout:30000}});
