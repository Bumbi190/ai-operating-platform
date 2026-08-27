import { describe, expect, it } from 'vitest'
import {
  grantAuthorityIssuer, isGenuineAuthority, issueApprovalGrant, issuePropClearance,
  issueRiskClearance, openExecutionGate,
  type ApprovalGrant, type ExecutionGateInput, type ExecutionGateResult,
  type PropClearance, type RiskClearance,
} from './internal'
import { asDecimal } from './decimal'
import { asId } from './ids'
import type {
  AccountId, ApprovalId, ExecutionId, InstrumentId, PropDecisionId, PropFirmProfileId,
  ProposalId, RiskDecisionId, RiskProfileId, RunnerId, SignalId, StrategyId, StrategyVersionId,
} from './ids'
import { asTimestamp } from './time'
import { strategyVersionRef } from './versions'
import { approval, tradeProposal, withStatus, type Approval, type TradeProposal } from './proposal'
import { propDecision, riskDecision, type PropDecision, type RiskDecision } from './contracts'
import type { ExecutionHealth, KillSwitch, KillSwitchSnapshot } from './safety'
import type { ReasonCode } from './reason-codes'
import type { Verdict } from './authority'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = asTimestamp('2026-08-27T10:00:00Z')
const LATER = asTimestamp('2026-08-27T10:05:00Z')
const MUCH_LATER = asTimestamp('2026-08-27T11:00:00Z')

const ACCOUNT = asId<'AccountId'>('acct-1') as AccountId
const INSTRUMENT = asId<'InstrumentId'>('MNQ') as InstrumentId
const SIGNAL = asId<'SignalId'>('sig-1') as SignalId
const PROPOSAL = asId<'ProposalId'>('prop-1') as ProposalId
const RUNNER = asId<'RunnerId'>('runner-1') as RunnerId
const RISK_DECISION_ID = asId<'RiskDecisionId'>('rd-1') as RiskDecisionId
const PROP_DECISION_ID = asId<'PropDecisionId'>('pd-1') as PropDecisionId

/** Stands in for a future Risk/Prop/Approval engine at the trusted boundary. */
const ISSUER = grantAuthorityIssuer('test-harness')

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
    riskDecisionId: RISK_DECISION_ID,
    propDecisionId: PROP_DECISION_ID,
    status: 'APPROVED',
    createdAt: NOW,
    expiresAt: LATER,
    reasons: [],
    ...over,
  })
}

function makeRisk(result: Verdict = 'ALLOW', over: Partial<RiskDecision> = {}): RiskDecision {
  return riskDecision({
    riskDecisionId: RISK_DECISION_ID,
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
    propDecisionId: PROP_DECISION_ID,
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
    riskClearance: issueRiskClearance(ISSUER, makeRisk('ALLOW')),
    propClearance: issuePropClearance(ISSUER, makeProp('ALLOW')),
    approvalGrant: issueApprovalGrant(ISSUER, makeApproval('ALLOW'), NOW),
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

// ─── K. Happy path still passes under the stricter model ──────────────────────

describe('execution gate — the one supported crossing', () => {
  it('opens when every authority stage issued a capability', () => {
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

// ─── L. DENY / UNKNOWN behaviour unchanged ────────────────────────────────────

describe('Risk holds veto', () => {
  it('issues no clearance for DENY or UNKNOWN', () => {
    expect(issueRiskClearance(ISSUER, makeRisk('DENY'))).toBeNull()
    expect(issueRiskClearance(ISSUER, makeRisk('UNKNOWN'))).toBeNull()
    expect(issueRiskClearance(ISSUER, makeRisk('ALLOW'))).not.toBeNull()
  })

  it('refuses when Risk denied, so no clearance exists', () => {
    const r = openExecutionGate(makeInput({
      riskClearance: issueRiskClearance(ISSUER, makeRisk('DENY')),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_RISK_DECISION')
  })

  it('refuses when the Risk verdict was UNKNOWN', () => {
    const r = openExecutionGate(makeInput({
      riskClearance: issueRiskClearance(ISSUER, makeRisk('UNKNOWN')),
    }))
    expect(r.ok).toBe(false)
  })

  it('refuses a clearance issued for another signal', () => {
    const foreign = issueRiskClearance(ISSUER, makeRisk('ALLOW', {
      signalId: asId<'SignalId'>('sig-other') as SignalId,
    }))
    const r = openExecutionGate(makeInput({ riskClearance: foreign }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('REFERENCE_MISMATCH')
  })

  it('refuses a clearance issued for another account', () => {
    const foreign = issueRiskClearance(ISSUER, makeRisk('ALLOW', {
      accountId: asId<'AccountId'>('acct-2') as AccountId,
    }))
    const r = openExecutionGate(makeInput({ riskClearance: foreign }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('REFERENCE_MISMATCH')
  })
})

describe('Prop holds veto independently', () => {
  it('issues no clearance for DENY or UNKNOWN', () => {
    expect(issuePropClearance(ISSUER, makeProp('DENY'))).toBeNull()
    expect(issuePropClearance(ISSUER, makeProp('UNKNOWN'))).toBeNull()
  })

  it('refuses when Prop blocked even though Risk allowed', () => {
    const r = openExecutionGate(makeInput({
      propClearance: issuePropClearance(ISSUER, makeProp('DENY')),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_PROP_DECISION')
  })
})

describe('Approval is required and expires', () => {
  it('issues no grant for DENY, UNKNOWN or an expired approval', () => {
    expect(issueApprovalGrant(ISSUER, makeApproval('DENY'), NOW)).toBeNull()
    expect(issueApprovalGrant(ISSUER, makeApproval('UNKNOWN'), NOW)).toBeNull()
    expect(issueApprovalGrant(ISSUER, makeApproval('ALLOW', { expiresAt: NOW }), NOW)).toBeNull()
    expect(issueApprovalGrant(ISSUER, makeApproval('ALLOW'), NOW)).not.toBeNull()
  })

  it('refuses without a grant', () => {
    const r = openExecutionGate(makeInput({ approvalGrant: null }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_APPROVAL')
  })

  it('refuses a grant for a different proposal', () => {
    const foreign = issueApprovalGrant(ISSUER, makeApproval('ALLOW', {
      proposalId: asId<'ProposalId'>('prop-2') as ProposalId,
    }), NOW)
    const r = openExecutionGate(makeInput({ approvalGrant: foreign }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('REFERENCE_MISMATCH')
  })

  it('refuses a grant that has expired between issuance and the gate', () => {
    const grant = issueApprovalGrant(ISSUER, makeApproval('ALLOW', { expiresAt: LATER }), NOW)
    const r = openExecutionGate(makeInput({
      approvalGrant: grant,
      proposal: makeProposal({ expiresAt: MUCH_LATER }),
      now: MUCH_LATER,
      expiresAt: MUCH_LATER,
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('APPROVAL_EXPIRED')
  })
})

// ─── C–F. Decision reference integrity ────────────────────────────────────────

describe('decision reference integrity', () => {
  it('C. refuses when the proposal names a different RiskDecision', () => {
    // A DENY decision is what the proposal actually references; an ALLOW from a
    // second decision must not be substitutable just because signal/account match.
    const otherAllow = issueRiskClearance(ISSUER, makeRisk('ALLOW', {
      riskDecisionId: asId<'RiskDecisionId'>('rd-substitute') as RiskDecisionId,
    }))
    const r = openExecutionGate(makeInput({ riskClearance: otherAllow }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('RISK_DECISION_REFERENCE_MISMATCH')
  })

  it('D. refuses when the proposal names a different PropDecision', () => {
    const otherAllow = issuePropClearance(ISSUER, makeProp('ALLOW', {
      propDecisionId: asId<'PropDecisionId'>('pd-substitute') as PropDecisionId,
    }))
    const r = openExecutionGate(makeInput({ propClearance: otherAllow }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('PROP_DECISION_REFERENCE_MISMATCH')
  })

  it('E. refuses when the proposal names no RiskDecision at all', () => {
    const r = openExecutionGate(makeInput({
      proposal: makeProposal({ riskDecisionId: null }),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_RISK_DECISION_REFERENCE')
  })

  it('F. refuses when the proposal names no PropDecision at all', () => {
    const r = openExecutionGate(makeInput({
      proposal: makeProposal({ propDecisionId: null }),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MISSING_PROP_DECISION_REFERENCE')
  })

  it('accepts only the exact decisions the proposal references', () => {
    expect(openExecutionGate(makeInput()).ok).toBe(true)
  })
})

// ─── G–I. Bounded authority lifetime ──────────────────────────────────────────

describe('execution intent lifetime is bounded by its upstream permissions', () => {
  it('G. refuses an intent that would be born expired', () => {
    const r = openExecutionGate(makeInput({ expiresAt: NOW }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('EXECUTION_INTENT_ALREADY_EXPIRED')
  })

  it('G. refuses an intent whose expiry is already in the past', () => {
    const r = openExecutionGate(makeInput({ expiresAt: asTimestamp('2026-08-27T09:59:00Z') }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('EXECUTION_INTENT_ALREADY_EXPIRED')
  })

  it('H. refuses an intent that would outlive the proposal', () => {
    const r = openExecutionGate(makeInput({ expiresAt: MUCH_LATER }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('EXECUTION_INTENT_OUTLIVES_PROPOSAL')
  })

  it('I. refuses an intent that would outlive the approval', () => {
    const shortGrant = issueApprovalGrant(
      ISSUER,
      makeApproval('ALLOW', { expiresAt: asTimestamp('2026-08-27T10:02:00Z') }),
      NOW,
    )
    const r = openExecutionGate(makeInput({
      approvalGrant: shortGrant,
      expiresAt: asTimestamp('2026-08-27T10:04:00Z'),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('EXECUTION_INTENT_OUTLIVES_APPROVAL')
  })

  it('permits an intent expiring exactly at the proposal boundary', () => {
    expect(openExecutionGate(makeInput({ expiresAt: LATER })).ok).toBe(true)
  })

  it('permits a shorter intent lifetime than its permissions', () => {
    const r = openExecutionGate(makeInput({ expiresAt: asTimestamp('2026-08-27T10:01:00Z') }))
    expect(r.ok).toBe(true)
  })
})

// ─── Proposal lifecycle ───────────────────────────────────────────────────────

describe('proposal state', () => {
  it('refuses an expired proposal', () => {
    const r = openExecutionGate(makeInput({
      proposal: makeProposal({ expiresAt: asTimestamp('2026-08-27T09:59:00Z') }),
      expiresAt: asTimestamp('2026-08-27T09:58:00Z'),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('PROPOSAL_EXPIRED')
  })

  it('treats proposal expiry exactly at now as expired', () => {
    const r = openExecutionGate(makeInput({ proposal: makeProposal({ expiresAt: NOW }) }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('PROPOSAL_EXPIRED')
  })

  it('refuses a proposal already consumed — retries cannot double-fill', () => {
    for (const status of ['EXECUTED', 'EXECUTION_REQUESTED', 'EXECUTION_FAILED'] as const) {
      const r = openExecutionGate(makeInput({ proposal: makeProposal({ status }) }))
      expect(r.ok).toBe(false)
      expect(codes(r)).toContain('PROPOSAL_STATUS_INVALID')
    }
  })

  it('refuses proposals that never reached approval', () => {
    for (const status of ['CREATED', 'RISK_DENIED', 'PROP_DENIED', 'AWAITING_APPROVAL'] as const) {
      expect(openExecutionGate(makeInput({ proposal: makeProposal({ status }) })).ok).toBe(false)
    }
  })

  it('refuses a proposal without a positive quantity', () => {
    expect(openExecutionGate(makeInput({ proposal: makeProposal({ quantity: null }) })).ok).toBe(false)
    expect(openExecutionGate(makeInput({ proposal: makeProposal({ quantity: asDecimal('0') }) })).ok).toBe(false)
  })
})

// ─── J. Status alone is not authority ─────────────────────────────────────────

describe('proposal status is never authority by itself', () => {
  it('J. marking a proposal APPROVED grants nothing without capabilities', () => {
    const promoted = withStatus(makeProposal({ status: 'RISK_DENIED' }), 'APPROVED')
    expect(promoted.status).toBe('APPROVED')

    const r = openExecutionGate(makeInput({
      proposal: promoted,
      riskClearance: null,
      propClearance: null,
      approvalGrant: null,
    }))
    expect(r.ok).toBe(false)
    const found = codes(r)
    expect(found).toContain('MISSING_RISK_DECISION')
    expect(found).toContain('MISSING_PROP_DECISION')
    expect(found).toContain('MISSING_APPROVAL')
  })

  it('J. withStatus cannot conjure a clearance for a denied decision', () => {
    const promoted = withStatus(makeProposal(), 'APPROVED')
    const deniedRisk = issueRiskClearance(ISSUER, makeRisk('DENY'))
    expect(deniedRisk).toBeNull()

    const r = openExecutionGate(makeInput({ proposal: promoted, riskClearance: deniedRisk }))
    expect(r.ok).toBe(false)
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
      accountEnvironment: 'live',
      authorityMode: 'LIVE_MANUAL_APPROVAL',
      approvalGrant: issueApprovalGrant(ISSUER, makeApproval('ALLOW', { environment: 'live' }), NOW),
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
      approvalGrant: issueApprovalGrant(ISSUER, makeApproval('ALLOW', { environment: 'live' }), NOW),
    }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('MODE_ENVIRONMENT_MISMATCH')
  })

  it('refuses a grant issued in a different environment', () => {
    const r = openExecutionGate(makeInput({
      approvalGrant: issueApprovalGrant(ISSUER, makeApproval('ALLOW', { environment: 'live' }), NOW),
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
    expect(openExecutionGate(makeInput({ authorityMode: 'DEMO_AUTOMATION' })).ok).toBe(true)
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
    const r = openExecutionGate(makeInput({ killSwitches: { switches: active, observedAt: NOW } }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('KILL_SWITCH_ACTIVE')
  })

  it('refuses when the heartbeat is missing', () => {
    const r = openExecutionGate(makeInput({ health: { ...HEALTHY, lastHeartbeatAt: null } }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('VERDICT_UNKNOWN')
  })

  it('refuses while reconciliation is incomplete', () => {
    const r = openExecutionGate(makeInput({ health: { ...HEALTHY, reconciliationComplete: 'DENY' } }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('EXECUTION_HEALTH_FAILURE')
  })
})

// ─── Provenance at the gate ───────────────────────────────────────────────────

describe('the gate verifies capability provenance at runtime', () => {
  it('recognizes issued capabilities', () => {
    expect(isGenuineAuthority(issueRiskClearance(ISSUER, makeRisk('ALLOW')))).toBe(true)
    expect(isGenuineAuthority(issuePropClearance(ISSUER, makeProp('ALLOW')))).toBe(true)
    expect(isGenuineAuthority(issueApprovalGrant(ISSUER, makeApproval('ALLOW'), NOW))).toBe(true)
  })

  it('rejects a structurally identical object produced by a cast', () => {
    const cast = {
      riskDecisionId: RISK_DECISION_ID,
      signalId: SIGNAL,
      accountId: ACCOUNT,
      issuedBy: 'attacker',
    } as unknown as RiskClearance
    expect(isGenuineAuthority(cast)).toBe(false)

    const r = openExecutionGate(makeInput({ riskClearance: cast }))
    expect(r.ok).toBe(false)
    expect(codes(r)).toContain('AUTHORITY_NOT_GENUINE')
  })

  it('rejects cast prop clearances and approval grants too', () => {
    const propCast = {
      propDecisionId: PROP_DECISION_ID, signalId: SIGNAL, accountId: ACCOUNT, issuedBy: 'x',
    } as unknown as PropClearance
    const grantCast = {
      approvalId: asId<'ApprovalId'>('ap-1'), proposalId: PROPOSAL, accountId: ACCOUNT,
      environment: 'demo', expiresAt: LATER, issuedBy: 'x',
    } as unknown as ApprovalGrant

    expect(codes(openExecutionGate(makeInput({ propClearance: propCast })))).toContain('AUTHORITY_NOT_GENUINE')
    expect(codes(openExecutionGate(makeInput({ approvalGrant: grantCast })))).toContain('AUTHORITY_NOT_GENUINE')
  })

  it('records which component issued each capability, for the journal', () => {
    const clearance = issueRiskClearance(ISSUER, makeRisk('ALLOW'))
    expect(clearance?.issuedBy).toBe('test-harness')
  })

  it('refuses to grant an issuer without a named component', () => {
    expect(() => grantAuthorityIssuer('')).toThrow()
    expect(() => grantAuthorityIssuer('   ')).toThrow()
  })
})

// ─── Diagnostics ──────────────────────────────────────────────────────────────

describe('refusal reporting', () => {
  it('reports every failed check, not only the first', () => {
    const r = openExecutionGate(makeInput({
      authorityMode: 'READ_ONLY',
      riskClearance: null,
      propClearance: null,
      approvalGrant: null,
    }))
    expect(r.ok).toBe(false)
    const found = codes(r)
    expect(found).toContain('MODE_FORBIDS_EXECUTION')
    expect(found).toContain('MISSING_RISK_DECISION')
    expect(found).toContain('MISSING_PROP_DECISION')
    expect(found).toContain('MISSING_APPROVAL')
  })

  it('preserves reason codes on the refusal for the journal', () => {
    const r = openExecutionGate(makeInput({ riskClearance: null }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(Object.isFrozen(r.reasons)).toBe(true)
    for (const item of r.reasons) expect(typeof item.code).toBe('string')
  })

  it('never returns an intent alongside a refusal', () => {
    const r = openExecutionGate(makeInput({ riskClearance: null, propClearance: null }))
    expect(r.ok).toBe(false)
    expect('intent' in r).toBe(false)
  })
})
