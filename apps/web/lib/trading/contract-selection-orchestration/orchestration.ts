/**
 * Omnira Trading — recorded-first contract selection orchestration.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §10, §24, §26
 *  - Recorded-First Contract Selection Orchestration Canonical v1.0 (Beslut M)
 *
 * WHAT THIS IS
 * ────────────
 * The composition of three packages that already exist, in one fixed order:
 *
 *     store.find(root, at)                       → recorded history wins
 *         ↓ NOT_FOUND, and only then
 *     resolveContractAt(pinned calendar, ...)    → which contract
 *         ↓ RESOLVED, and only then
 *     materializeContractSelectionDecision(...)  → the record
 *         ↓
 *     store.record(...)  →  store.find(...)      → the STORED decision
 *
 * Every invocation starts at the lookup. That is the whole mechanism: a caller
 * that supplies fallback data does not bypass recorded history, so two writers
 * racing cannot double-orchestrate and a crash between `record` and its
 * acknowledgement cannot lose a decision (Beslut M §7, §21).
 *
 * HISTORY OUTRANKS TODAY'S FALLBACK
 * ─────────────────────────────────
 * On FOUND the supplied fallback is not read at all — not its calendar, not its
 * calendarVersion, not its identity, not its instant. Comparing them would let
 * today's calendar reinterpret history, which Beslut L §9 forbids (Beslut M §5).
 *
 * IT IS CLOCK-FREE AND MINTS NOTHING
 * ──────────────────────────────────
 * There is no Date.now(), no randomUUID, no newId() and no wall clock here.
 * `decisionId` and `decidedAt` are caller-owned fallback metadata; this package
 * never derives either, and never assumes decidedAt equals `at` (§8, §13, §14).
 *
 * IT PERFORMS NO INTERVAL ARITHMETIC
 * ──────────────────────────────────
 * Containment belongs to `store.find`, the resolution interval to
 * `resolveContractAt`, interval validation to `store.record`. C3B.3 compares no
 * Timestamp and normalises none (§30).
 *
 * IT MINTS NO AUTHORITY
 * ─────────────────────
 * No RiskClearance, PropClearance, ApprovalGrant or ExecutionIntent, no journal
 * event, no database. Contract selection stays data (§33).
 */

import { resolveContractAt, type ContractCalendar, type ContractRefusal } from '../contract-calendar'
import {
  materializeContractSelectionDecision,
  type ContractSelectionDecision,
} from '../contract-selection'
import type {
  ContractSelectionDecisionStore,
  ContractSelectionStoreRefusal,
} from '../contract-selection-store'
import type { ContractSelectionDecisionId } from '../ids'
import type { MarketInstrument } from '../market-instrument'
import type { Timestamp } from '../time'

// ─── Caller-owned fallback metadata ───────────────────────────────────────────

/**
 * The three values a caller must supply to attempt a historical fallback.
 *
 * An INERT VALUE OBJECT, deliberately. Beslut M §27 rejects a callback, thunk,
 * factory or async supplier: a function could hide a clock, an id generator, a
 * provider call or a calendar lookup one call away from this package, and the
 * source guards would then prove C3B.3 pure while the impurity sat outside.
 * Laziness is achieved operationally instead — call without a fallback, and on
 * HISTORICAL_FALLBACK_REQUIRED prepare explicit values and call again.
 *
 * `calendar` IS the historical pin. It is immutable, it carries its own
 * `calendarVersion`, and there is no ambient or default calendar in this runtime
 * to fall back on by accident — so supplying the value IS the version choice,
 * and no separate pin, repository or version loader is needed in v1 (§16, §17).
 */
export interface HistoricalContractSelectionFallback {
  readonly calendar: ContractCalendar
  readonly decisionId: ContractSelectionDecisionId
  readonly decidedAt: Timestamp
}

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * Everything orchestration needs, and deliberately nothing more.
 *
 * `fallback` is optional because a plain recorded-history lookup must not force
 * a caller to invent an identity and an instant it will never use (§9).
 *
 * No clock and no provider are accepted, and no decision content can be
 * overridden: `root`, `resolvedContract`, `effectiveFrom`, `effectiveTo`,
 * `policyVersion`, `calendarVersion`, `evidence` and `reasons` stay resolver-
 * and materializer-owned (§31).
 */
export interface RecordedFirstContractSelectionInput {
  readonly store: ContractSelectionDecisionStore
  readonly root: MarketInstrument
  readonly at: Timestamp
  readonly fallback?: HistoricalContractSelectionFallback
}

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * Six outcomes, each keeping its own vocabulary's provenance.
 *
 * Beslut M §28 requires that a resolver refusal, a store record refusal, a
 * lookup invariant violation and a post-record invariant violation stay
 * distinguishable — independently owned refusal vocabularies are NOT merged into
 * one ambiguous string namespace. So `refusal` is typed by its owner in each
 * case rather than flattened to `string`.
 *
 * Both success paths return `DECISION`. A caller does not need to know whether
 * the record already existed or was just written, so there is no FOUND_EXISTING,
 * NEWLY_RECORDED, CREATED or REUSED (§29).
 *
 * A rejected promise stays a rejected promise: no NETWORK_ERROR, STORE_ERROR or
 * UNKNOWN_ERROR member exists, because §34 leaves technical infrastructure
 * failure as exception behaviour rather than a domain outcome.
 */
export type RecordedFirstContractSelectionResult =
  | {
      readonly outcome: 'DECISION'
      readonly decision: ContractSelectionDecision
    }
  | {
      readonly outcome: 'HISTORICAL_FALLBACK_REQUIRED'
    }
  | {
      readonly outcome: 'RESOLUTION_REFUSED'
      readonly refusal: ContractRefusal
    }
  | {
      readonly outcome: 'STORE_RECORD_REFUSED'
      readonly refusal: ContractSelectionStoreRefusal
      readonly detail: string
    }
  | {
      readonly outcome: 'STORE_LOOKUP_INVARIANT_VIOLATION'
      readonly detail: string
    }
  | {
      readonly outcome: 'POST_RECORD_INVARIANT_VIOLATION'
      readonly observed: 'NOT_FOUND' | 'INVARIANT_VIOLATION'
      readonly detail: string
    }

/**
 * Freeze the envelope, and only the envelope.
 *
 * `Object.freeze` is shallow, so a `decision` read out of the store passes
 * through untouched — not copied, not re-frozen, not normalised. The stored
 * object IS the answer (§25).
 */
const frozen = (result: RecordedFirstContractSelectionResult): RecordedFirstContractSelectionResult =>
  Object.freeze(result)

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Read the recorded decision first; only otherwise resolve against a pinned
 * calendar, record, and read the stored result back.
 *
 * One function, no class, no factory, no singleton and no module state — two
 * historical contexts using two store instances must be able to hold different
 * decisions for the same root and instant when pinned to different calendars,
 * and shared state here would silently collapse them (Beslut L §4).
 */
export async function orchestrateRecordedFirstContractSelection(
  input: RecordedFirstContractSelectionInput,
): Promise<RecordedFirstContractSelectionResult> {
  const { store, root, at, fallback } = input

  /*
   * 1. Recorded history, before anything else. Nothing above this line resolves,
   *    reads a calendar, mints an identity or consults the fallback (§3).
   */
  const initial = await store.find(root, at)

  // 2. FOUND ends the call. The stored decision is returned exactly as stored.
  if (initial.outcome === 'FOUND') {
    return frozen({ outcome: 'DECISION', decision: initial.decision })
  }

  // 3. A broken lookup fails closed without consulting the fallback (§24).
  if (initial.outcome === 'INVARIANT_VIOLATION') {
    return frozen({ outcome: 'STORE_LOOKUP_INVARIANT_VIOLATION', detail: initial.detail })
  }

  /*
   * 4. NOT_FOUND. 5. Without explicit fallback values there is nothing lawful to
   *    do: no default calendar, no minted identity, no clock, no guess (§6).
   */
  if (fallback === undefined) {
    return frozen({ outcome: 'HISTORICAL_FALLBACK_REQUIRED' })
  }

  // 6. The pinned calendar is the only calendar allowed on this path (§17).
  const resolution = resolveContractAt(fallback.calendar, root, at)

  // 7. The resolver's own refusal propagates unpromoted. Nothing is recorded (§22).
  if (resolution.outcome === 'REFUSED') {
    return frozen({ outcome: 'RESOLUTION_REFUSED', refusal: resolution.refusal })
  }

  /*
   * 8. Only a RESOLVED resolution can reach the materializer, which owns
   *    policyVersion, reasons, evidence and the effective interval. This package
   *    hand-builds no decision and duplicates none of those fields (§23, §31).
   */
  const materialized = materializeContractSelectionDecision({
    resolution,
    decisionId: fallback.decisionId,
    decidedAt: fallback.decidedAt,
  })

  // 9. Exactly one record attempt.
  const recorded = await store.record(materialized)

  /*
   * 10. A refusal fails closed: no retry under another identity, no re-resolve,
   *     no overwrite, no treating an overlap as FOUND, and no post-record read
   *     because nothing was recorded (§23).
   */
  if (recorded.outcome === 'REFUSED') {
    return frozen({
      outcome: 'STORE_RECORD_REFUSED',
      refusal: recorded.refusal,
      detail: recorded.detail,
    })
  }

  /*
   * 11. RECORDED. 12. Read it back. The materialized object is NOT the
   *     authoritative answer — Beslut L makes the STORED decision the replay
   *     truth, which keeps both success paths identical (§25).
   */
  const reread = await store.find(root, at)

  // 13. The stored decision, from the store.
  if (reread.outcome === 'FOUND') {
    return frozen({ outcome: 'DECISION', decision: reread.decision })
  }

  /*
   * 14-15. Impossible after RECORDED, so fail closed. Never return the
   *     materialized value, never record again, never resolve again, never
   *     repair store state and never pick a match (§26).
   */
  if (reread.outcome === 'NOT_FOUND') {
    return frozen({
      outcome: 'POST_RECORD_INVARIANT_VIOLATION',
      observed: 'NOT_FOUND',
      detail: `store.find reported NOT_FOUND for root ${root} at ${at} immediately after record reported RECORDED`,
    })
  }

  return frozen({
    outcome: 'POST_RECORD_INVARIANT_VIOLATION',
    observed: 'INVARIANT_VIOLATION',
    detail: reread.detail,
  })
}
