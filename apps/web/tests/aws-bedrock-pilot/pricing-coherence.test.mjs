import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { MODEL_PRICING, calculateCost } from '../../lib/ai/pricing.ts'
import {
  NOVA_MICRO_INPUT_PER_MILLION_USD,
  NOVA_MICRO_OUTPUT_PER_MILLION_USD,
  quoteNovaMicroGrossUsage,
} from '../../lib/ai/bedrock-pilot/shadow-policy.ts'

test('Nova model pricing is shared by Omnira gross usage calculation', () => {
  const p = MODEL_PRICING['amazon.nova-micro-v1:0']
  assert.ok(p)
  assert.equal(p.provider, 'aws-bedrock')
  assert.equal(p.inputPer1M, NOVA_MICRO_INPUT_PER_MILLION_USD)
  assert.equal(p.outputPer1M, NOVA_MICRO_OUTPUT_PER_MILLION_USD)
  assert.equal(calculateCost('amazon.nova-micro-v1:0', 15, 3),
    quoteNovaMicroGrossUsage(15, 3).grossUsd)
})
test('canonical spend-ceiling registry contains Nova 128K context window', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const text = readFileSync(resolve(here, '../../lib/cost/spend-ceiling.ts'),'utf8')
  assert.match(text, /'amazon\.nova-micro-v1:0'\s*:\s*128_000/)
})
test('other existing model pricing is not altered by Nova registration', () => {
  assert.equal(MODEL_PRICING['gpt-5.4-mini'].provider, 'openai')
  assert.equal(MODEL_PRICING['gpt-5.4-mini'].inputPer1M, 0.75)
  assert.equal(MODEL_PRICING['claude-sonnet-4-6'].provider, 'anthropic')
})
