import {defineConfig} from '@playwright/test'
const port=Number(process.env.SOCIAL_CONTENT_TEST_PORT??54403)
export default defineConfig({testDir:'./e2e',testMatch:'social-content.spec.ts',workers:1,retries:0,timeout:20000,use:{baseURL:'http://127.0.0.1:'+port,browserName:'chromium',screenshot:'only-on-failure'},outputDir:'../../.superpowers/sdd/2026-10-16-atlas-social-content/browser',webServer:{command:'node e2e/social-content-server.mjs',url:'http://127.0.0.1:'+port+'/content',reuseExistingServer:false,timeout:30000}})
