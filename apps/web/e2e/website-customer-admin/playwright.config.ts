import {defineConfig} from '@playwright/test'
import path from 'node:path'

const baseURL=process.env.DEALER_PILOT_URL
if(!baseURL||!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL))throw Error('Start the owned Kundadmin test fixture')
export default defineConfig({
  testDir:__dirname,testMatch:'pilot.spec.ts',workers:1,retries:0,timeout:120000,
  expect:{timeout:9000},use:{baseURL,viewport:{width:1366,height:900},browserName:'chromium'},
  outputDir:path.resolve(__dirname,'../../../../.superpowers/premium-showroom/customer-admin-browser'),
})
