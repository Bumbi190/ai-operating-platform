import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateBedrockShadowCandidate, quoteNovaMicroGrossUsage,
  boundNovaMicroPilotGrossUsd,
} from '../../lib/ai/bedrock-pilot/shadow-policy.ts'

const base = {
  environment: 'preview',
  gitRef: 'feat/omnira-bedrock-pilot-20261116',
  enabled: true,
  hardSpendGateEnabled: true,
  operation: 'manual_editorial_quality_review',
  projectId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  inputBytes: 1000,
  maxOutputTokens: 64,
}
function refuse(change, reason) {
  const result = evaluateBedrockShadowCandidate({ ...base, ...change })
  assert.deepEqual(result, { status: 'refused', reason, canDispatch: false })
}
test('shadow candidate is explicitly never authorised to dispatch', () => {
  assert.deepEqual(evaluateBedrockShadowCandidate(base), {
    status: 'shadow_review_only',
    reason: 'ready_for_non_dispatching_review',
    canDispatch: false,
  })
})
test('disabled by default or no opt-in', () => refuse({ enabled: false }, 'disabled'))
test('production refused even with explicit enable flag', () => refuse({ environment: 'production' }, 'not_isolated_preview'))
test('other preview branches refused', () => refuse({ gitRef: 'main' }, 'not_isolated_preview'))
test('hard Omnira budget gate required', () => refuse({ hardSpendGateEnabled: false }, 'hard_spend_gate_required'))
test('automatic News Hunter and publishing tasks refused', () => {
  for (const operation of ['Analyze News', 'Generate Script', 'publish', 'Morning Briefing']) {
    refuse({ operation }, 'operation_not_allowlisted')
  }
})
test('unqualified project IDs refused', () => refuse({ projectId: undefined }, 'project_not_qualified'))
test('empty and oversized input refused', () => {
  refuse({ inputBytes: 0 }, 'input_not_bounded')
  refuse({ inputBytes: 8193 }, 'input_not_bounded')
  refuse({ inputBytes: Number.NaN }, 'input_not_bounded')
})
test('invalid or unbounded output refused', () => {
  refuse({ maxOutputTokens: 0 }, 'output_not_bounded')
  refuse({ maxOutputTokens: 257 }, 'output_not_bounded')
  refuse({ maxOutputTokens: Number.POSITIVE_INFINITY }, 'output_not_bounded')
})
test('previous actual Nova Micro test usage priced gross only (15 input / 3 output)', () => {
  const q = quoteNovaMicroGrossUsage(15, 3)
  assert.equal(q.modelId, 'amazon.nova-micro-v1:0')
  assert.equal(q.region, 'us-east-1')
  assert.ok(Math.abs(q.grossUsd - 0.000000945) < 1e-14)
  assert.equal(q.creditsAppliedUsd, null)
  assert.equal(q.netBilledUsd, null)
})
test('gross upper bound depends on full context, not guessed input tokens', () => {
  const ceiling = boundNovaMicroPilotGrossUsd(64)
  const used = quoteNovaMicroGrossUsage(15, 3).grossUsd
  assert.ok(ceiling >= used)
  assert.ok(ceiling > 0.0044 && ceiling < 0.0046)
})
test('unverified metering is refused and never silently clamped', () => {
  assert.throws(() => quoteNovaMicroGrossUsage(-1, 1), /NOVA_PILOT_USAGE_NOT_VERIFIED/)
  assert.throws(() => quoteNovaMicroGrossUsage(128001, 1), /NOVA_PILOT_USAGE_NOT_VERIFIED/)
  assert.throws(() => quoteNovaMicroGrossUsage(10, 257), /NOVA_PILOT_USAGE_NOT_VERIFIED/)
  assert.throws(() => boundNovaMicroPilotGrossUsd(1000000), /NOVA_PILOT_OUTPUT_NOT_BOUNDED/)
})
