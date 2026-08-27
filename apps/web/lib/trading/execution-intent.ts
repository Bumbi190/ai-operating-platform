/**
 * Omnira Trading Core — ExecutionIntent and the authority gate.
 *
 * This is the narrowest point in the system. Everything upstream is analysis;
 * everything downstream touches a broker. The gate below is the only supported
 * way to cross that line.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §17 (Execution Gateway), §24 (Execution Intent),
 *    §16 (approval modes), §26 (fail closed), §27 (kill switch), §28 (health)
 *  - Datamodell v0.1 §36 (fields), §37 (status set)
 *  - README §5–6 (authority chain, Risk/Prop veto)
 *
 * HOW BYPASS IS PREVENTED:
 * An ExecutionIntent cannot be constructed directly — no exported constructor
 * accepts raw fields. It is produced only by `openExecutionGate`, which demands
 * a RiskClearance, a PropClearance and an ApprovalGrant. Those three are branded
 * types whose brand symbol is module-private, and each is obtainable only by
 * passing the corresponding decision through a function that returns null for
 * anything other than an explicit ALLOW.
 *
 * The consequence: `StrategySignal → ExecutionIntent` does not typecheck, and
 * no amount of object-literal construction downstream can forge a clearance.
 *
 * DELIBERATELY NOT CHECKED HERE:
 *  - Slippage tolerance and execution safety margin. That is GATE-12, still
 *    open. `maximumAllowedDeviation` is carried but Core assigns no threshold
 *    and enforces none; the Execution Gateway must enforce it in Fas 6 once the
 *    gate closes.
 *  - Pre-execution revalidation (Systemarkitektur §25). That is a Fas 6 runtime
 *    concern that re-runs the engines; Core only defines the crossing point.
 */

import {
  grantsPermission,
  modeAllowsExecution,
  modeEnvironmentScope,
  type AuthorityMode,
} from './authority'
import type { PropDecision, RiskDecision } from './contracts'
import { isPositive, type Decimal } from './decimal'
import { environmentsAgree, type TradingEnvironment } from './environment'
import { isWellFormedId, type AccountId, type ExecutionId, type InstrumentId, type ProposalId, type RunnerId, type SignalId } from './ids'
import {
  isApprovalExpired,
  isProposalExpired,
  statusAllowsExecution,
  type Approval,
  type TradeProposal,
} from './proposal'
import { reason, type Reason } from './reason-codes'
import { findBlockingKillSwitch, healthVerdict, type ExecutionHealth, type KillSwitchSnapshot } from './safety'
import type { Timestamp } from './time'

// ─── Clearances ───────────────────────────────────────────────────────────────

declare const clearanceBrand: unique symbol

/** Proof that a specific RiskDecision returned ALLOW. Unforgeable outside this module. */
export interface RiskClearance {
  readonly [clearanceBrand]: 'Risk'
  readonly signalId: SignalId
  readonly accountId: AccountId
}

/** Proof that a specific PropDecision returned ALLOW. */
export interface PropClearance {
  readonly [clearanceBrand]: 'Prop'
  readonly signalId: SignalId
  readonly accountId: AccountId
}

/** Proof that a specific Approval granted execution of a specific proposal. */
export interface ApprovalGrant {
  readonly [clearanceBrand]: 'Approval'
  readonly proposalId: ProposalId
  readonly accountId: AccountId
  readonly environment: TradingEnvironment
}

/**
 * Extract a clearance from a RiskDecision.
 * Returns null unless the decision is an explicit ALLOW.
 */
export function riskClearanceOf(decision: RiskDecision): RiskClearance | null {
  if (!grantsPermission(decision.result)) return null
  return Object.freeze({
    signalId: decision.signalId,
    accountId: decision.accountId,
  }) as RiskClearance
}

/**
 * Extract a clearance from a PropDecision.
 * Returns null unless the decision is an explicit ALLOW.
 */
export function propClearanceOf(decision: PropDecision): PropClearance | null {
  if (!grantsPermission(decision.result)) return null
  return Object.freeze({
    signalId: decision.signalId,
    accountId: decision.accountId,
  }) as PropClearance
}

/**
 * Extract a grant from an Approval.
 * Returns null unless the approval is an explicit ALLOW and still unexpired.
 */
export function approvalGrantOf(value: Approval, now: Timestamp): ApprovalGrant | null {
  if (!grantsPermission(value.decision)) return null
  if (isApprovalExpired(value, now)) return null
  return Object.freeze({
    proposalId: value.proposalId,
    accountId: value.accountId,
    environment: value.environment,
  }) as ApprovalGrant
}

// ─── Execution intent ─────────────────────────────────────────────────────────

/** Order types the gateway may express. Core selects none of them. */
export const ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP'] as const
export type OrderType = (typeof ORDER_TYPES)[number]

/** Execution lifecycle states (Datamodell §37). */
export const EXECUTION_STATUSES = [
  'CREATED',
  'DISPATCHED',
  'RECEIVED',
  'REVALIDATING',
  'DENIED',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'FILLED',
  'PARTIALLY_FILLED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
  'RECONCILED',
] as const
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]

/**
 * The only object an Execution Runner may act on.
 *
 * Immutable once created (Datamodell §36). `idempotencyKey` exists so that a
 * retry or a network fault can never produce two positions from one intent
 * (Systemarkitektur §24).
 */
export interface ExecutionIntent {
  readonly executionId: ExecutionId
  readonly proposalId: ProposalId
  readonly accountId: AccountId
  readonly instrumentId: InstrumentId
  readonly runnerId: RunnerId
  readonly environment: TradingEnvironment
  readonly authorityMode: AuthorityMode
  readonly side: 'BUY' | 'SELL'
  readonly quantity: Decimal
  readonly orderType: OrderType
  readonly expectedEntry: Decimal
  /** GATE-12. Carried, not enforced by Core. See module header. */
  readonly maximumAllowedDeviation: Decimal | null
  readonly stopLoss: Decimal
  readonly takeProfit: Decimal
  readonly createdAt: Timestamp
  readonly expiresAt: Timestamp
  readonly idempotencyKey: string
  readonly status: ExecutionStatus
}

// ─── The gate ─────────────────────────────────────────────────────────────────

/** Everything the gate needs. Nothing is optional; absence is a refusal. */
export interface ExecutionGateInput {
  readonly proposal: TradeProposal
  readonly riskDecision: RiskDecision | null
  readonly propDecision: PropDecision | null
  readonly approval: Approval | null
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

  // --- Risk veto ------------------------------------------------------------
  const risk = input.riskDecision
  let riskClearance: RiskClearance | null = null
  if (risk === null) {
    reasons.push(reason('MISSING_RISK_DECISION'))
  } else {
    riskClearance = riskClearanceOf(risk)
    if (riskClearance === null) {
      reasons.push(
        risk.result === 'UNKNOWN'
          ? reason('VERDICT_UNKNOWN', 'Risk verdict is UNKNOWN')
          : reason('RISK_DENIED'),
      )
    } else if (risk.signalId !== proposal.signalId || risk.accountId !== proposal.accountId) {
      reasons.push(reason('REFERENCE_MISMATCH', 'RiskDecision does not match this proposal'))
      riskClearance = null
    }
  }

  // --- Prop veto ------------------------------------------------------------
  const prop = input.propDecision
  let propClearance: PropClearance | null = null
  if (prop === null) {
    reasons.push(reason('MISSING_PROP_DECISION'))
  } else {
    propClearance = propClearanceOf(prop)
    if (propClearance === null) {
      reasons.push(
        prop.result === 'UNKNOWN'
          ? reason('VERDICT_UNKNOWN', 'Prop verdict is UNKNOWN')
          : reason('PROP_BLOCKED'),
      )
    } else if (prop.signalId !== proposal.signalId || prop.accountId !== proposal.accountId) {
      reasons.push(reason('REFERENCE_MISMATCH', 'PropDecision does not match this proposal'))
      propClearance = null
    }
  }

  // --- Approval -------------------------------------------------------------
  const approvalValue = input.approval
  let grant: ApprovalGrant | null = null
  if (approvalValue === null) {
    reasons.push(reason('MISSING_APPROVAL'))
  } else {
    grant = approvalGrantOf(approvalValue, now)
    if (grant === null) {
      reasons.push(
        isApprovalExpired(approvalValue, now)
          ? reason('APPROVAL_EXPIRED')
          : approvalValue.decision === 'UNKNOWN'
            ? reason('VERDICT_UNKNOWN', 'Approval verdict is UNKNOWN')
            : reason('MISSING_APPROVAL', 'Approval did not grant execution'),
      )
    } else if (grant.proposalId !== proposal.proposalId || grant.accountId !== proposal.accountId) {
      reasons.push(reason('REFERENCE_MISMATCH', 'Approval does not match this proposal'))
      grant = null
    } else if (env !== null && !environmentsAgree(grant.environment, env)) {
      reasons.push(reason('ENVIRONMENT_MISMATCH', 'Approval environment differs from account'))
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
    riskClearance === null ||
    propClearance === null ||
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
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      status: 'CREATED',
    }),
  }
}
