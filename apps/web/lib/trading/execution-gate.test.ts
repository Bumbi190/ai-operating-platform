import { describe, expect, it } from 'vitest'
import {
  approvalGrantOf, openExecutionGate, propClearanceOf, riskClearanceOf,
  type ExecutionGateInput, type ExecutionGateResult,
} from './execution-intent'
import { asDecimal } from './decimal'
import { asId } from './ids'
import type {
  AccountId, ApprovalId, ExecutionId, InstrumentId, PropDecisionId, PropFirmProfileId,
  ProposalId, RiskDecisionId, RiskProfileId, RunnerId, SignalId, StrategyId, StrategyVersionId,
} from './ids'
import { asTimestamp } from './time'
import { strategyVersionRef } from './versions'
import { approval, tradeProposal, type Approval, type TradeProposal } from './proposal'
import { propDecision, riskDecision, type PropDecision, type RiskDecision } from './contracts'
import type { ExecutionHealth, KillSwitch, KillSwitchSnapshot } from './safety'
import type { ReasonCode } from './reason-codes'
import type { Verdict } from './authority'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = asTimestamp('2026-08-27T10:00:00Z')
const LATER = asTimestamp('2026-08-27T10:05:00Z')

const ACCOUNT = asId<'AccountId'>('acct-1') as AccountId
const INSTRUMENT = asId<'InstrumentId'>('MNQ') as InstrumentId
const SIGNAL = asId<'SignalId'>('sig-1') as SignalId
const PROPOSAL = asId<'ProposalId'>('prop-1') as ProposalId
const RUNNER = asId<'RunnerId'>('runner-1') as RunnerId

const STRATEGY_VERSION = strategyVersionRef(
  asId<'StrategyId'>('omnira-liquidity-manipulation') as StrategyId,
  asId<'StrategyVersionId'>('sv-1') as StrategyVersionId,
  'v1.0',
)!

function makeProposal(over: Partial<TradeProposal> = {}): TradeProposal {
  return tradeProposal({
    proposalId: PROPOSAL,
    signalId: SIGNAL,
    accountId: ACCOUNT,
    instrumentId: INSTRUMENT,
    environment: 'demo',
    strategyVersion: STRATEGY_VERSION,
    direction: 'LONG',
    setupGrade: 'A+',
    entry: asDecimal('20150.25'),
    stopLoss: asDecimal('20140.00'),
    takeProfit: asDecimal('20171.00'),
    rr: asDecimal('2.02'),
    quantity: asDecimal('1'),
    riskAmount: asDecimal('102.50'),
    riskPercentage: asDecimal('0.21'),
    aiAnalysisId: null,
    riskDecisionId: asId<'RiskDecisionId'>('rd-1') as RiskDecisionId,
    propDecisionId: asId<'PropDecisionId'>('pd-1') as PropDecisionId,
    status: 'APPROVED',
    createdAt: NOW,
    expiresAt: LATER,
    reasons: [],
    ...over,
  })
}

function makeRisk(result: Verdict = 'ALLOW', over: Partial<RiskDecision> = {}): RiskDecision {
  return riskDecision({
    riskDecisionId: asId<'RiskDecisionId'>('rd-1') as RiskDecisionId,
    signalId: SIGNAL,
    accountId: ACCOUNT,
    riskProfileId: asId<'RiskProfileId'>('rp-1') as RiskProfileId,
    riskProfileVersion: 'v1.0',
    evaluatedAt: NOW,
    result,
    proposedQuantity: asDecimal('1'),
    riskAmount: asDecimal('102.50'),
    riskPercentage: asDecimal('0.21'),
    dailyLossRemaining: asDecimal('347.50'),
    drawdownRemaining: null,
    rulesEvaluated: [],
    reasonCodes: [],
    ...over,
  })
}

function makeProp(result: Verdict = 'ALLOW', over: Partial<PropDecision> = {}): PropDecision {
  return propDecision({
    propDecisionId: asId<'PropDecisionId'>('pd-1') as PropDecisionId,
    signalId: SIGNAL,
    accountId: ACCOUNT,
    propFirmProfileId: asId<'PropFirmProfileId'>('pfp-1') as PropFirmProfileId,
    propFirmProfileVersion: 'v1.0',
    evaluatedAt: NOW,
    result,
    headroom: null,
    rulesEvaluated: [],
    reasonCodes: [],
    ...over,
  })
}

function makeApproval(decision: Verdict = 'ALLOW', over: Partial<Approval> = {}): Approval {
  return approval({
    approvalId: asId<'ApprovalId'>('ap-1') as ApprovalId,
    proposalId: PROPOSAL,
    accountId: ACCOUNT,
    environment: 'demo',
    approvalType: 'MANUAL',
    approvedBy: 'operator',
    decision,
    decidedAt: NOW,
    expiresAt: LATER,
    reasons: [],
    ...over,
  })
}

const HEALTHY: ExecutionHealth = {
  runnerId: RUNNER,
  runnerOnline: 'ALLOW',
  brokerConnected: 'ALLOW',
  accountSynchronized: 'ALLOW',
  reconciliationComplete: 'ALLOW',
  lastHeartbeatAt: NOW,
  observedAt: NOW,
}

const NO_SWITCHES: KillSwitchSnapshot = { switches: [], observedAt: NOW }

function makeInput(over: Partial<ExecutionGateInput> = {}): ExecutionGateInput {
  return {
    proposal: makeProposal(),
    riskDecision: makeRisk('ALLOW'),
    propDecision: makeProp('ALLOW'),
    approval: makeApproval('ALLOW'),
    authorityMode: 'DEMO_MANUAL_APPROVAL',
    accountEnvironment: 'demo',
    killSwitches: NO_SWITCHES,
    health: HEALTHY,
    runnerId: RUNNER,
    executionId: asId<'ExecutionId'>('exec-1') as ExecutionId,
    idempotencyKey: 'idem-exec-1',
    orderType: 'MARKET',
    maximumAllowedDeviation: null,
    expiresAt: LATER,
    now: NOW,
    ...over,
  }
}

function codes(result: ExecutionGateResult): ReasonCode[] {
  return result.ok ? [] : result.reasons.map((r) => r.code)
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('execution gate — the one supported crossing', () => {
  it('opens when every authority stage allows', () => {
    const result = openExecutionGate(makeInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.intent.proposalId).toBe(PROPOSAL)
    expect(result.intent.environment).toBe('demo')
    expect(result.intent.side).toBe('BUY')
    expect(result.intent.status).toBe('CREATED')
  })

  it('maps direction to broker side', () => {
    const short = openExecutionGate(makeInput({ proposal: makeProposal({ direction: 'SHORT' }) }))
    expect(short.ok && short.intent.side).toBe('SELL')
  })

  it('carries the proposal levels through unchanged', () => {
    const result = openExecutionGate(makeInput())
    if (!result.ok) throw new Error('expected gate to open')
    expect(result.intent.expectedEntry.text).toBe('20150.25')
    expect(result.intent.stopLoss.text).toBe('20140.00')
    expect(result.intent.takeProfit.text).toBe('20171.00')
  })

  it('produces a frozen intent — immutable once created', () => {
    const result = openExecutionGate(makeInput())
    if (!result.ok) throw new Error('expected gate to open')
    expect(Object.isFrozen(result.intent)).toBe(true)
  })
})

// ─── Veto cannot be bypassed ──────────────────────────────────────────────────

describe('Risk holds veto', () => {
  it('refuses on RISK DENY', () => {
    const r = openExecutionGate(makeInput({ riskDecision: makeRisk('DENY') }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('RISK_DENIED')
  })

  it('refuses on RISK UNKNOWN — absence of information is not permission', () => {
    const r = openExecutionGate(makeInput({ riskDecision: makeRisk('UNKNOWN') }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('VERDICT_UNKNOWN')
  })

  it('refuses when the risk decision is missing entirely', () => {
    const r = openExecutionGate(makeInput({ riskDecision: null }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_RISK_DECISION')
  })

  it('refuses a risk decision belonging to another signal', () => {
    const foreign = makeRisk('ALLOW', { signalId: asId<'SignalId'>('sig-other') as SignalId })
    const r = openExecutionGate(makeInput({ riskDecision: foreign }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('REFERENCE_MISMATCH')
  })

  it('refuses a risk decision belonging to another account', () => {
    const foreign = makeRisk('ALLOW', { accountId: asId<'AccountId'>('acct-2') as AccountId })
    const r = openExecutionGate(makeInput({ riskDecision: foreign }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('REFERENCE_MISMATCH')
  })

  it('yields no clearance from a non-ALLOW decision', () => {
    expect(riskClearanceOf(makeRisk('DENY'))).toBeNull()
    expect(riskClearanceOf(makeRisk('UNKNOWN'))).toBeNull()
    expect(riskClearanceOf(makeRisk('ALLOW'))).not.toBeNull()
  })
})

describe('Prop holds veto independently', () => {
  it('refuses on PROP DENY even when Risk allowed', () => {
    const r = openExecutionGate(makeInput({ propDecision: makeProp('DENY') }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('PROP_BLOCKED')
  })

  it('refuses on PROP UNKNOWN', () => {
    const r = openExecutionGate(makeInput({ propDecision: makeProp('UNKNOWN') }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('VERDICT_UNKNOWN')
  })

  it('refuses when the prop decision is missing', () => {
    const r = openExecutionGate(makeInput({ propDecision: null }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_PROP_DECISION')
  })

  it('yields no clearance from a non-ALLOW decision', () => {
    expect(propClearanceOf(makeProp('DENY'))).toBeNull()
    expect(propClearanceOf(makeProp('UNKNOWN'))).toBeNull()
  })

  it('blocks when Risk allows but Prop denies — both must pass', () => {
    const r = openExecutionGate(makeInput({
      riskDecision: makeRisk('ALLOW'),
      propDecision: makeProp('DENY'),
    }))
    expect(r.ok).toBe(false)
  })
})

describe('Approval is required and expires', () => {
  it('refuses without an approval', () => {
    const r = openExecutionGate(makeInput({ approval: null }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_APPROVAL')
  })

  it('refuses a rejected approval', () => {
    const r = openExecutionGate(makeInput({ approval: makeApproval('DENY') }))
    expect(r.ok).toBe(false)
  })

  it('refuses an UNKNOWN approval', () => {
    const r = openExecutionGate(makeInput({ approval: makeApproval('UNKNOWN') }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('VERDICT_UNKNOWN')
  })

  it('refuses an expired approval', () => {
    const expired = makeApproval('ALLOW', { expiresAt: asTimestamp('2026-08-27T09:59:00Z') })
    const r = openExecutionGate(makeInput({ approval: expired }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('APPROVAL_EXPIRED')
  })

  it('refuses an approval for a different proposal', () => {
    const foreign = makeApproval('ALLOW', { proposalId: asId<'ProposalId'>('prop-2') as ProposalId })
    const r = openExecutionGate(makeInput({ approval: foreign }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('REFERENCE_MISMATCH')
  })

  it('yields no grant from a non-ALLOW or expired approval', () => {
    expect(approvalGrantOf(makeApproval('DENY'), NOW)).toBeNull()
    expect(approvalGrantOf(makeApproval('ALLOW', { expiresAt: NOW }), NOW)).toBeNull()
    expect(approvalGrantOf(makeApproval('ALLOW'), NOW)).not.toBeNull()
  })
})

// ─── Proposal lifecycle ───────────────────────────────────────────────────────

describe('proposal state', () => {
  it('refuses an expired proposal', () => {
    const stale = makeProposal({ expiresAt: asTimestamp('2026-08-27T09:59:00Z') })
    const r = openExecutionGate(makeInput({ proposal: stale }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('PROPOSAL_EXPIRED')
  })

  it('treats expiry exactly at now as expired', () => {
    const r = openExecutionGate(makeInput({ proposal: makeProposal({ expiresAt: NOW }) }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('PROPOSAL_EXPIRED')
  })

  it('refuses a proposal that was already executed — retries cannot double-fill', () => {
    for (const status of ['EXECUTED', 'EXECUTION_REQUESTED', 'EXECUTION_FAILED'] as const) {
      const r = openExecutionGate(makeInput({ proposal: makeProposal({ status }) }))
      expect(r.ok).toBe(false)
      expect(codes(r)).toContain('PROPOSAL_STATUS_INVALID')
    }
  })

  it('refuses proposals that never reached approval', () => {
    for (const status of ['CREATED', 'RISK_DENIED', 'PROP_DENIED', 'AWAITING_APPROVAL'] as const) {
      const r = openExecutionGate(makeInput({ proposal: makeProposal({ status }) }))
      expect(r.ok).toBe(false)
    }
  })

  it('refuses a proposal without a positive quantity', () => {
    expect(openExecutionGate(makeInput({ proposal: makeProposal({ quantity: null }) })).ok).toBe(false)
    expect(openExecutionGate(makeInput({ proposal: makeProposal({ quantity: asDecimal('0') }) })).ok).toBe(false)
  })
})

// ─── Environment safety ───────────────────────────────────────────────────────

describe('environment separation', () => {
  it('refuses when the account environment is unresolved — never defaults to live', () => {
    const r = openExecutionGate(makeInput({ accountEnvironment: null }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('ENVIRONMENT_UNKNOWN')
  })

  it('refuses a demo proposal against a live account', () => {
    const r = openExecutionGate(makeInput({
      proposal: makeProposal({ environment: 'demo' }),
      accountEnvironment: 'live',
      authorityMode: 'LIVE_MANUAL_APPROVAL',
      approval: makeApproval('ALLOW', { environment: 'live' }),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('ENVIRONMENT_MISMATCH')
  })

  it('refuses a live proposal against a demo account', () => {
    const r = openExecutionGate(makeInput({
      proposal: makeProposal({ environment: 'live' }),
      accountEnvironment: 'demo',
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('ENVIRONMENT_MISMATCH')
  })

  it('refuses a demo-scoped mode operating on a live account', () => {
    const r = openExecutionGate(makeInput({
      proposal: makeProposal({ environment: 'live' }),
      accountEnvironment: 'live',
      authorityMode: 'DEMO_AUTOMATION',
      approval: makeApproval('ALLOW', { environment: 'live' }),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MODE_ENVIRONMENT_MISMATCH')
  })

  it('refuses when the approval was granted in a different environment', () => {
    const r = openExecutionGate(makeInput({
      approval: makeApproval('ALLOW', { environment: 'live' }),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('ENVIRONMENT_MISMATCH')
  })
})

// ─── Mode safety ──────────────────────────────────────────────────────────────

describe('authority mode', () => {
  it('refuses execution in analysis-only and read-only modes', () => {
    for (const mode of ['ANALYSIS_ONLY', 'READ_ONLY'] as const) {
      const r = openExecutionGate(makeInput({ authorityMode: mode }))
      expect(r.ok).toBe(false)
      expect(codes(r)).toContain('MODE_FORBIDS_EXECUTION')
    }
  })

  it('permits the demo automation tier on a demo account', () => {
    const r = openExecutionGate(makeInput({ authorityMode: 'DEMO_AUTOMATION' }))
    expect(r.ok).toBe(true)
  })
})

// ─── Kill switch and health ───────────────────────────────────────────────────

describe('kill switch and health block the gate', () => {
  const active: KillSwitch[] = [{
    killSwitchId: asId<'KillSwitchId'>('ks-1') as never,
    scopeType: 'GLOBAL',
    scopeId: null,
    active: true,
    reason: 'manual halt',
    activatedBy: 'operator',
    activatedAt: NOW,
    clearedBy: null,
    clearedAt: null,
  }]

  it('refuses while a kill switch is active', () => {
    const r = openExecutionGate(makeInput({
      killSwitches: { switches: active, observedAt: NOW },
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('KILL_SWITCH_ACTIVE')
  })

  it('refuses when the heartbeat is missing', () => {
    const r = openExecutionGate(makeInput({
      health: { ...HEALTHY, lastHeartbeatAt: null },
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('VERDICT_UNKNOWN')
  })

  it('refuses while reconciliation is incomplete', () => {
    const r = openExecutionGate(makeInput({
      health: { ...HEALTHY, reconciliationComplete: 'DENY' },
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('EXECUTION_HEALTH_FAILURE')
  })
})

// ─── Diagnostics ──────────────────────────────────────────────────────────────

describe('refusal reporting', () => {
  it('reports every failed check, not only the first', () => {
    const r = openExecutionGate(makeInput({
      authorityMode: 'READ_ONLY',
      riskDecision: makeRisk('DENY'),
      propDecision: null,
      approval: null,
    }))
    expect(r.ok).toBe(false)
    const found = codes(r)
    expect(found).toContain('MODE_FORBIDS_EXECUTION')
    expect(found).toContain('RISK_DENIED')
    expect(found).toContain('MISSING_PROP_DECISION')
    expect(found).toContain('MISSING_APPROVAL')
  })

  it('preserves reason codes on the refusal for the journal', () => {
    const r = openExecutionGate(makeInput({ riskDecision: makeRisk('DENY') }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(Object.isFrozen(r.reasons)).toBe(true)
    for (const reason of r.reasons) expect(typeof reason.code).toBe('string')
  })

  it('never returns an intent alongside a refusal', () => {
    const r = openExecutionGate(makeInput({ riskDecision: null, propDecision: null }))
    expect(r.ok).toBe(false)
    expect('intent' in r).toBe(false)
  })
})
