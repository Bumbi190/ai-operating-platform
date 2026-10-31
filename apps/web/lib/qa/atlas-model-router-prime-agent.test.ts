import { describe, expect, it } from 'vitest'
import { ATLAS_WORKERS } from '@/lib/atlas/model-router/catalog'
import {
  routeModel, routeIndependentReviewer, type RoutingRequest, type WorkerEvidence,
} from '@/lib/atlas/model-router/route'

const NOW = 1_790_000_000_000
const primeEvidence = (flags: Partial<WorkerEvidence> = {}): WorkerEvidence => ({
  workerId: 'prime-agent-codex-pilot',
  health: 'ready',
  observedAtMs: NOW,
  authenticated: true,
  entitlement: 'available',
  ...flags,
})
const approvedEvidence = (): WorkerEvidence => primeEvidence({
  pilotToolSmokePassed: true,
  pilotIsolationVerified: true,
  pilotCodexSlotAvailable: true,
  pilotHumanApproved: true,
})
const request = (overrides: Partial<RoutingRequest> = {}): RoutingRequest => ({
  task: 'code_patch',
  minimumQuality: 2,
  dataClassification: 'public',
  allowExternalProcessing: true,
  observedNowMs: NOW,
  evidence: [approvedEvidence()],
  meteredPolicy: {
    humanApproved: false,
    hardSpendGateEnforced: false,
    remainingBudgetSek: null,
    approvedCeilingSek: null,
  },
  ...overrides,
})

const diag = (res: ReturnType<typeof routeModel>) =>
  res.considered.find(x => x.workerId === 'prime-agent-codex-pilot')?.rejected ?? []

describe('Prime Agent as an experimental, advisory-only Atlas worker', () => {
  it('catalog identity is the real OpenAI model lineage, not a made-up independent reviewer', () => {
    const candidate = ATLAS_WORKERS.find(x => x.id === 'prime-agent-codex-pilot')
    expect(candidate).toMatchObject({
      modelId: 'gpt-5.6-luna',
      provider: 'openai',
      modelLineage: 'openai',
      harness: 'prime-agent-docker',
      cost: 'subscription',
      supportedTasks: ['code_patch'],
      qualityTier: 2,
      executesWithoutHumanGate: false,
    })
  })

  it('rejects a logged-in but unverified pilot, listing all missing gates', () => {
    const res = routeModel(request({ evidence: [primeEvidence()] }))
    expect(res.status).toBe('blocked')
    expect(diag(res)).toEqual(expect.arrayContaining([
      'pilot_tool_smoke_missing',
      'pilot_isolation_unverified',
      'pilot_codex_slot_unavailable',
      'pilot_human_approval_missing',
    ]))
    expect(res.dispatchAuthorized).toBe(false)
  })

  it('requires current verified edit capability, sandbox, daily run slot and human consent', () => {
    for (const [field, reason] of [
      ['pilotToolSmokePassed', 'pilot_tool_smoke_missing'],
      ['pilotIsolationVerified', 'pilot_isolation_unverified'],
      ['pilotCodexSlotAvailable', 'pilot_codex_slot_unavailable'],
      ['pilotHumanApproved', 'pilot_human_approval_missing'],
    ] as const) {
      const evidence = approvedEvidence()
      const res = routeModel(request({
        evidence: [{ ...evidence, [field]: false }],
      }))
      expect(res.status).toBe('blocked')
      expect(diag(res)).toContain(reason)
    }
  })

  it('offers the verified Prime Agent for a bounded normal code patch, not execution', () => {
    const res = routeModel(request())
    expect(res.status).toBe('selected')
    expect(res.selectedWorkerId).toBe('prime-agent-codex-pilot')
    expect(res.selectedModelId).toBe('gpt-5.6-luna')
    expect(res.independentReviewRequired).toBe(true)
    expect(res.dispatchAuthorized).toBe(false)
    expect(res.explanation).toMatch(/no execution authorized/i)
  })

  it('keeps the higher-quality Codex CLI ahead of experimental Prime for quality tier 3', () => {
    const res = routeModel(request({
      minimumQuality: 3,
      evidence: [approvedEvidence(), {
        workerId:'codex-chatgpt-cli',health:'ready',observedAtMs:NOW,
        authenticated:true,entitlement:'available',
      }],
    }))
    expect(res.selectedWorkerId).toBe('codex-chatgpt-cli')
    expect(diag(res)).toContain('quality_below_threshold')
    expect(res.dispatchAuthorized).toBe(false)
  })

  it('is blocked for high-risk quality threshold when Codex CLI evidence is unavailable', () => {
    const res = routeModel(request({ minimumQuality: 3 }))
    expect(res.status).toBe('blocked')
    expect(diag(res)).toContain('quality_below_threshold')
  })

  it('never routes a code review or a task outside the verified pilot scope to Prime', () => {
    for (const task of ['classify','summarize','plan','code_review'] as const) {
      const res = routeModel(request({ task }))
      expect(res.selectedWorkerId).not.toBe('prime-agent-codex-pilot')
      expect(diag(res)).toContain('task_mismatch')
    }
  })

  it('respects sensitive data, explicit external processing permission and fresh evidence', () => {
    for (const override of [
      { dataClassification: 'restricted' as const },
      { allowExternalProcessing: false },
      { evidence: [primeEvidence({ ...approvedEvidence(), observedAtMs: NOW - 300_001 })] },
      { evidence: [approvedEvidence(), approvedEvidence()] },
      { evidence: [primeEvidence({ ...approvedEvidence(), entitlement: 'exhausted' as const })] },
    ]) {
      const res = routeModel(request(override))
      expect(res.status).toBe('blocked')
      expect(res.dispatchAuthorized).toBe(false)
    }
  })

  it('refuses untrusted evidence types, not treating string "true" as an attestation', () => {
    const res = routeModel({
      ...request(),
      evidence: [{ ...approvedEvidence(), pilotCodexSlotAvailable: 'true' }],
    })
    expect(res.status).toBe('blocked')
    expect(diag(res)).toContain('invalid_request')
  })

  it('does not turn two OpenAI-backed harnesses into independent reviewers', () => {
    const review = routeIndependentReviewer('codex-chatgpt-cli', request({
      task: 'code_patch', minimumQuality: 1,
    }))
    expect(review.status).toBe('blocked')
    expect(diag(review)).toContain('independence_conflict')
    expect(review.dispatchAuthorized).toBe(false)
    const reverse = routeIndependentReviewer('prime-agent-codex-pilot', request({
      evidence: [approvedEvidence(), {
        workerId:'codex-chatgpt-cli',health:'ready',observedAtMs:NOW,
        authenticated:true,entitlement:'available',
      }],
    }))
    expect(reverse.selectedWorkerId).not.toBe('codex-chatgpt-cli')
    expect(reverse.dispatchAuthorized).toBe(false)
  })
})
