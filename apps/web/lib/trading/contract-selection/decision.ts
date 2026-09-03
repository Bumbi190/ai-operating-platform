/**
 * Omnira Trading — ContractSelectionDecision, and the pure materializer.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §9 (the record shape)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §10 (replay, read never recompute)
 *  - Contract Selection Reason Code Canonical v1.0 (Beslut J) — the one positive code
 *  - Contract Selection Decision Materialisation Canonical v1.0 (Beslut K) — this file
 *
 * WHAT MATERIALISATION IS
 * ───────────────────────
 * The step between SELECTION and JOURNAL, and nothing either side of it:
 *
 *     resolveContractAt(calendar, root, at)  →  ContractResolution   [selection]
 *     materialisation                        →  ContractSelectionDecision
 *     journal / store / replay               →  recorded history     [not here]
 *
 * This file CHOOSES NOTHING — the choice was already made when it is called —
 * and it RECORDS NOTHING. It turns an already-made canonical selection into an
 * immutable historical value that can be read back years later.
 *
 * SUCCESS IS THE ONLY INPUT
 * ─────────────────────────
 * The materializer takes `ResolvedContractResolution`, never `ContractResolution`.
 * Refusal happens BEFORE materialisation: without authoritative coverage the
 * resolver returns REFUSED and no decision is minted at all (Canonical v1.0
 * §7.2, Beslut K §3). So there is no refusal branch here, no failure decision,
 * no failure ReasonCode and no second refusal taxonomy — a REFUSED resolution
 * is not something this function declines, it is something it cannot be given.
 *
 * IT MINTS NO IDENTITY AND READS NO CLOCK
 * ───────────────────────────────────────
 * `decisionId` and `decidedAt` arrive from the caller. That is the established
 * convention in this tree — `approval()` freezes a finished value and mints
 * nothing — and it is what keeps the whole selection path deterministic under
 * §26 restart-replay.
 *
 * IT GRANTS NOTHING
 * ─────────────────
 * A decision answers WHICH CONTRACT, WHY, UNDER WHICH POLICY, FROM WHICH
 * CALENDAR. It is historical data. It is not a RiskClearance, a PropClearance,
 * an ApprovalGrant or an ExecutionIntent, and nothing here can produce one.
 */

import type { ContractResolution } from '../contract-calendar'
import { resolvedContract, type ResolvedContract } from '../contract-identity'
import type { ContractSelectionDecisionId } from '../ids'
import type { MarketInstrument } from '../market-instrument'
import { reason, type Reason } from '../reason-codes'
import type { Timestamp } from '../time'

// ─── Evidence ─────────────────────────────────────────────────────────────────

/**
 * Observed facts recorded BESIDE a decision — and in v1, none.
 *
 * Canonical v1.0 §9 names three examples: a provider front-month label, observed
 * volume, open interest. Beslut K §6 rules that EXAMPLES ARE NOT A DATA
 * CONTRACT, so this slice does not turn them into kinds, records or a
 * vocabulary. Until a future canonical text defines evidence kinds, provenance,
 * source references, observation identity, value representation, validation and
 * ownership, the honest type is the empty one.
 *
 * `never` makes that structural: `readonly ContractEvidence[]` can hold zero
 * members and nothing else. Non-empty evidence is not forbidden by a check
 * somebody could delete — it is unconstructable.
 *
 * GATE-08C-3B NONEMPTY-EVIDENCE VOCABULARY GAP stays OPEN / DEFERRED. A later
 * amendment may widen this prospectively; decisions carrying `[]` stay valid.
 */
export type ContractEvidence = never

// ─── Policy version ───────────────────────────────────────────────────────────

/**
 * The selection policy this materializer implements.
 *
 * Beslut K §7 locks the spelling. It names the policy owned by Market Data &
 * Contract Lifecycle Canonical v1.0 — the calendar and resolution semantics that
 * produce a successful `ContractResolution` — and it is NOT the calendar
 * version, a strategy version, a provider version, an application version or a
 * git SHA.
 *
 * The materializer owns it and the caller cannot supply it (§8). A caller-given
 * string would let a record claim policy X while policy Y actually ran, and a
 * record that is wrong in a way that looks right is worse than no record.
 *
 * There is no lookup here — no alias, no environment, no config. Changing the
 * selection policy is a canonical amendment, not a new string at a call site.
 */
export const CONTRACT_SELECTION_POLICY_VERSION = 'market-data-contract-lifecycle-v1.0' as const

// ─── The decision ─────────────────────────────────────────────────────────────

/**
 * One immutable record of which contract was selected, and why.
 *
 * The ten fields are Canonical v1.0 §9 verbatim, including `effectiveTo`'s
 * nullability. THAT NULL IS DELIBERATE AND IS NOT NARROWED HERE: it belongs to
 * the historical record shape, which must be able to describe every decision
 * that may ever be read back — not merely the ones this materializer emits.
 * This materializer never produces it (Beslut K §13); the general meaning of a
 * null `effectiveTo` is canonically RESERVED.
 */
export interface ContractSelectionDecision {
  readonly decisionId: ContractSelectionDecisionId
  readonly root: MarketInstrument
  readonly resolvedContract: ResolvedContract
  readonly effectiveFrom: Timestamp
  readonly effectiveTo: Timestamp | null
  readonly policyVersion: string
  readonly calendarVersion: string
  readonly evidence: readonly ContractEvidence[]
  readonly reasons: readonly Reason[]
  readonly decidedAt: Timestamp
}

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * A resolution that actually resolved.
 *
 * Narrowing at the TYPE level rather than at runtime is the whole point: it
 * makes a REFUSED resolution unrepresentable as input, so the impossible branch
 * cannot be written, forgotten, or tested for.
 */
export type ResolvedContractResolution = Extract<ContractResolution, { outcome: 'RESOLVED' }>

/**
 * Everything materialisation needs, and deliberately nothing more.
 *
 * `root`, `resolvedContract`, `effectiveFrom`, `effectiveTo` and
 * `calendarVersion` are absent because they are DERIVED from the resolution;
 * `policyVersion`, `evidence` and `reasons` are absent because they are LOCKED
 * by canon. Accepting any of them would create either a second source of the
 * same truth or caller-controlled canonical metadata (Beslut K §3).
 */
export interface MaterializeContractSelectionDecisionInput {
  readonly resolution: ResolvedContractResolution
  readonly decisionId: ContractSelectionDecisionId
  readonly decidedAt: Timestamp
}

// ─── Materialisation ──────────────────────────────────────────────────────────

/**
 * Turn a successful resolution into an immutable historical decision.
 *
 * Pure: same inputs, same decision, on every machine and after every restart.
 * No clock, no randomness, no environment, no provider, no calendar lookup and
 * no re-resolution — the answer is already in `resolution`, and asking again
 * would be a second implementation of a selection that has already happened.
 *
 * The contract is rebuilt through `resolvedContract()` rather than referenced.
 * That is a STRUCTURAL COPY, not a selection: it re-uses the one place in the
 * tree that knows how to build a frozen `ResolvedContract`, so a decision can
 * never share mutable structure with the caller's resolution, and freezing it
 * never reaches back into an object the caller still owns. Malformed structure
 * throws rather than producing a corrupt historical record.
 */
export function materializeContractSelectionDecision(
  input: MaterializeContractSelectionDecisionInput,
): ContractSelectionDecision {
  const { resolution, decisionId, decidedAt } = input

  const contract = resolvedContract(resolution.contract.root, resolution.contract.cycle)

  return Object.freeze({
    decisionId,
    // Read off the copy, not the caller's object: `root` and
    // `resolvedContract.root` then cannot describe different contracts.
    root: contract.root,
    resolvedContract: contract,
    effectiveFrom: resolution.effectiveFrom,
    // Finite, always — the resolver clamps to a coverage window that §7.2
    // requires to be bounded at both edges. Never null (Beslut K §13).
    effectiveTo: resolution.effectiveTo,
    policyVersion: CONTRACT_SELECTION_POLICY_VERSION,
    calendarVersion: resolution.calendarVersion,
    // Both arrays are built here and frozen here. Nothing the caller owns is
    // frozen as a side effect, and nothing the caller keeps can reach inside.
    evidence: Object.freeze([] as readonly ContractEvidence[]),
    reasons: Object.freeze([reason('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')]),
    decidedAt,
  })
}
