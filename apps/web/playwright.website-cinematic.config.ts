import {defineConfig} from '@playwright/test'
export default defineConfig({
 testDir:'./e2e/website-cinematic',testMatch:'cinematic.spec.ts',
 workers:1,retries:0,timeout:45000,expect:{timeout:12000},
 use:{baseURL:'http://127.0.0.1:19993',browserName:'chromium',
  viewport:{width:1440,height:1000},screenshot:'only-on-failure',
  launchOptions:{args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']}},
 outputDir:'../../.superpowers/cinematic-pilot/browser-results',
 webServer:{command:'node ../../node_modules/tsx/dist/cli.mjs --tsconfig e2e/website-cinematic/tsconfig.json e2e/website-cinematic/server.ts',
  url:'http://127.0.0.1:19993/',reuseExistingServer:false,timeout:60000}
})
