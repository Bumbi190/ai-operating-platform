import { defineConfig,mergeConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import base from './vitest.config'

const config=mergeConfig(base,defineConfig({
 cacheDir:fileURLToPath(new URL('./.temp/vitest-local-text-offline/',import.meta.url)),
 resolve:{alias:{'@omnira/local-text-contract':fileURLToPath(new URL('../../packages/local-text-contract/index.mjs',import.meta.url))}},
 test:{
  setupFiles:[fileURLToPath(new URL('./lib/local-text/__tests__/offline-boundaries.setup.ts',import.meta.url))],
  // SQL/GPU/worker integration is a separately authorized acceptance task.
  env:{LOCAL_TEXT_E2E:'0',LOCAL_TEXT_E2E_REVIEW:'0',LOCAL_TEXT_SQL_E2E:'0'},
 },
}))
// Replace the default discovery list instead of merging in unrelated suites.
export default defineConfig({...config,test:{...config.test,include:['lib/local-text/**/*.test.ts']}})
