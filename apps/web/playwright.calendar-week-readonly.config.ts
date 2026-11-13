import {defineConfig} from '@playwright/test';
const port=Number(process.env.CALENDAR_WEEK_READONLY_PORT||54427);
export default defineConfig({
 testDir:'./e2e',testMatch:'calendar-week-readonly.spec.ts',workers:1,retries:0,timeout:30000,
 use:{baseURL:'http://127.0.0.1:'+port,browserName:'chromium',screenshot:'only-on-failure'},
 outputDir:'test-results-calendar-week-readonly',
 webServer:{command:'node e2e/calendar-server.mjs',env:{CALENDAR_TEST_PORT:String(port)},url:'http://127.0.0.1:'+port+'/calendar',reuseExistingServer:false,timeout:30000}
});
