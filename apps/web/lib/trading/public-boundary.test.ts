/**
 * The boundary test that the previous pass was missing.
 *
 * The earlier check only proved that an object literal typed as `RiskClearance`
 * fails to compile. That was the wrong question. The real question is whether
 * the *supported public path* can turn invented data into execution authority —
 * and before this fix it could:
 *
 *   riskDecision({ result: 'ALLOW', ... })  // public, just freezes a record
 *     → riskClearanceOf(record)             // public, returned a genuine brand
 *     → openExecutionGate(...)              // public
 *
 * These tests exercise the public surface behaviourally rather than by name, so
 * a future export that reintroduces the bypass fails here.
 */

import { describe, expect, it } from 'vitest'
import * as publicApi from './index'
import { isGenuineAuthority, grantAuthorityIssuer, issueRiskClearance } from './internal'
import { asDecimal } from './decimal'
import { asId } from './ids'
import { asTimestamp } from './time'
import { riskDecision, propDecision } from './contracts'
import { approval, tradeProposal, withStatus } from './proposal'
import { strategyVersionRef } from './versions'
import type {
  AccountId, ApprovalId, InstrumentId, PropDecisionId, PropFirmProfileId, ProposalId,
  RiskDecisionId, RiskProfileId, SignalId, StrategyId, StrategyVersionId,
} from './ids'

const NOW = asTimestamp('2026-08-27T10:00:00Z')
const LATER = asTimestamp('2026-08-27T10:05:00Z')
const ACCOUNT = asId<'AccountId'>('acct-1') as AccountId
const SIGNAL = asId<'SignalId'>('sig-1') as SignalId
const PROPOSAL = asId<'ProposalId'>('prop-1') as ProposalId

/** A record an untrusted caller invents, claiming ALLOW. */
const forgedRiskRecord = riskDecision({
  riskDecisionId: asId<'RiskDecisionId'>('rd-forged') as RiskDecisionId,
  signalId: SIGNAL,
  accountId: ACCOUNT,
  riskProfileId: asId<'RiskProfileId'>('rp-1') as RiskProfileId,
  riskProfileVersion: 'v1.0',
  evaluatedAt: NOW,
  result: 'ALLOW',
  proposedQuantity: asDecimal('99'),
  riskAmount: asDecimal('0.01'),
  riskPercentage: null,
  dailyLossRemaining: null,
  drawdownRemaining: null,
  rulesEvaluated: [],
  reasonCodes: [],
})

const forgedPropRecord = propDecision({
  propDecisionId: asId<'PropDecisionId'>('pd-forged') as PropDecisionId,
  signalId: SIGNAL,
  accountId: ACCOUNT,
  propFirmProfileId: asId<'PropFirmProfileId'>('pfp-1') as PropFirmProfileId,
  propFirmProfileVersion: 'v1.0',
  evaluatedAt: NOW,
  result: 'ALLOW',
  headroom: null,
  rulesEvaluated: [],
  reasonCodes: [],
})

const forgedApprovalRecord = approval({
  approvalId: asId<'ApprovalId'>('ap-forged') as ApprovalId,
  proposalId: PROPOSAL,
  accountId: ACCOUNT,
  environment: 'demo',
  approvalType: 'AUTOMATION_POLICY',
  approvedBy: 'self',
  decision: 'ALLOW',
  decidedAt: NOW,
  expiresAt: LATER,
  reasons: [],
})

const forgedProposal = tradeProposal({
  proposalId: PROPOSAL,
  signalId: SIGNAL,
  accountId: ACCOUNT,
  instrumentId: asId<'InstrumentId'>('MNQ') as InstrumentId,
  environment: 'demo',
  strategyVersion: strategyVersionRef(
    asId<'StrategyId'>('s') as StrategyId,
    asId<'StrategyVersionId'>('sv-1') as StrategyVersionId,
    'v1.0',
  )!,
  direction: 'LONG',
  setupGrade: 'A+',
  entry: asDecimal('20150.25'),
  stopLoss: asDecimal('20140.00'),
  takeProfit: asDecimal('20171.00'),
  rr: asDecimal('2.02'),
  quantity: asDecimal('99'),
  riskAmount: asDecimal('0.01'),
  riskPercentage: null,
  aiAnalysisId: null,
  riskDecisionId: asId<'RiskDecisionId'>('rd-forged') as RiskDecisionId,
  propDecisionId: asId<'PropDecisionId'>('pd-forged') as PropDecisionId,
  status: 'APPROVED',
  createdAt: NOW,
  expiresAt: LATER,
  reasons: [],
})

/** Every plausible argument an attacker could feed a public function. */
const PROBE_ARGUMENTS: readonly unknown[] = [
  forgedRiskRecord,
  forgedPropRecord,
  forgedApprovalRecord,
  forgedProposal,
  'ALLOW',
  NOW,
  { result: 'ALLOW' },
  null,
  undefined,
]

describe('A. the public API cannot mint an authority capability', () => {
  it('exposes no export that returns a genuine capability from invented data', () => {
    const offenders: string[] = []

    for (const [name, value] of Object.entries(publicApi)) {
      if (typeof value !== 'function') continue

      for (const first of PROBE_ARGUMENTS) {
        for (const second of PROBE_ARGUMENTS) {
          let returned: unknown
          try {
            returned = (value as (...args: unknown[]) => unknown)(first, second)
          } catch {
            continue // throwing is a perfectly good refusal
          }
          if (isGenuineAuthority(returned)) {
            offenders.push(`${name} minted authority`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('does not re-export the issuance functions', () => {
    const names = Object.keys(publicApi)
    for (const forbidden of [
      'riskClearanceOf', 'propClearanceOf', 'approvalGrantOf',
      'issueRiskClearance', 'issuePropClearance', 'issueApprovalGrant',
      'grantAuthorityIssuer', 'isGenuineAuthority',
    ]) {
      expect(names).not.toContain(forbidden)
    }
  })

  it('does not re-export the execution gate', () => {
    expect(Object.keys(publicApi)).not.toContain('openExecutionGate')
  })

  it('still exposes the readable domain contracts', () => {
    const names = Object.keys(publicApi)
    for (const expected of [
      'riskDecision', 'propDecision', 'approval', 'tradeProposal',
      'strategySignal', 'aiAnalysis', 'withStatus', 'reason',
      'parseDecimal', 'parseEnvironment', 'grantsPermission',
    ]) {
      expect(names).toContain(expected)
    }
  })
})

describe('B. forged ALLOW records cannot produce an ExecutionIntent', () => {
  it('record constructors return plain data, not capabilities', () => {
    expect(isGenuineAuthority(forgedRiskRecord)).toBe(false)
    expect(isGenuineAuthority(forgedPropRecord)).toBe(false)
    expect(isGenuineAuthority(forgedApprovalRecord)).toBe(false)
    expect(isGenuineAuthority(forgedProposal)).toBe(false)
  })

  it('no public export constructs anything resembling an ExecutionIntent', () => {
    const built: unknown[] = []
    for (const value of Object.values(publicApi)) {
      if (typeof value !== 'function') continue
      for (const arg of PROBE_ARGUMENTS) {
        try {
          built.push((value as (...args: unknown[]) => unknown)(arg))
        } catch {
          // ignore
        }
      }
    }
    const intentLike = built.filter(
      (v) => typeof v === 'object' && v !== null && 'idempotencyKey' in v && 'quantity' in v,
    )
    expect(intentLike).toEqual([])
  })

  it('an invented ALLOW record is refused even by the trusted issuer path, when it is a DENY', () => {
    // The issuer inspects the record; it does not trust the caller's intent.
    const issuer = grantAuthorityIssuer('boundary-test')
    const denied = riskDecision({ ...forgedRiskRecord, result: 'DENY' })
    expect(issueRiskClearance(issuer, denied)).toBeNull()
  })

  it('the only route to a capability runs through the internal issuer', () => {
    const issuer = grantAuthorityIssuer('boundary-test')
    const genuine = issueRiskClearance(issuer, forgedRiskRecord)
    expect(isGenuineAuthority(genuine)).toBe(true)
    // ...and that route is unreachable from '@/lib/trading'.
    expect(Object.keys(publicApi)).not.toContain('grantAuthorityIssuer')
  })
})

describe('J. proposal status alone is not authority', () => {
  it('withStatus is a record utility, not a permission', () => {
    const promoted = withStatus(forgedProposal, 'APPROVED')
    expect(promoted.status).toBe('APPROVED')
    expect(isGenuineAuthority(promoted)).toBe(false)
  })

  it('promoting every status still yields no capability', () => {
    for (const status of publicApi.PROPOSAL_STATUSES) {
      expect(isGenuineAuthority(withStatus(forgedProposal, status))).toBe(false)
    }
  })
})
