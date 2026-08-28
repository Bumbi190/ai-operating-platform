/**
 * Omnira Trading Core — TradeProposal and Approval.
 *
 * Canonical source:
 *  - Datamodell v0.1 §33 (fields), §34 (status set), §35 (Approval)
 *  - Systemarkitektur v0.1 §15 (proposal contents), §16 (approval policy)
 *
 * PRECEDENCE NOTE: Systemarkitektur §15 and Datamodell §34 both list proposal
 * statuses and the lists differ. SOURCE_OF_TRUTH P2 assigns "entiteter, fält,
 * states" to the Datamodell, and §15 labels its own list "Exempel på status",
 * so the Datamodell §34 set is used here. Only the casing is changed, to match
 * this repository's union style — a representation choice, not a semantic one.
 *
 * INVARIANTS:
 *  - A TradeProposal is a plan, never a broker order (Systemarkitektur §3).
 *  - A proposal is frozen once built. State changes produce a NEW proposal value
 *    carrying the prior status, so the transition itself is auditable.
 *  - An Approval is a separate object with its own expiry. A historical approval
 *    is never edited (Datamodell §35).
 */

import type { Verdict } from './authority'
import type { Direction, SetupGrade } from './contracts'
import type { Decimal } from './decimal'
import type {
  AccountId,
  AiAnalysisId,
  ApprovalId,
  InstrumentId,
  PropDecisionId,
  ProposalId,
  RiskDecisionId,
  SignalId,
} from './ids'
import type { Reason } from './reason-codes'
import type { TradingEnvironment } from './environment'
import { isExpiredAt, type Timestamp } from './time'
import type { StrategyVersionRef } from './versions'

// ─── Proposal status ──────────────────────────────────────────────────────────

/** The canonical proposal lifecycle states (Datamodell §34). */
export const PROPOSAL_STATUSES = [
  'CREATED',
  'RISK_DENIED',
  'PROP_DENIED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'EXECUTION_REQUESTED',
  'EXECUTED',
  'EXECUTION_FAILED',
  'CANCELLED',
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export function isProposalStatus(raw: unknown): raw is ProposalStatus {
  return typeof raw === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(raw)
}

/**
 * Statuses from which an execution intent may still be created.
 *
 * APPROVED only. Not EXECUTION_REQUESTED and not EXECUTED — those already
 * consumed the proposal, and re-using one is how a retry becomes a second
 * position (Systemarkitektur §17, §24).
 */
const EXECUTABLE_STATUSES: readonly ProposalStatus[] = ['APPROVED']

/** True when the proposal is in a status that can still reach execution. */
export function statusAllowsExecution(status: ProposalStatus): boolean {
  return EXECUTABLE_STATUSES.includes(status)
}

/** True when the proposal has already been consumed by an execution attempt. */
export function statusIsTerminalForExecution(status: ProposalStatus): boolean {
  return (
    status === 'EXECUTION_REQUESTED' ||
    status === 'EXECUTED' ||
    status === 'EXECUTION_FAILED' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED' ||
    status === 'REJECTED'
  )
}

// ─── Trade proposal ───────────────────────────────────────────────────────────

/**
 * A complete, structured trading plan.
 *
 * Every authority reference is nullable because a proposal can legitimately
 * exist before, or without, a given stage: a RISK_DENIED proposal never reaches
 * the Prop Engine. Nullability is what lets the execution gate detect a MISSING
 * decision rather than silently treating absence as approval.
 */
export interface TradeProposal {
  readonly proposalId: ProposalId
  readonly signalId: SignalId
  readonly accountId: AccountId
  readonly instrumentId: InstrumentId
  readonly environment: TradingEnvironment
  readonly strategyVersion: StrategyVersionRef
  readonly direction: Direction
  readonly setupGrade: SetupGrade
  readonly entry: Decimal
  readonly stopLoss: Decimal
  readonly takeProfit: Decimal
  readonly rr: Decimal
  readonly quantity: Decimal | null
  readonly riskAmount: Decimal | null
  readonly riskPercentage: Decimal | null
  readonly aiAnalysisId: AiAnalysisId | null
  readonly riskDecisionId: RiskDecisionId | null
  readonly propDecisionId: PropDecisionId | null
  readonly status: ProposalStatus
  readonly createdAt: Timestamp
  readonly expiresAt: Timestamp
  readonly reasons: readonly Reason[]
}

/** Freeze a proposal, including its reason array. */
export function tradeProposal(proposal: TradeProposal): TradeProposal {
  const copy = { ...proposal }
  Object.freeze(copy.reasons)
  return Object.freeze(copy)
}

/**
 * Produce the next proposal value with a new status.
 *
 * Returns a new frozen object rather than mutating, so the previous value stays
 * intact for the journal. Phase 1 deliberately does not police which transitions
 * are legal beyond the execution gate — the full lifecycle machine belongs with
 * the Approval layer (Fas 6).
 */
export function withStatus(
  proposal: TradeProposal,
  status: ProposalStatus,
  reasons: readonly Reason[] = proposal.reasons,
): TradeProposal {
  return tradeProposal({ ...proposal, status, reasons })
}

/** True when the proposal has passed its expiry at the given instant. */
export function isProposalExpired(proposal: TradeProposal, now: Timestamp): boolean {
  return isExpiredAt(proposal.expiresAt, now)
}

// ─── Approval ─────────────────────────────────────────────────────────────────

/** How an approval was produced (Datamodell §35). */
export const APPROVAL_TYPES = ['MANUAL', 'AUTOMATION_POLICY'] as const
export type ApprovalType = (typeof APPROVAL_TYPES)[number]

/**
 * A decision to permit execution of one specific proposal.
 *
 * `decision` is a Verdict, so an approval can be UNKNOWN — for instance when a
 * record is reconstructed from an incomplete source. UNKNOWN never grants.
 */
export interface Approval {
  readonly approvalId: ApprovalId
  readonly proposalId: ProposalId
  readonly accountId: AccountId
  readonly environment: TradingEnvironment
  readonly approvalType: ApprovalType
  readonly approvedBy: string
  readonly decision: Verdict
  readonly decidedAt: Timestamp
  readonly expiresAt: Timestamp
  readonly reasons: readonly Reason[]
}

/** Freeze an approval. Historical approvals are never edited (Datamodell §35). */
export function approval(value: Approval): Approval {
  const copy = { ...value }
  Object.freeze(copy.reasons)
  return Object.freeze(copy)
}

/** True when the approval has passed its expiry at the given instant. */
export function isApprovalExpired(value: Approval, now: Timestamp): boolean {
  return isExpiredAt(value.expiresAt, now)
}
