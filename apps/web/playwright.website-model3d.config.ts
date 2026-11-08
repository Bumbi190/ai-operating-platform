import {defineConfig} from '@playwright/test'
export default defineConfig({
 testDir:'./e2e/website-model3d',testMatch:'model3d.spec.ts',
 workers:1,retries:0,timeout:45000,expect:{timeout:12000},
 use:{baseURL:'http://127.0.0.1:19989',browserName:'chromium',screenshot:'only-on-failure',
  launchOptions:{args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']}},
 outputDir:'../../.superpowers/sdd/2026-11-01-web-studio-model3d-browser',
 webServer:{command:'node ../../node_modules/tsx/dist/cli.mjs e2e/website-model3d/server.ts',
  url:'http://127.0.0.1:19989/',reuseExistingServer:false,timeout:60000}
})
