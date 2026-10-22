import { describe, expect, it } from 'vitest'
import { ATLAS_WORKERS, ROUTER_CATALOG_VERSION } from '@/lib/atlas/model-router/catalog'
import {
  routeModel, routeIndependentReviewer, ROUTER_DECISION_VERSION,
  type RoutingRequest,
  type WorkerEvidence,
} from '@/lib/atlas/model-router/route'

const NOW = 1_790_000_000_000
const health = (workerId: string, extra: Partial<WorkerEvidence> = {}): WorkerEvidence => ({
  workerId, health: 'ready', observedAtMs: NOW,
  authenticated: true, entitlement: 'available', inferenceSmokePassed: true,
  ...extra,
})
const defaultEvidence = [
  health('local-qwen3-4b'),
  health('codex-chatgpt-cli'),
  health('abacus-code-worker'),
  health('openai-metered-mini', { estimatedSpendSek: 0.5 }),
]
function request(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    task: 'summarize', minimumQuality: 1, dataClassification: 'public',
    allowExternalProcessing: true, observedNowMs: NOW,
    evidence: defaultEvidence,
    meteredPolicy: { humanApproved: false, hardSpendGateEnforced: false, remainingBudgetSek: null, approvedCeilingSek: null },
    ...overrides,
  }
}

describe('Atlas Model Router v1: advisory, fail closed', () => {
  it('provides versioned, immutable allowlisted identities, not the SDF1 patch worker authority', () => {
    expect(ROUTER_CATALOG_VERSION).toBe('atlas.model-router.catalog.v1')
    expect(new Set(ATLAS_WORKERS.map(w => w.id)).size).toBe(ATLAS_WORKERS.length)
    expect(ATLAS_WORKERS.every(w => w.executesWithoutHumanGate === false)).toBe(true)
  })
  it('picks local model for suitable cheap work only with successful inference smoke', () => {
    const result = routeModel(request())
    expect(result.selectedWorkerId).toBe('local-qwen3-4b')
    expect(result.status).toBe('selected')
    expect(result.version).toBe(ROUTER_DECISION_VERSION)
    expect(result.dispatchAuthorized).toBe(false)
  })
  it('prefers Codex for quality-sensitive code without granting permission', () => {
    const decision = routeModel(request({ task: 'code_patch', minimumQuality: 3 }))
    expect(decision.selectedWorkerId).toBe('codex-chatgpt-cli')
    expect(decision.independentReviewRequired).toBe(true)
    expect(decision.dispatchAuthorized).toBe(false)
  })
  it('requires a genuinely independent code reviewer rather than self-review', () => {
    const review = routeIndependentReviewer('codex-chatgpt-cli', request({
      task: 'code_patch', minimumQuality: 1,
    }))
    expect(review.status).toBe('blocked')
    expect(review.considered.find(c => c.workerId === 'codex-chatgpt-cli')?.rejected)
      .toContain('independence_conflict')
    expect(review.considered.find(c => c.workerId === 'abacus-code-worker')?.rejected)
      .toContain('unverified_commercial_terms')
    expect(review.considered.find(c => c.workerId === 'abacus-code-worker')?.rejected)
      .toContain('independence_unproven')
    expect(review.dispatchAuthorized).toBe(false)
  })
  it('invalid author cannot assign a reviewer', () => {
    const review = routeIndependentReviewer('unrecognized-agent', request())
    expect(review.status).toBe('blocked')
  })
  it('does not enable unverified Abacus billing just because it is logged in', () => {
    const res = routeModel(request({task: 'code_review', minimumQuality: 2,
      evidence: [health('abacus-code-worker')]}))
    expect(res.status).toBe('blocked')
    expect(res.considered.find(x => x.workerId === 'abacus-code-worker')?.rejected)
      .toContain('unverified_commercial_terms')
  })
  it('never sends restricted data to external candidates', () => {
    const result = routeModel(request({ task: 'code_patch', minimumQuality: 3, dataClassification: 'restricted' }))
    expect(result.status).toBe('blocked')
    expect(result.considered.find(x => x.workerId === 'codex-chatgpt-cli')?.rejected)
      .toContain('external_processing_forbidden')
  })
  it('enforces explicit allowExternalProcessing even on public data', () => {
    const res = routeModel(request({task: 'code_patch', minimumQuality: 3, allowExternalProcessing: false}))
    expect(res.status).toBe('blocked')
  })
  it('refuses local model until model actually answered successfully', () => {
    const res = routeModel(request({ allowExternalProcessing: false,
      evidence: [health('local-qwen3-4b', { inferenceSmokePassed: false })] }))
    expect(res.status).toBe('blocked')
    expect(res.considered[0].rejected).toContain('local_inference_not_proven')
  })
  it('blocks stale health (including future timestamps), conflicts, and missing evidence', () => {
    for (const evidence of [
      [],
      [health('local-qwen3-4b', { observedAtMs: NOW - 300_001 })],
      [health('local-qwen3-4b', { observedAtMs: NOW + 1 })],
      [health('local-qwen3-4b'), health('local-qwen3-4b')],
    ]) {
      const res = routeModel(request({ allowExternalProcessing: false, evidence }))
      expect(res.status).toBe('blocked')
      expect(res.considered[0].rejected).toContain('unverified_or_stale_health')
    }
  })
  it('rejects missing, exhausted or unknown subscription quotas and accounts', () => {
    for (const variant of [
      { authenticated: false }, { entitlement: 'exhausted' as const }, { entitlement: 'unknown' as const },
    ]) {
      const res = routeModel(request({task: 'code_patch', minimumQuality: 3,
        evidence: [health('codex-chatgpt-cli', variant)]}))
      expect(res.status).toBe('blocked')
    }
  })
  it('blocks unapproved metered fallback even with money in budget', () => {
    const res = routeModel(request({task: 'summarize', minimumQuality: 2,
      evidence: [health('openai-metered-mini', { estimatedSpendSek: 1 })],
      meteredPolicy: {humanApproved: false,hardSpendGateEnforced: true,remainingBudgetSek: 10,approvedCeilingSek: 10}}))
    expect(res.status).toBe('blocked')
    expect(res.considered[3].rejected).toContain('spend_authority_missing')
  })
  it('requires a positive cost estimate and refuses NaN, Infinity and overrun', () => {
    for (const cost of [undefined, 0, -1, Number.NaN, Infinity, 4]) {
      const res = routeModel(request({task: 'summarize', minimumQuality: 2,
        evidence: [health('openai-metered-mini', {estimatedSpendSek: cost})],
        meteredPolicy: {humanApproved: true, hardSpendGateEnforced: true, remainingBudgetSek: 3, approvedCeilingSek: 3}}))
      expect(res.status).toBe('blocked')
    }
  })
  it('reports candidate only after attested metered approval and a budget', () => {
    const res = routeModel(request({task: 'summarize', minimumQuality: 2,
      evidence: [health('openai-metered-mini', {estimatedSpendSek: 0.5})],
      meteredPolicy: {humanApproved:true,hardSpendGateEnforced:true,remainingBudgetSek:1,approvedCeilingSek:1}}))
    expect(res.selectedWorkerId).toBe('openai-metered-mini')
    expect(res.dispatchAuthorized).toBe(false)
  })
  it('rejects untrusted runtime inputs instead of widening missing guards', () => {
    for (const input of [
      null, {}, { ...request(), task: 'unknown' },
      { ...request(), minimumQuality: undefined },
      { ...request(), dataClassification: undefined },
      { ...request(), allowExternalProcessing: undefined },
      { ...request(), evidence: 'trust me' },
      { ...request(), evidence: [null] },
      { ...request(), meteredPolicy: null },
      { ...request(), meteredPolicy: { ...request().meteredPolicy, hardSpendGateEnforced: undefined } },
    ]) {
      const result = routeModel(input)
      expect(result.status).toBe('blocked')
      expect(result.dispatchAuthorized).toBe(false)
      expect(result.considered[0].rejected).toContain('invalid_request')
    }
  })
  it('defaults to blocked when all agents fail and does not silently fall back', () => {
    const res = routeModel(request({ task: 'code_patch', minimumQuality: 3, evidence: [] }))
    expect(res.status).toBe('blocked')
    expect(res.selectedWorkerId).toBeNull()
    expect(res.dispatchAuthorized).toBe(false)
  })
})
