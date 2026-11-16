import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const app = resolve(here, '../..')
const root = resolve(app, '../..')

test('paid Nova pilot endpoint is removed after the successful one-shot', () => {
  assert.equal(existsSync(resolve(app, 'app/api/bedrock-pilot-converse/route.ts')), false)
  assert.equal(existsSync(resolve(app, 'app/api/bedrock-pilot-converse/diagnostics.ts')), false)
})

test('SDK is pinned exclusively for dormant governed adapter, not the retired API endpoint', () => {
  const pkg = JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
  assert.equal(pkg.dependencies?.['@aws-sdk/client-bedrock-runtime'], '3.986.0')
  assert.equal(lock.packages?.['apps/web']?.dependencies?.['@aws-sdk/client-bedrock-runtime'], '3.986.0')
  const adapter = readFileSync(resolve(app, 'lib/ai/bedrock-pilot/governed-client.ts'), 'utf8')
  assert.ok(adapter.includes('credentials: shortLivedCredentials'))
  assert.equal(adapter.includes('AWS_SECRET_ACCESS_KEY'), false)
  assert.equal(existsSync(resolve(app, 'app/api/bedrock-pilot-converse/route.ts')), false)
})

test('manual preview page cannot call any billable Bedrock endpoint', () => {
  const s = readFileSync(resolve(app, 'app/bedrock-test/page.tsx'), 'utf8')
  assert.ok(s.includes('/api/bedrock-pilot-check'))
  assert.equal(s.includes('bedrock-pilot-converse'), false)
  assert.equal(s.includes('Kör ett Nova Micro-test'), false)
})
