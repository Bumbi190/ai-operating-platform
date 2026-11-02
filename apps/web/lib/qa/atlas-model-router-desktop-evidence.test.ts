import { describe, expect, it } from 'vitest'
import {
  DESKTOP_SNAPSHOT_VERSION,
  inspectDesktopSnapshot,
  previewRouteFromDesktopSnapshot,
} from '@/lib/atlas/model-router/desktop-evidence'
import { type RoutingRequest } from '@/lib/atlas/model-router/route'

const NOW = Date.parse('2026-10-29T07:44:00Z')
const fixture = () => ({
  schemaVersion: DESKTOP_SNAPSHOT_VERSION,
  capturedAtMs: NOW,
  origin: 'unattested_windows_local',
  brokerAttested: false,
  dispatchAuthorized: false,
  preflight: {
    state: 'observed', freeRamMB: 2998,
    gpu: { name: 'NVIDIA GeForce RTX 3060', totalVramMB: 12288,
      freeVramMB: 10648, temperatureC: 39 },
    localModels: ['prime-agent-coder:7b', 'qwen3:4b'],
    ollamaServer: true,
    resourceGatePassed: false,
    inferenceSmokePassed: false,
    codexLoginSeen: true,
  },
  primePilot: {
    credentialFilePresent: true,
    entitlementVerified: false,
    toolSmokeFresh: false,
    pilotHumanApproved: false,
    historicalTestState: 'historical_locally_consistent',
    historicalTestCount: 5,
    historicalTestPass: 5,
    historicalReportTimestamp: '2026-10-29T06:43:29Z',
  },
  budget: {
    state: 'local_ledger_read', day: '2026-10-29', timezone: 'Europe/Stockholm',
    localApiBudgetLimitUsd: 5, localApiReservedUsd: 0,
    localCodexRunLimit: 3, localCodexRunSlotsRemaining: 3,
    actualCodexUsdKnown: false,
  },
  note: 'Read-only untrusted diagnostic.',
})

const request = (): RoutingRequest => ({
  task: 'code_patch',
  minimumQuality: 2,
  dataClassification: 'public',
  allowExternalProcessing: true,
  observedNowMs: NOW,
  evidence: [{
    workerId: 'prime-agent-codex-pilot',
    health: 'ready', observedAtMs: NOW,
    authenticated: true, entitlement: 'available',
    pilotToolSmokePassed: true, pilotIsolationVerified: true,
    pilotCodexSlotAvailable: true, pilotHumanApproved: true,
  }],
  meteredPolicy: {
    humanApproved: true,
    hardSpendGateEnforced: true,
    remainingBudgetSek: 100,
    approvedCeilingSek: 100,
  },
})

describe('Read-only desktop snapshot is diagnostic, never an authorization', () => {
  it('reads real-type local fields but reports no attestation or quota guarantee', () => {
    const result = inspectDesktopSnapshot(fixture(), NOW + 1000)
    expect(result.status).toBe('observed')
    expect(result.localModels).toEqual(['prime-agent-coder:7b','qwen3:4b'])
    expect(result.availableSystemRamMB).toBe(2998)
    expect(result.availableGpuVramMB).toBe(10648)
    expect(result.localResourceGatePassed).toBe(false)
    expect(result.primeHistoricalTests).toBe(5)
    expect(result.primeHistoricalPasses).toBe(5)
    expect(result.primeFreshToolSmokeVerified).toBe(false)
    expect(result.codexLoginSeen).toBe(true)
    expect(result.codexEntitlementVerified).toBe(false)
    expect(result.localBudget?.localCodexRunSlotsRemaining).toBe(3)
    expect(result.localBudget?.actualCodexUsdKnown).toBe(false)
    expect(result.brokerAttested).toBe(false)
    expect(result.routingEvidenceTrusted).toBe(false)
    expect(result.dispatchAuthorized).toBe(false)
    expect(result.blockers).toEqual(expect.arrayContaining([
      'broker_attestation_missing','inference_smoke_not_proven',
      'codex_quota_unverified','pilot_human_approval_missing',
      'local_resources_unavailable',
    ]))
  })
  it('never reuses old evidence as an active tool smoke', () => {
    const input = fixture()
    input.primePilot.historicalReportTimestamp = '2026-10-29T07:43:59Z'
    const result = inspectDesktopSnapshot(input, NOW)
    expect(result.primeFreshToolSmokeVerified).toBe(false)
    expect(result.dispatchAuthorized).toBe(false)
  })
  it('rejects a forged broker attestation or dispatch flag', () => {
    expect(inspectDesktopSnapshot({...fixture(), brokerAttested:true},NOW).status).toBe('invalid')
    expect(inspectDesktopSnapshot({...fixture(), dispatchAuthorized:true},NOW).status).toBe('invalid')
  })
  it('rejects client-forged local model inference or Prime approval', () => {
    expect(inspectDesktopSnapshot({...fixture(),preflight:{
      ...fixture().preflight, inferenceSmokePassed:true,
    }},NOW).status).toBe('invalid')
    expect(inspectDesktopSnapshot({...fixture(),primePilot:{
      ...fixture().primePilot,pilotHumanApproved:true,
    }},NOW).status).toBe('invalid')
    expect(inspectDesktopSnapshot({...fixture(),primePilot:{
      ...fixture().primePilot,entitlementVerified:true,
    }},NOW).status).toBe('invalid')
  })
  it('rejects token-like extra fields rather than exposing them', () => {
    const injected = {...fixture(),apiKey:'do-not-log'}
    expect(inspectDesktopSnapshot(injected,NOW).status).toBe('invalid')
  })
  it('rejects malformed snapshot shapes and fields', () => {
    for (const value of [
      null,{},[],{...fixture(),schemaVersion:'wrong'},
      {...fixture(),capturedAtMs:'now'},
      {...fixture(),preflight:{...fixture().preflight,localModels:['../secret']}},
      {...fixture(),preflight:{...fixture().preflight,localModels:['qwen3:4b','qwen3:4b']}},
      {...fixture(),preflight:{...fixture().preflight,freeRamMB:-2}},
      {...fixture(),preflight:{...fixture().preflight,gpu: {
        ...fixture().preflight.gpu, freeVramMB:99000,
      }}},
    ]) {
      expect(inspectDesktopSnapshot(value,NOW).status).toBe('invalid')
    }
  })
  it('marks stale data as not suitable for model routing', () => {
    expect(inspectDesktopSnapshot(fixture(),NOW+300000).status).toBe('observed')
    const stale=inspectDesktopSnapshot(fixture(),NOW+300001)
    expect(stale.status).toBe('stale')
    expect(stale.blockers).toContain('snapshot_stale_or_future')
    expect(stale.dispatchAuthorized).toBe(false)
    expect(inspectDesktopSnapshot(fixture(),NOW-1).status).toBe('stale')
  })
  it('rejects a fake hardware green light that does not match the resources', () => {
    const f=fixture()
    f.preflight.resourceGatePassed=true
    expect(inspectDesktopSnapshot(f,NOW).status).toBe('invalid')
  })
  it('fails closed when preflight is unavailable', () => {
    const f = fixture()
    const input = {...f,preflight:{
      ...f.preflight,state:'unavailable',freeRamMB:null,gpu:null,
      localModels:[],ollamaServer:false,resourceGatePassed:false,
      codexLoginSeen:false,
    }}
    const result=inspectDesktopSnapshot(input,NOW)
    expect(result.status).toBe('observed')
    expect(result.blockers).toContain('preflight_unavailable')
    expect(result.localModels).toEqual([])
    expect(result.dispatchAuthorized).toBe(false)
  })
  it('invalid or unavailable budget refuses quota claims', () => {
    const f=fixture()
    const missing = {...f,budget:{
      ...f.budget,state:'unavailable',day:null,localApiBudgetLimitUsd:null,
      localApiReservedUsd:null,localCodexRunLimit:null,
      localCodexRunSlotsRemaining:null,
    }}
    expect(inspectDesktopSnapshot(missing,NOW).blockers).toContain('pilot_budget_unavailable')
    expect(inspectDesktopSnapshot({...f,budget:{
      ...f.budget,localCodexRunSlotsRemaining:4,
    }},NOW).status).toBe('invalid')
    expect(inspectDesktopSnapshot({...f,budget:{
      ...f.budget,actualCodexUsdKnown:true,
    }},NOW).status).toBe('invalid')
  })
  it('detects a local Codex run-count limit, never claiming USD spend is known', () => {
    const f=fixture()
    const result=inspectDesktopSnapshot({...f,budget:{
      ...f.budget,localCodexRunSlotsRemaining:0,
    }},NOW)
    expect(result.blockers).toContain('pilot_daily_run_limit_reached')
    expect(result.localBudget?.actualCodexUsdKnown).toBe(false)
  })
  it('a forged READY WorkerEvidence in the caller cannot unlock dispatch in this preview', () => {
    const output=previewRouteFromDesktopSnapshot(fixture(),request())
    expect(output.diagnostic.status).toBe('observed')
    expect(output.decision.status).toBe('blocked')
    expect(output.decision.selectedWorkerId).toBeNull()
    expect(output.decision.dispatchAuthorized).toBe(false)
    expect(output.decision.considered.find(x=>x.workerId==='prime-agent-codex-pilot')?.rejected)
      .toContain('unverified_or_stale_health')
  })
  it('does not accept malformed caller classification in the preview', () => {
    const r={...request(),task:'run_any_shell'} as unknown as RoutingRequest
    const output=previewRouteFromDesktopSnapshot(fixture(),r)
    expect(output.decision.status).toBe('blocked')
    expect(output.decision.considered[0].rejected).toContain('invalid_request')
  })
})

describe('Desktop evidence clock, model and cost boundaries', () => {
  it('rejects a budget snapshot belonging to another Stockholm day', () => {
    const f = fixture()
    f.budget.day = '2026-10-28'
    expect(inspectDesktopSnapshot(f, NOW).status).toBe('invalid')
  })
  it('rejects an invalid Gregorian date instead of normalizing it', () => {
    const f = fixture()
    f.budget.day = '2026-02-31'
    expect(inspectDesktopSnapshot(f, NOW).status).toBe('invalid')
  })
  it('rejects synthetic test evidence supposedly written in the future', () => {
    const f = fixture()
    f.primePilot.historicalReportTimestamp = '2026-10-29T07:45:00Z'
    expect(inspectDesktopSnapshot(f, NOW).status).toBe('invalid')
  })
  it('a good resource preflight alone never proves successful inference', () => {
    const f = fixture()
    f.preflight.freeRamMB = 8192
    f.preflight.resourceGatePassed = true
    const result = inspectDesktopSnapshot(f, NOW)
    expect(result.status).toBe('observed')
    expect(result.localResourceGatePassed).toBe(true)
    expect(result.inferenceSmokePassed).toBe(false)
    expect(result.blockers).toContain('inference_smoke_not_proven')
    expect(result.dispatchAuthorized).toBe(false)
  })
  it('never forwards caller-supplied provider quota evidence to the router', () => {
    const r = request()
    const res = previewRouteFromDesktopSnapshot(fixture(), {
      ...r,
      evidence: [...r.evidence, {
        workerId: 'codex-chatgpt-cli', health: 'ready',
        observedAtMs: NOW, authenticated: true, entitlement: 'available',
      }],
    })
    expect(res.decision.status).toBe('blocked')
    expect(res.decision.selectedWorkerId).toBeNull()
  })
})
