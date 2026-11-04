import {defineConfig} from '@playwright/test'
const origin='http://127.0.0.1:'+(process.env.CINEMATIC_TEST_PORT??19993)
export default defineConfig({
 testDir:'./e2e/website-cinematic',testMatch:'*.spec.ts',
 workers:1,retries:0,timeout:45000,expect:{timeout:12000},
 use:{baseURL:origin,browserName:'chromium',
  viewport:{width:1440,height:1000},screenshot:'only-on-failure',
  launchOptions:{args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']}},
 outputDir:'../../.superpowers/cinematic-pilot/browser-results',
 webServer:{command:'node ../../node_modules/tsx/dist/cli.mjs --tsconfig e2e/website-cinematic/tsconfig.json e2e/website-cinematic/server.ts',
  url:origin+'/',reuseExistingServer:false,timeout:60000}
})
