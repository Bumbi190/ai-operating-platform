import {defineConfig} from 'vitest/config'
import {fileURLToPath} from 'node:url'
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url)),'server-only':fileURLToPath(new URL('./lib/qa/__stubs__/server-only.ts',import.meta.url))}},
 css:{postcss:{}},
 test:{environment:'node',include:['lib/qa/website-reference-auth.integration.test.ts'],maxWorkers:1,minWorkers:1,testTimeout:15000,hookTimeout:120000},
})
