/**
 * Omnira Trading Core — INTERNAL authority issuance.
 *
 * ⚠ THIS MODULE IS NOT PART OF THE PUBLIC CONTRACT.
 * It is deliberately absent from `lib/trading/index.ts`. Code importing from
 * `@/lib/trading` cannot reach anything here.
 *
 * WHAT THIS SOLVES:
 * A RiskDecision is a data record, and data records are constructible by anyone.
 * If clearances could be derived from a decision through the public API, then
 * `plain object → ALLOW record → clearance → ExecutionIntent` would be a
 * supported path, and Risk/Prop veto would be advisory in practice.
 *
 * So authority is not derived from data. It is *issued* by a trusted producer.
 *
 * TWO LAYERS, NEITHER OF WHICH IS CRYPTOGRAPHY:
 *  1. Module boundary — issuance lives here and is not publicly exported. This
 *     is the primary control. It is a TypeScript/module convention, enforced by
 *     what the public barrel does and does not re-export, plus a boundary test.
 *  2. Runtime witness — every issued capability carries a module-private symbol
 *     that nothing outside this file can name. A structurally identical object
 *     produced by a type assertion elsewhere fails `isGenuineAuthority` and the
 *     gate refuses it. This catches casts, which the type system alone cannot.
 *
 * This is an authority boundary within one trusted codebase. It stops accident
 * and casual misuse, not a determined author of this repository.
 *
 * FUTURE ENGINES: the Risk Engine (Fas 5), Prop Engine (Fas 9) and Approval
 * layer (Fas 6) will import `grantAuthorityIssuer` from here and issue their own
 * clearances. No engine is implemented now, and none is faked.
 */

import { grantsPermission } from '../authority'
import type { PropDecision, RiskDecision } from '../contracts'
import type { TradingEnvironment } from '../environment'
import type {
  AccountId, ApprovalId, PropDecisionId, ProposalId, RiskDecisionId, SignalId,
} from '../ids'
import { isApprovalExpired, type Approval } from '../proposal'
import type { Timestamp } from '../time'

// ─── The witness ──────────────────────────────────────────────────────────────

/**
 * Module-private runtime marker. Never exported, never re-created.
 *
 * `Symbol()` produces a fresh identity on every call, so a caller writing
 * `Symbol('omnira.trading.authority.v1')` gets a different symbol that will not
 * match. Property access with a symbol key requires holding the symbol itself.
 */
const AUTHORITY_WITNESS = Symbol('omnira.trading.authority.v1')

declare const clearanceBrand: unique symbol

// ─── Capability types ─────────────────────────────────────────────────────────

/**
 * The right to issue authority capabilities.
 *
 * Held by trusted producers only. `component` is carried onto every capability
 * so the journal can answer "which engine issued this clearance".
 */
export interface AuthorityIssuer {
  readonly [clearanceBrand]: 'Issuer'
  readonly component: string
}

/** Proof that a specific RiskDecision returned ALLOW, issued by a trusted producer. */
export interface RiskClearance {
  readonly [clearanceBrand]: 'Risk'
  readonly riskDecisionId: RiskDecisionId
  readonly signalId: SignalId
  readonly accountId: AccountId
  readonly issuedBy: string
}

/** Proof that a specific PropDecision returned ALLOW. */
export interface PropClearance {
  readonly [clearanceBrand]: 'Prop'
  readonly propDecisionId: PropDecisionId
  readonly signalId: SignalId
  readonly accountId: AccountId
  readonly issuedBy: string
}

/** Proof that a specific Approval granted execution of a specific proposal. */
export interface ApprovalGrant {
  readonly [clearanceBrand]: 'Approval'
  readonly approvalId: ApprovalId
  readonly proposalId: ProposalId
  readonly accountId: AccountId
  readonly environment: TradingEnvironment
  /** Carried so the gate can bound intent lifetime by the approval's own. */
  readonly expiresAt: Timestamp
  readonly issuedBy: string
}

/** Any capability this module issues. */
export type AuthorityCapability = RiskClearance | PropClearance | ApprovalGrant

// ─── Issuance ─────────────────────────────────────────────────────────────────

/**
 * Obtain the right to issue authority capabilities.
 *
 * Reachable only from within `lib/trading/internal`. Future engines call this
 * once at their own boundary and keep the issuer private to themselves.
 */
export function grantAuthorityIssuer(component: string): AuthorityIssuer {
  if (typeof component !== 'string' || component.trim().length === 0) {
    throw new Error('An authority issuer must name its component')
  }
  return Object.freeze({ component }) as AuthorityIssuer
}

/** Attach the runtime witness and freeze. The only place the symbol is written. */
function witness<T extends object>(value: T): T {
  return Object.freeze(
    Object.defineProperty(value, AUTHORITY_WITNESS, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    }),
  )
}

/**
 * True when the value was issued by this module.
 *
 * A capability produced by a type assertion elsewhere lacks the symbol and is
 * rejected here, even though it satisfies the interface structurally.
 */
export function isGenuineAuthority(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return (value as Record<symbol, unknown>)[AUTHORITY_WITNESS] === true
}

/**
 * Issue a risk clearance. Returns null unless the decision is an explicit ALLOW.
 *
 * The decision is evidence, not authority: it is inspected, and a fresh
 * capability is minted. Nothing about the caller's object becomes the proof.
 */
export function issueRiskClearance(
  issuer: AuthorityIssuer,
  decision: RiskDecision,
): RiskClearance | null {
  if (!grantsPermission(decision.result)) return null
  return witness({
    riskDecisionId: decision.riskDecisionId,
    signalId: decision.signalId,
    accountId: decision.accountId,
    issuedBy: issuer.component,
  }) as RiskClearance
}

/** Issue a prop clearance. Returns null unless the decision is an explicit ALLOW. */
export function issuePropClearance(
  issuer: AuthorityIssuer,
  decision: PropDecision,
): PropClearance | null {
  if (!grantsPermission(decision.result)) return null
  return witness({
    propDecisionId: decision.propDecisionId,
    signalId: decision.signalId,
    accountId: decision.accountId,
    issuedBy: issuer.component,
  }) as PropClearance
}

/**
 * Issue an approval grant.
 * Returns null unless the approval is an explicit ALLOW and still unexpired.
 */
export function issueApprovalGrant(
  issuer: AuthorityIssuer,
  value: Approval,
  now: Timestamp,
): ApprovalGrant | null {
  if (!grantsPermission(value.decision)) return null
  if (isApprovalExpired(value, now)) return null
  return witness({
    approvalId: value.approvalId,
    proposalId: value.proposalId,
    accountId: value.accountId,
    environment: value.environment,
    expiresAt: value.expiresAt,
    issuedBy: issuer.component,
  }) as ApprovalGrant
}
