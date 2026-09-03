/**
 * Omnira Trading Core — canonical identities.
 *
 * Every central trading object carries a stable, opaque identifier. Identifiers
 * are branded at the type level so an InstrumentId can never be passed where an
 * AccountId is expected, even though both are strings at runtime.
 *
 * Canonical source: docs/trading-system/specifications/data-model/…v0.1.md §4.
 *
 * INVARIANTS:
 *  - Identifiers must NOT be derived from names or timestamps alone (Datamodell §4).
 *    `newId()` mints UUIDv4 values; callers must not synthesize IDs from labels.
 *  - Validation fails closed: unknown/empty/malformed input → null, never a cast.
 *  - Branding is compile-time only; it erases at runtime and costs nothing.
 *
 * Phase 1 scope: identity types and constructors. No persistence, no lookup.
 */

import { randomUUID } from 'node:crypto'

// ─── Branding ─────────────────────────────────────────────────────────────────

declare const idBrand: unique symbol

/** Compile-time nominal typing over a primitive. Erases at runtime. */
export type Branded<T, B extends string> = T & { readonly [idBrand]: B }

/** Maximum accepted identifier length. Guards against unbounded keys. */
export const MAX_ID_LENGTH = 128

/**
 * An identifier is acceptable when it is a non-empty, single-line, printable
 * string within the length bound. Deliberately permissive about *format* (so
 * broker-supplied order IDs pass) and strict about *shape*.
 */
export function isWellFormedId(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  if (raw.length === 0 || raw.length > MAX_ID_LENGTH) return false
  if (raw.trim() !== raw) return false
  // Reject control characters, including newlines and NUL.
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

// ─── Identity types ───────────────────────────────────────────────────────────

export type TradingProjectId = Branded<string, 'TradingProjectId'>
export type BrokerId = Branded<string, 'BrokerId'>
export type AccountId = Branded<string, 'AccountId'>
export type InstrumentId = Branded<string, 'InstrumentId'>

/**
 * A recorded contract selection.
 *
 * It sits with the identities rather than with the risk verdicts on purpose: a
 * contract selection is structural provenance in the authority chain and market
 * data, never a risk assessment (Beslut J). The decision it names answers WHICH
 * CONTRACT and WHY, and grants nothing.
 */
export type ContractSelectionDecisionId = Branded<string, 'ContractSelectionDecisionId'>

export type StrategyId = Branded<string, 'StrategyId'>
export type StrategyVersionId = Branded<string, 'StrategyVersionId'>

export type RiskProfileId = Branded<string, 'RiskProfileId'>
export type PropFirmProfileId = Branded<string, 'PropFirmProfileId'>

export type ThesisId = Branded<string, 'ThesisId'>
export type SetupId = Branded<string, 'SetupId'>
export type SignalId = Branded<string, 'SignalId'>
export type AiAnalysisId = Branded<string, 'AiAnalysisId'>
export type RiskDecisionId = Branded<string, 'RiskDecisionId'>
export type PropDecisionId = Branded<string, 'PropDecisionId'>
export type ProposalId = Branded<string, 'ProposalId'>
export type ApprovalId = Branded<string, 'ApprovalId'>
export type ExecutionId = Branded<string, 'ExecutionId'>

export type OrderId = Branded<string, 'OrderId'>
export type FillId = Branded<string, 'FillId'>
export type PositionId = Branded<string, 'PositionId'>
export type TradeId = Branded<string, 'TradeId'>

export type RunnerId = Branded<string, 'RunnerId'>
export type KillSwitchId = Branded<string, 'KillSwitchId'>
export type EventId = Branded<string, 'EventId'>
export type IncidentId = Branded<string, 'IncidentId'>
export type RunId = Branded<string, 'RunId'>
export type CorrelationId = Branded<string, 'CorrelationId'>

/** Every branded identity in the trading domain. */
export type TradingId =
  | TradingProjectId | BrokerId | AccountId | InstrumentId
  | StrategyId | StrategyVersionId
  | ContractSelectionDecisionId
  | RiskProfileId | PropFirmProfileId
  | ThesisId | SetupId | SignalId | AiAnalysisId
  | RiskDecisionId | PropDecisionId | ProposalId | ApprovalId | ExecutionId
  | OrderId | FillId | PositionId | TradeId
  | RunnerId | KillSwitchId | EventId | IncidentId | RunId | CorrelationId

// ─── Constructors ─────────────────────────────────────────────────────────────

/**
 * Parse an untrusted value into a branded identifier.
 * Returns null rather than throwing so callers stay on the fail-closed path.
 */
export function parseId<B extends string>(raw: unknown): Branded<string, B> | null {
  return isWellFormedId(raw) ? (raw as Branded<string, B>) : null
}

/**
 * Assert an identifier at a trust boundary you control (tests, literals).
 * Throws on malformed input — never use this on external data; use `parseId`.
 */
export function asId<B extends string>(raw: string): Branded<string, B> {
  const parsed = parseId<B>(raw)
  if (parsed === null) throw new Error(`Malformed trading identifier: ${JSON.stringify(raw)}`)
  return parsed
}

/** Mint a fresh opaque identifier. UUIDv4 — never name- or time-derived. */
export function newId<B extends string>(): Branded<string, B> {
  return randomUUID() as Branded<string, B>
}
