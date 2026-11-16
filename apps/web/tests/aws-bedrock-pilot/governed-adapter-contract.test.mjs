import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const adapter = readFileSync(resolve(app,'lib/ai/bedrock-pilot/governed-client.ts'),'utf8')
const pkg = JSON.parse(readFileSync(resolve(app,'package.json'),'utf8'))
const route = resolve(app,'app/api/bedrock-pilot-converse/route.ts')

test('Bedrock dispatcher remains dormant: no route or scheduler imports it',()=>{
  assert.equal(existsSync(route),false)
  assert.match(adapter,/BEDROCK_GOVERNED_PILOT_ENABLED === 'true'/)
  assert.match(adapter,/process.env.VERCEL_ENV|environment: process.env.VERCEL_ENV/)
  assert.equal(adapter.includes('media/pipeline'),false)
})
test('every billable attempt uses canonical withGovernedSpend, fixed model and hard ceiling',()=>{
  assert.match(adapter,/return withGovernedSpend\(/)
  assert.match(adapter,/tokenWindowCeiling\(MODEL_ID, prepared.maxOutputTokens, rates\)/)
  assert.match(adapter,/provider: 'aws-bedrock'/)
  assert.match(adapter,/ceilingBasis: 'token_window'/)
  assert.match(adapter,/hardSpendGate: isSpendGateEnforced\(\)/)
  assert.match(adapter,/maxAttempts: 1/)
  assert.equal(adapter.includes('Promise.all([client.send'),false)
})
test('physical STOP watching, abort composition, and no hidden retries',()=>{
  const iBudget=adapter.indexOf('return withGovernedSpend(')
  const iAdmit=adapter.indexOf('await admitPhysicalRequest(')
  const iWatch=adapter.indexOf('watchExecutionAuthority(')
  const iSend=adapter.indexOf('await client.send(')
  const iMeter=adapter.indexOf('await logLlmCost(')
  assert.ok(iBudget>=0 && iBudget<iAdmit && iAdmit<iWatch && iWatch<iSend && iSend<iMeter)
  assert.match(adapter,/composeAbortSignals\(\[watch.signal, AbortSignal.timeout\(7000\)\]\)/)
  assert.match(adapter,/GovernanceDispatchUnknownError/)
  assert.match(adapter,/client.destroy\(\)/)
})
test('shared metering inside spend callback, no raw ungoverned fallback or static AWS keys',()=>{
  assert.match(adapter,/await logLlmCost\(MODEL_ID/)
  assert.match(adapter,/credentials: shortLivedCredentials/)
  assert.match(adapter,/obtainPreviewCredentials\(/)
  assert.equal(adapter.includes('AWS_ACCESS_KEY_ID'),false)
  assert.equal(adapter.includes('AWS_SECRET_ACCESS_KEY'),false)
  assert.equal(adapter.includes('defaultProvider'),false)
  assert.equal(adapter.includes('retry('),false)
  assert.equal(adapter.includes('await getAnthropic'),false)
  assert.equal(adapter.includes('openAIChatCompletion'),false)
})
test('the exact pinned Bedrock SDK is declared only as dependency in the isolated branch',()=>{
  assert.equal(pkg.dependencies['@aws-sdk/client-bedrock-runtime'],'3.986.0')
})
