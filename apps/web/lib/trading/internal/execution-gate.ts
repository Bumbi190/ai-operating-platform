/**
 * Omnira Trading Core — INTERNAL execution gate.
 *
 * ⚠ NOT PART OF THE PUBLIC CONTRACT. Not re-exported from `@/lib/trading`.
 *
 * The narrowest point in the system: everything upstream is analysis, everything
 * downstream reaches a broker.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §17 (Execution Gateway), §24 (Execution Intent),
 *    §16 (approval modes), §26 (fail closed), §27 (kill switch), §28 (health)
 *  - Datamodell v0.1 §33 (proposals name their decisions), §36–37
 *  - Risk Engine Specification v0.1 §32 (proposal expiry), §55 (execution health)
 *
 * THE GATE TAKES CAPABILITIES, NOT RECORDS.
 * It accepts a RiskClearance, a PropClearance and an ApprovalGrant — never raw
 * RiskDecision / PropDecision / Approval records. Records are data anyone can
 * construct; capabilities are issued by `./authority` and carry a runtime
 * witness this file verifies. That is what makes veto non-bypassable rather
 * than merely inconvenient to forge.
 *
 * DELIBERATELY NOT CHECKED HERE:
 *  - Slippage tolerance / execution safety margin — GATE-12, still open.
 *  - Pre-execution revalidation (Systemarkitektur §25) — a Fas 6 runtime concern
 *    that re-runs the engines. Core defines the crossing point, not the re-run.
 */

import {
  grantsPermission,
  modeAllowsExecution,
  modeEnvironmentScope,
  type AuthorityMode,
} from '../authority'
import { isPositive, type Decimal } from '../decimal'
import { environmentsAgree, type TradingEnvironment } from '../environment'
import { isWellFormedId, type ExecutionId, type RunnerId } from '../ids'
import type { ExecutionIntent, OrderType } from '../execution-intent'
import { isProposalExpired, statusAllowsExecution, type TradeProposal } from '../proposal'
import { reason, type Reason } from '../reason-codes'
import {
  findBlockingKillSwitch, healthVerdict,
  type ExecutionHealth, type KillSwitchSnapshot,
} from '../safety'
import { isExpiredAt, toEpochMs, type Timestamp } from '../time'
import {
  isGenuineAuthority,
  type ApprovalGrant, type PropClearance, type RiskClearance,
} from './authority'

/** Everything the gate needs. Nothing is optional; absence is a refusal. */
export interface ExecutionGateInput {
  readonly proposal: TradeProposal
  readonly riskClearance: RiskClearance | null
  readonly propClearance: PropClearance | null
  readonly approvalGrant: ApprovalGrant | null
  readonly authorityMode: AuthorityMode
  /** The account's resolved environment. Null when unknown — never defaulted. */
  readonly accountEnvironment: TradingEnvironment | null
  readonly killSwitches: KillSwitchSnapshot
  readonly health: ExecutionHealth
  readonly runnerId: RunnerId
  readonly executionId: ExecutionId
  readonly idempotencyKey: string
  readonly orderType: OrderType
  readonly maximumAllowedDeviation: Decimal | null
  /** Requested intent lifetime. Bounded by the proposal and the approval. */
  readonly expiresAt: Timestamp
  readonly now: Timestamp
}

/** Gate outcome. On refusal, every failed check is reported, not just the first. */
export type ExecutionGateResult =
  | { readonly ok: true; readonly intent: ExecutionIntent }
  | { readonly ok: false; readonly reasons: readonly Reason[] }

/**
 * The single supported path from an approved proposal to an execution intent.
 *
 * Collects every failure rather than short-circuiting, so an operator reading
 * the journal sees the whole picture instead of one symptom at a time.
 */
export function openExecutionGate(input: ExecutionGateInput): ExecutionGateResult {
  const reasons: Reason[] = []
  const { proposal, now } = input

  // --- Authority provenance -------------------------------------------------
  // Verified first: a capability this codebase did not issue is not evidence of
  // anything, so nothing derived from it should be trusted below.
  let risk = input.riskClearance
  let prop = input.propClearance
  let grant = input.approvalGrant

  if (risk !== null && !isGenuineAuthority(risk)) {
    reasons.push(reason('AUTHORITY_NOT_GENUINE', 'Risk clearance was not issued by Trading Core'))
    risk = null
  }
  if (prop !== null && !isGenuineAuthority(prop)) {
    reasons.push(reason('AUTHORITY_NOT_GENUINE', 'Prop clearance was not issued by Trading Core'))
    prop = null
  }
  if (grant !== null && !isGenuineAuthority(grant)) {
    reasons.push(reason('AUTHORITY_NOT_GENUINE', 'Approval grant was not issued by Trading Core'))
    grant = null
  }

  // --- Authority mode -------------------------------------------------------
  if (!modeAllowsExecution(input.authorityMode)) {
    reasons.push(reason('MODE_FORBIDS_EXECUTION', `Mode ${input.authorityMode} cannot execute`))
  }

  // --- Environment ----------------------------------------------------------
  const env = input.accountEnvironment
  if (env === null) {
    reasons.push(reason('ENVIRONMENT_UNKNOWN', 'Account environment is unresolved'))
  } else {
    if (!environmentsAgree(env, proposal.environment)) {
      reasons.push(
        reason('ENVIRONMENT_MISMATCH', `Account ${env} vs proposal ${proposal.environment}`),
      )
    }
    const scope = modeEnvironmentScope(input.authorityMode)
    if (scope !== null && scope !== env) {
      reasons.push(
        reason('MODE_ENVIRONMENT_MISMATCH', `Mode is ${scope}-scoped but account is ${env}`),
      )
    }
  }

  // --- Proposal state -------------------------------------------------------
  if (!statusAllowsExecution(proposal.status)) {
    reasons.push(reason('PROPOSAL_STATUS_INVALID', `Status ${proposal.status} is not executable`))
  }
  if (isProposalExpired(proposal, now)) {
    reasons.push(reason('PROPOSAL_EXPIRED', `Expired at ${proposal.expiresAt}`))
  }

  // --- Risk veto and decision-reference integrity ---------------------------
  if (risk === null) {
    reasons.push(reason('MISSING_RISK_DECISION'))
  } else {
    if (risk.signalId !== proposal.signalId || risk.accountId !== proposal.accountId) {
      reasons.push(reason('REFERENCE_MISMATCH', 'Risk clearance does not match this proposal'))
      risk = null
    }
    if (proposal.riskDecisionId === null) {
      reasons.push(
        reason('MISSING_RISK_DECISION_REFERENCE', 'Proposal names no RiskDecision'),
      )
      risk = null
    } else if (risk !== null && proposal.riskDecisionId !== risk.riskDecisionId) {
      // The proposal was cleared by a *different* decision than the one offered.
      reasons.push(
        reason(
          'RISK_DECISION_REFERENCE_MISMATCH',
          `Proposal names ${proposal.riskDecisionId}, clearance is for ${risk.riskDecisionId}`,
        ),
      )
      risk = null
    }
  }

  // --- Prop veto and decision-reference integrity ---------------------------
  if (prop === null) {
    reasons.push(reason('MISSING_PROP_DECISION'))
  } else {
    if (prop.signalId !== proposal.signalId || prop.accountId !== proposal.accountId) {
      reasons.push(reason('REFERENCE_MISMATCH', 'Prop clearance does not match this proposal'))
      prop = null
    }
    if (proposal.propDecisionId === null) {
      reasons.push(
        reason('MISSING_PROP_DECISION_REFERENCE', 'Proposal names no PropDecision'),
      )
      prop = null
    } else if (prop !== null && proposal.propDecisionId !== prop.propDecisionId) {
      reasons.push(
        reason(
          'PROP_DECISION_REFERENCE_MISMATCH',
          `Proposal names ${proposal.propDecisionId}, clearance is for ${prop.propDecisionId}`,
        ),
      )
      prop = null
    }
  }

  // --- Approval -------------------------------------------------------------
  if (grant === null) {
    reasons.push(reason('MISSING_APPROVAL'))
  } else {
    if (grant.proposalId !== proposal.proposalId || grant.accountId !== proposal.accountId) {
      reasons.push(reason('REFERENCE_MISMATCH', 'Approval does not match this proposal'))
      grant = null
    } else if (env !== null && !environmentsAgree(grant.environment, env)) {
      reasons.push(reason('ENVIRONMENT_MISMATCH', 'Approval environment differs from account'))
      grant = null
    } else if (isExpiredAt(grant.expiresAt, now)) {
      reasons.push(reason('APPROVAL_EXPIRED', `Approval expired at ${grant.expiresAt}`))
      grant = null
    }
  }

  // --- Kill switch ----------------------------------------------------------
  const blocking = findBlockingKillSwitch(input.killSwitches, {
    accountId: proposal.accountId,
    instrumentId: proposal.instrumentId,
    strategyVersionId: proposal.strategyVersion.strategyVersionId,
    runnerId: input.runnerId,
  })
  if (blocking !== null) {
    reasons.push(reason('KILL_SWITCH_ACTIVE', `${blocking.scopeType}: ${blocking.reason}`))
  }

  // --- Execution health -----------------------------------------------------
  const health = healthVerdict(input.health)
  if (!grantsPermission(health)) {
    reasons.push(
      health === 'UNKNOWN'
        ? reason('VERDICT_UNKNOWN', 'Execution health is UNKNOWN')
        : reason('EXECUTION_HEALTH_FAILURE'),
    )
  }

  // --- Bounded authority lifetime -------------------------------------------
  // An intent must not be born expired, and must never outlive the permissions
  // that authorized it. Canonical docs give each object its own expiry
  // (Systemarkitektur §24, Datamodell §35–36) without stating a relationship;
  // bounding the derived object by its sources is the conservative reading and
  // contradicts nothing.
  const requested = input.expiresAt
  if (isExpiredAt(requested, now)) {
    reasons.push(
      reason('EXECUTION_INTENT_ALREADY_EXPIRED', `Requested expiry ${requested} is not in the future`),
    )
  }
  if (toEpochMs(requested) > toEpochMs(proposal.expiresAt)) {
    reasons.push(
      reason(
        'EXECUTION_INTENT_OUTLIVES_PROPOSAL',
        `Intent ${requested} exceeds proposal ${proposal.expiresAt}`,
      ),
    )
  }
  if (grant !== null && toEpochMs(requested) > toEpochMs(grant.expiresAt)) {
    reasons.push(
      reason(
        'EXECUTION_INTENT_OUTLIVES_APPROVAL',
        `Intent ${requested} exceeds approval ${grant.expiresAt}`,
      ),
    )
  }

  // --- Structural completeness ---------------------------------------------
  const quantity = proposal.quantity
  if (quantity === null || !isPositive(quantity)) {
    reasons.push(reason('EXECUTION_BLOCKED', 'Proposal carries no positive quantity'))
  }
  if (!isWellFormedId(input.idempotencyKey)) {
    reasons.push(reason('EXECUTION_BLOCKED', 'Malformed idempotency key'))
  }

  // --- Verdict --------------------------------------------------------------
  if (
    reasons.length > 0 ||
    risk === null ||
    prop === null ||
    grant === null ||
    env === null ||
    quantity === null
  ) {
    return { ok: false, reasons: Object.freeze(reasons) }
  }

  return {
    ok: true,
    intent: Object.freeze({
      executionId: input.executionId,
      proposalId: proposal.proposalId,
      accountId: proposal.accountId,
      instrumentId: proposal.instrumentId,
      runnerId: input.runnerId,
      environment: env,
      authorityMode: input.authorityMode,
      side: proposal.direction === 'LONG' ? 'BUY' : 'SELL',
      quantity,
      orderType: input.orderType,
      expectedEntry: proposal.entry,
      maximumAllowedDeviation: input.maximumAllowedDeviation,
      stopLoss: proposal.stopLoss,
      takeProfit: proposal.takeProfit,
      createdAt: now,
      expiresAt: requested,
      idempotencyKey: input.idempotencyKey,
      status: 'CREATED',
    }),
  }
}
