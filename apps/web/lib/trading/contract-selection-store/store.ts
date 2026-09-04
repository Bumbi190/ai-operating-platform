/**
 * Omnira Trading — the ContractSelectionDecision store.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §10 (read it, never recompute)
 *  - Contract Selection Decision Recording & Replay Canonical v1.0 (Beslut L) — this file
 *
 * WHAT THIS IS
 * ────────────
 * The recording boundary between materialisation and replay, and nothing on
 * either side of it:
 *
 *     materializeContractSelectionDecision(...)  →  decision      [not here]
 *     record(decision) / find(root, at)          →  THIS FILE
 *     recorded-first orchestration               →  C3B.3         [not here]
 *
 * IT NEVER RESOLVES
 * ─────────────────
 * A lookup for an already-recorded decision performs no `resolveContractAt`, no
 * calendar read, no pin lookup, no provider call and no contract derivation
 * (Beslut L §9). That is the entire point: §10 says READ the recorded decision,
 * and a store that had to re-derive anything to find it would be recomputing in
 * order to avoid recomputing.
 *
 * THE LOOKUP IS `root` + `at`, NOTHING MORE
 * ─────────────────────────────────────────
 * Not `decisionId` — that is caller-minted and opaque, so a replay cannot
 * reconstruct it. Not `calendarVersion` or `policyVersion` — those are facts the
 * stored record REVEALS, never prerequisites for finding it (Beslut L §7, §10).
 *
 * ONE INSTANCE = ONE RECORDING CONTEXT
 * ────────────────────────────────────
 * The context is the store instance, not a field on the decision (Beslut L §4).
 * Two instances are independent: the same `root` + instant may legitimately
 * resolve differently in two historical runs pinned to different calendar
 * versions, and nothing here may collapse that into one global answer.
 *
 * IT MINTS NOTHING AND GRANTS NOTHING
 * ───────────────────────────────────
 * No clock, no randomness, no identity. Recording a selection creates no
 * RiskClearance, PropClearance, ApprovalGrant or ExecutionIntent, and emits no
 * journal event — `EVENT_TYPES` is deliberately untouched (Beslut L §3).
 */

import type { ContractSelectionDecision } from '../contract-selection'
import type { MarketInstrument } from '../market-instrument'
import { toEpochMs, type Timestamp } from '../time'

// ─── Refusals ─────────────────────────────────────────────────────────────────

/**
 * Why the store declined to record.
 *
 * LOCAL STORE VOCABULARY. These are caller-contract and storage-boundary
 * problems: they never reach a journal, never appear in a decision, and are not
 * canonical `ReasonCode`s — which is why the reason registry is not imported
 * anywhere in this package (Beslut L §15, §16).
 */
export const CONTRACT_SELECTION_STORE_REFUSALS = [
  'DECISION_ID_DISAGREEMENT',
  'OVERLAPPING_SELECTION_INTERVAL',
  'OPEN_ENDED_DECISION_UNSUPPORTED',
  'INVALID_SELECTION_INTERVAL',
] as const
export type ContractSelectionStoreRefusal = (typeof CONTRACT_SELECTION_STORE_REFUSALS)[number]

// ─── Results ──────────────────────────────────────────────────────────────────

/**
 * The outcome of recording.
 *
 * `RECORDED` is returned for a first insert AND for an identical re-record.
 * That is deliberate: idempotency means the caller does not have to know
 * whether the physical write was new, so no ALREADY_RECORDED / DUPLICATE /
 * created / updated state is exposed (Beslut L §14).
 */
export type RecordContractSelectionDecisionResult =
  | { readonly outcome: 'RECORDED' }
  | {
      readonly outcome: 'REFUSED'
      readonly refusal: ContractSelectionStoreRefusal
      /** Operator and diagnostic text. Never decision input. */
      readonly detail: string
    }

/**
 * The outcome of a contextual lookup.
 *
 * `INVARIANT_VIOLATION` is not a fifth refusal. It is the fail-closed read state
 * Beslut L §19 requires if stored state ever holds more than one match: the
 * store must not return an arbitrary first match, and must not sort overlapping
 * matches and pick one, because choosing silently would invent a priority order
 * no canonical text owns.
 */
export type FindContractSelectionDecisionResult =
  | { readonly outcome: 'FOUND'; readonly decision: ContractSelectionDecision }
  | { readonly outcome: 'NOT_FOUND' }
  | { readonly outcome: 'INVARIANT_VIOLATION'; readonly detail: string }

// ─── The port ─────────────────────────────────────────────────────────────────

/**
 * One recording/replay context.
 *
 * Async because every existing data boundary in this tree is async and a later
 * persistent adapter must fit behind this same interface unchanged. That is an
 * implementation boundary, not decision canon.
 *
 * Two operations, on purpose. `getByDecisionId` is canonically permitted as a
 * convenience but is not sufficient for §10 replay — a caller cannot reconstruct
 * an opaque id — so v1 does not carry it (Beslut L §20).
 */
export interface ContractSelectionDecisionStore {
  record(decision: ContractSelectionDecision): Promise<RecordContractSelectionDecisionResult>
  find(root: MarketInstrument, at: Timestamp): Promise<FindContractSelectionDecisionResult>
}

// ─── Detached storage copy ────────────────────────────────────────────────────

type StoredContract = ContractSelectionDecision['resolvedContract']
type StoredReasons = ContractSelectionDecision['reasons']
type StoredReason = StoredReasons[number]

/**
 * A frozen structural copy, detached from everything the caller still holds.
 *
 * The store does not assume the caller used the materializer — a hand-built
 * mutable decision must not be able to change after it has been recorded. Every
 * level is rebuilt: the decision, the contract, the cycle, both arrays and each
 * Reason. Nothing the caller owns is frozen as a side effect.
 *
 * Field VALUES are preserved exactly. `Timestamp` text is never normalised, and
 * an absent `detail` stays absent rather than becoming an explicit `undefined`.
 */
function detachedCopy(decision: ContractSelectionDecision): ContractSelectionDecision {
  const contract: StoredContract = Object.freeze({
    root: decision.resolvedContract.root,
    cycle: Object.freeze({
      year: decision.resolvedContract.cycle.year,
      quarterMonth: decision.resolvedContract.cycle.quarterMonth,
    }),
  })

  const reasons: StoredReasons = Object.freeze(
    decision.reasons.map((r): StoredReason =>
      Object.freeze(r.detail === undefined ? { code: r.code } : { code: r.code, detail: r.detail }),
    ),
  )

  return Object.freeze({
    decisionId: decision.decisionId,
    root: decision.root,
    resolvedContract: contract,
    effectiveFrom: decision.effectiveFrom,
    effectiveTo: decision.effectiveTo,
    policyVersion: decision.policyVersion,
    calendarVersion: decision.calendarVersion,
    // Rebuilt here so the stored array is never the caller's. Canonically empty
    // in v1 — `ContractEvidence` is `never`, so it can hold nothing else.
    evidence: Object.freeze([...decision.evidence]),
    reasons,
    decidedAt: decision.decidedAt,
  })
}

// ─── Equality ─────────────────────────────────────────────────────────────────

/**
 * Field-for-field equality across the whole canonical record.
 *
 * Explicit comparison, not serialisation: Beslut L §14 rules out JSON text and
 * hashes as the identity rule, and this follows `sameCandle`'s precedent of
 * comparing exact stored text.
 *
 * `Timestamp` equality here is EXACT TEXT, not instant equality. `…00:00:00Z`
 * and `…00:00:00.000Z` denote one instant for interval arithmetic, but they are
 * different recorded values — treating them as identical would silently accept
 * a record that disagrees with the stored one about what was written down.
 */
function sameDecision(a: ContractSelectionDecision, b: ContractSelectionDecision): boolean {
  if (a.decisionId !== b.decisionId) return false
  if (a.root !== b.root) return false
  if (a.resolvedContract.root !== b.resolvedContract.root) return false
  if (a.resolvedContract.cycle.year !== b.resolvedContract.cycle.year) return false
  if (a.resolvedContract.cycle.quarterMonth !== b.resolvedContract.cycle.quarterMonth) return false
  if (a.effectiveFrom !== b.effectiveFrom) return false
  if (a.effectiveTo !== b.effectiveTo) return false
  if (a.policyVersion !== b.policyVersion) return false
  if (a.calendarVersion !== b.calendarVersion) return false
  if (a.decidedAt !== b.decidedAt) return false
  if (a.evidence.length !== b.evidence.length) return false
  if (a.reasons.length !== b.reasons.length) return false
  for (let i = 0; i < a.reasons.length; i++) {
    if (a.reasons[i].code !== b.reasons[i].code) return false
    if (a.reasons[i].detail !== b.reasons[i].detail) return false
  }
  return true
}

// ─── In-memory implementation ─────────────────────────────────────────────────

const refuse = (
  refusal: ContractSelectionStoreRefusal,
  detail: string,
): RecordContractSelectionDecisionResult => Object.freeze({ outcome: 'REFUSED' as const, refusal, detail })

/**
 * One independent recording context, held in memory.
 *
 * Storage is per-invocation: there is no module-level map, no singleton and no
 * static mutable state, so two stores cannot see each other's records. That is
 * what makes two historical runs able to hold different decisions for the same
 * root and instant (Beslut L §4, §11).
 *
 * Deterministic by construction — nothing here reads a clock, draws randomness
 * or mints an identity.
 */
export function createInMemoryContractSelectionDecisionStore(): ContractSelectionDecisionStore {
  /** Keyed by decisionId: one id may name exactly one record. */
  const byDecisionId = new Map<string, ContractSelectionDecision>()

  return Object.freeze({
    async record(decision: ContractSelectionDecision): Promise<RecordContractSelectionDecisionResult> {
      // 1. Finite intervals only. `null` is given no invented meaning here —
      //    not infinity, not open-ended, not "until the next decision". Its
      //    general semantics stay canonically RESERVED (Beslut L §17).
      if (decision.effectiveTo === null) {
        return refuse(
          'OPEN_ENDED_DECISION_UNSUPPORTED',
          `Decision ${decision.decisionId} has a null effectiveTo; C3B.2 v1 records finite intervals only.`,
        )
      }

      // 2. A finite interval must actually be an interval. Compared as instants,
      //    never as text — optional milliseconds make string order wrong.
      const from = toEpochMs(decision.effectiveFrom)
      const to = toEpochMs(decision.effectiveTo)
      if (!(from < to)) {
        return refuse(
          'INVALID_SELECTION_INTERVAL',
          `Decision ${decision.decisionId} has effectiveFrom ${decision.effectiveFrom} not before effectiveTo ${decision.effectiveTo}.`,
        )
      }

      // 3. Same id: identical is idempotent, anything else is a disagreement.
      //    Never overwrite, never last-write-wins.
      const existing = byDecisionId.get(decision.decisionId)
      if (existing !== undefined) {
        if (sameDecision(existing, decision)) return Object.freeze({ outcome: 'RECORDED' as const })
        return refuse(
          'DECISION_ID_DISAGREEMENT',
          `Decision ${decision.decisionId} is already recorded with different contents.`,
        )
      }

      // 4. Same root, overlapping interval. Half-open, so adjacency is not
      //    overlap: an existing `effectiveTo` equal to the new `effectiveFrom`
      //    is a clean handover, not a conflict. Other roots are irrelevant.
      for (const stored of byDecisionId.values()) {
        if (stored.root !== decision.root) continue
        // A stored record is always finite; step 1 refused anything else.
        const storedFrom = toEpochMs(stored.effectiveFrom)
        const storedTo = toEpochMs(stored.effectiveTo as Timestamp)
        if (from < storedTo && storedFrom < to) {
          return refuse(
            'OVERLAPPING_SELECTION_INTERVAL',
            `Decision ${decision.decisionId} overlaps recorded ${stored.decisionId} for root ${decision.root}.`,
          )
        }
      }

      // 5. Store a detached frozen copy.
      byDecisionId.set(decision.decisionId, detachedCopy(decision))
      return Object.freeze({ outcome: 'RECORDED' as const })
    },

    async find(root: MarketInstrument, at: Timestamp): Promise<FindContractSelectionDecisionResult> {
      const atMs = toEpochMs(at)
      const matches: ContractSelectionDecision[] = []

      for (const stored of byDecisionId.values()) {
        if (stored.root !== root) continue
        const from = toEpochMs(stored.effectiveFrom)
        const to = toEpochMs(stored.effectiveTo as Timestamp)
        if (from <= atMs && atMs < to) matches.push(stored)
      }

      if (matches.length === 0) return Object.freeze({ outcome: 'NOT_FOUND' as const })
      if (matches.length === 1) {
        return Object.freeze({ outcome: 'FOUND' as const, decision: matches[0] })
      }
      /*
       * Fail closed. `record` prevents this by refusing overlap, so reaching it
       * means stored state is already wrong — and the honest answer is to say
       * so. Returning matches[0], or ordering them by anything, would invent a
       * precedence between recorded decisions that no canonical text defines.
       */
      return Object.freeze({
        outcome: 'INVARIANT_VIOLATION' as const,
        detail: `${matches.length} recorded decisions match root ${root} at ${at}; exactly one is required.`,
      })
    },
  })
}
