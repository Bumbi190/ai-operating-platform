/**
 * lib/atlas/survival/derive.ts — the survival derivation (PURE).
 *
 * No I/O, no clock, no database, no model — the instant arrives as a parameter.
 * Same shape as `authorization/derive.ts`, `decision-ledger/derive.ts`,
 * `delegation/derive.ts` and `mission/derive.ts`, for the same reason: a state
 * that decides how much a workflow may do must be reproducible from recorded
 * facts, and reproducibility is impossible if the function can reach for a
 * clock or a socket.
 *
 * ── THE DIRECTION OF EVERY RULE HERE ────────────────────────────────────────
 * New adverse or MISSING information can only ever move the state TOWARD
 * HIBERNATE; no rule here can raise the autonomy ceiling. Both levers do this:
 *
 *   • `mostRestrictive()` takes the MAXIMUM state index, so adding a source — a
 *     failed read, a lost funding reading, an observation that does not cover
 *     the whole platform — can only pull the result down.
 *   • Every cap states how restrictive the result must be AT LEAST, never at
 *     most. The strongest currently floors at HIBERNATE (a lost funding reading,
 *     and a declaration at or below zero); the weakest floors at CONSERVE
 *     (funding never declared, reads incomplete, a partial observation scope
 *     withholding runway).
 *
 * The individual values are POLICY and live beside the rules that apply them, so
 * they can be reviewed and changed on their own. The DIRECTION is the invariant,
 * and it does not depend on which value happens to be strongest today — which is
 * why this paragraph names no single number.
 *
 * So an unreadable database cannot make the platform look healthier than it is,
 * and an unreadable database also cannot stop anything — this module decides a
 * CEILING, not a gate, and a failed read must not become a way to refuse work.
 * (Contrast `lib/cost/budget-gate.ts`, where `unavailable` must fail closed,
 * because there the question is "may we spend".)
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * • Does not invent a funding figure. No declared funding means runway is
 *   UNKNOWN and the state is capped at CONSERVE — never guessed from MRR.
 * • Does not read the clock. `{ at }` is supplied, exactly as
 *   `deriveDecisionState(records, { at })` supplies it.
 * • Does not apply hysteresis. Hysteresis needs the PREVIOUS state, and Phase 1
 *   persists no history; a paired enter/leave threshold would have to guess
 *   where it came from. Transition history arrives with the Phase 2 ledger,
 *   which is also what makes a change auditable (§18.251).
 * • Does not pause, refuse, spend or authorize anything.
 */

import {
  SURVIVAL_STATES,
  type BudgetScopeReading,
  type SurvivalGap,
  type SurvivalInput,
  type SurvivalReason,
  type SurvivalSnapshot,
  type SurvivalState,
} from './types'

// ═══ THRESHOLDS — PROVISIONAL. NOT CANONICAL POLICY. ════════════════════════
//
// These six numbers are NOT owner-approved canonical policy. They were chosen by
// the implementer while building Phase 1 so the derivation could be exercised at
// all. They have never been reviewed against a real funding position, and no
// autonomy decision has ever been taken on them.
//
// The `PROVISIONAL_` prefix is deliberate and load-bearing: an unqualified
// `CRITICAL_HEADROOM_FRACTION` reads like a settled constant, and a constant
// that merely LOOKS settled is how an implementer's guess becomes policy by
// nobody's decision. Renaming these is the review gate — a phase that wants to
// act on them must first have them approved, and the rename is that act made
// visible in the diff.
//
// Phase 1 changes no behaviour, so these numbers currently decide nothing that
// matters: they are observations. They gate nothing until a phase applies the
// ceiling, and that phase must not ship on unreviewed thresholds.
//
// The shape of the numbers is a deliberate departure from absolute currency
// thresholds ("> $5 is healthy"), which do not scale: that constant means the
// same thing to a platform burning 0.01 SEK/day and one burning 5 SEK/hour.
// Fractions of the binding limit at least move with the limit.

/** Below this fraction of the binding limit, the state is CRITICAL. PROVISIONAL. */
export const PROVISIONAL_CRITICAL_HEADROOM_FRACTION = 0.1
/** Below this fraction of the binding limit, the state is CONSERVE. PROVISIONAL. */
export const PROVISIONAL_CONSERVE_HEADROOM_FRACTION = 0.35
/** EXPAND additionally requires at least this fraction still remaining. PROVISIONAL. */
export const PROVISIONAL_EXPAND_MIN_HEADROOM_FRACTION = 0.5

/** Days of runway below which the state is CRITICAL. PROVISIONAL. */
export const PROVISIONAL_RUNWAY_CRITICAL_DAYS = 3
/** Days of runway below which the state is CONSERVE. PROVISIONAL. */
export const PROVISIONAL_RUNWAY_CONSERVE_DAYS = 14
/** EXPAND requires at least this much runway. PROVISIONAL. */
export const PROVISIONAL_EXPAND_MIN_RUNWAY_DAYS = 60

/**
 * The provisional status as one machine-readable value, so a surface can say it
 * without restating the prose above and drifting from it.
 *
 * `'provisional'` here means: an implementer's choice, not an owner decision.
 * When the thresholds are approved this becomes `'canonical'` — and that change
 * should be a reviewed edit to this constant, not a silent rename.
 */
export const SURVIVAL_THRESHOLD_STATUS = 'provisional' as const
export type SurvivalThresholdStatus = typeof SURVIVAL_THRESHOLD_STATUS

/**
 * One line for an operator, naming exactly what is — and is not — true of the
 * thresholds.
 *
 * The earlier wording said they were "applied to nothing". That was wrong and
 * this is the correction: the thresholds ARE applied, to the Phase 1 OBSERVATION
 * this module reports. What they are not wired to is anything that acts.
 */
export const PROVISIONAL_POLICY_NOTICE =
  'Survival thresholds are provisional and not owner-approved canonical policy. '
  + 'They ARE applied to the Phase 1 survival observation reported here. They are '
  + 'NOT wired to execution, spending, authorization or runtime enforcement.'

// ─── Funding floors — OWNER DECISIONS, not provisional ──────────────────────
//
// Deliberately NOT prefixed `PROVISIONAL_` and deliberately NOT part of the six
// numbers above. The owner specified these two floors directly, so they carry
// owner authority today; the six thresholds do not. Keeping the distinction
// visible in the names is the point: a reader can tell policy from a guess at a
// glance, and a future reviewer can see which of these needs approval.

/**
 * The floor when the owner has never supplied an operating-capital figure.
 *
 * A stable, deliberate absence — no reading was lost, so this takes the owner's
 * conservative default rather than a telemetry-failure floor.
 */
export const FUNDING_UNDECLARED_FLOOR: SurvivalState = 'CONSERVE'

/**
 * The floor when KNOWN funding is at or below zero.
 *
 * HIBERNATE: there is nothing to spend and nothing to project a runway from, so
 * the only honest reading is "observe only" (§18.41, §18.42).
 */
export const FUNDING_DEPLETED_FLOOR: SurvivalState = 'HIBERNATE'

/**
 * The floor when a funding source is expected but could not be read.
 *
 * ── WHY THIS IS HIBERNATE AND NOT CRITICAL ──────────────────────────────────
 * It was CRITICAL, and the mechanical sweep proved that wrong. With a CRITICAL
 * floor:
 *
 *     KNOWN funding = 0   → HIBERNATE (Autonomy License L0)
 *     reading lost        → CRITICAL  (Autonomy License L1)
 *
 * Losing the reading RAISED the ceiling, which is the one direction this
 * subsystem must never move. Monotonicity under KNOWN → UNAVAILABLE cannot hold
 * for a fixed floor below HIBERNATE, because HIBERNATE is a reachable KNOWN
 * state: any lower floor is a relaxation whenever the concealed truth was worse.
 *
 * Two ways out, and this is the one that takes the owner's requirement at full
 * strength: either KNOWN-zero stops being HIBERNATE (which would give up "zero
 * known funding may produce HIBERNATE"), or the unavailable floor rises to meet
 * it. A telemetry failure is therefore treated as the WORST case, not the
 * middle one — which is also this platform's established convention for
 * unreadable authority: `budget-gate` reports `unavailable` as `wouldAllow:
 * false`, and `resolveExecutionStop` REFUSES autonomous work whose stop state it
 * cannot establish. Failing to establish the truth is treated as the
 * restrictive case everywhere else; it is treated the same way here.
 *
 * The constraint this value must satisfy is `>= FUNDING_DEPLETED_FLOOR`, and a
 * test asserts it directly, so the REASON for the value survives any future
 * edit rather than only the value.
 */
export const FUNDING_UNAVAILABLE_FLOOR: SurvivalState = 'HIBERNATE'

/** State order, least to most restrictive. Index comparison is the `min`. */
const STATE_INDEX: Record<SurvivalState, number> = Object.freeze(
  SURVIVAL_STATES.reduce(
    (acc, state, index) => Object.assign(acc, { [state]: index }),
    {} as Record<SurvivalState, number>,
  ),
)

/**
 * The more restrictive of two states. Never returns the more permissive one.
 *
 * This is ALSO how a cap is applied, and deliberately there is only one
 * function for both. "Cap the state at CONSERVE" means "the result may not be
 * more permissive than CONSERVE", which — because a higher index is more
 * restrictive — is exactly `max` over the index. A named `capState` doing the
 * same thing would be a second expression of one rule, which is how two answers
 * to one question eventually disagree.
 */
export function mostRestrictive(a: SurvivalState, b: SurvivalState): SurvivalState {
  return STATE_INDEX[a] >= STATE_INDEX[b] ? a : b
}

/** Deterministic output order: most significant reason first. */
const REASON_ORDER: readonly SurvivalReason[] = [
  'headroom_exhausted',
  'funding_depleted',
  'headroom_critical',
  'funding_unavailable',
  'headroom_conserve',
  'no_budget_configured',
  'runway_short',
  'funding_undeclared',
  'reads_unavailable',
  'headroom_healthy',
]

/** Deterministic output order for gaps. */
const GAP_ORDER: readonly SurvivalGap[] = [
  'funding_undeclared',
  'funding_unavailable',
  'runway_unknown',
  // Immediately after runway_unknown: both are about why no runway figure was
  // produced, and a reader comparing them should see them adjacent.
  'runway_scope_incomplete',
  'reads_incomplete',
  'infrastructure_cost_untracked',
]

export interface DeriveOptions {
  /**
   * The observation instant. Supplied, never read — the same contract as every
   * other `derive*` in this codebase, so a snapshot can be replayed against a
   * recorded instant.
   */
  at: string
}

/**
 * The scope whose remaining headroom is smallest — "the tightest one decides".
 *
 * Not a new rule: `budget_reserve` returns `binding_scope` for the same reason,
 * and `/api/system/execution-safety` already reports that ANY exhausted scope
 * exhausts the project. This picks the scope that would refuse first.
 */
function bindingScope(scopes: readonly BudgetScopeReading[]): BudgetScopeReading | null {
  let tightest: BudgetScopeReading | null = null
  for (const scope of scopes) {
    if (tightest === null || scope.remainingSek < tightest.remainingSek) tightest = scope
  }
  return tightest
}

export function deriveSurvivalState(
  input: SurvivalInput,
  options: DeriveOptions,
): SurvivalSnapshot {
  const applicable = new Set<SurvivalReason>()
  const gaps = new Set<SurvivalGap>()

  // ── Headroom ──────────────────────────────────────────────────────────────
  const binding = bindingScope(input.scopes)
  let state: SurvivalState

  if (binding === null) {
    // Two different facts, deliberately not merged: a read that FAILED is not
    // "no budget configured". Conflating them would report a configuration
    // problem that does not exist, and hide one that does.
    applicable.add(input.reads.budgets ? 'no_budget_configured' : 'reads_unavailable')
    state = 'CONSERVE'
  } else if (binding.limitSek <= 0 || binding.remainingSek <= 0) {
    // A zero limit and an exhausted limit are the same operational fact: no
    // amount may be reserved. §18.41 lists "Budget is exhausted" as a stopping
    // condition, so this is the canonical HIBERNATE trigger.
    applicable.add('headroom_exhausted')
    state = 'HIBERNATE'
  } else {
    const fraction = binding.remainingSek / binding.limitSek
    if (fraction < PROVISIONAL_CRITICAL_HEADROOM_FRACTION) {
      applicable.add('headroom_critical')
      state = 'CRITICAL'
    } else if (fraction < PROVISIONAL_CONSERVE_HEADROOM_FRACTION) {
      applicable.add('headroom_conserve')
      state = 'CONSERVE'
    } else {
      applicable.add('headroom_healthy')
      state = 'NORMAL'
    }
  }

  // ── Funding ───────────────────────────────────────────────────────────────
  // Null means NOT ESTABLISHED. It never means zero and it is never inferred
  // from revenue. The three cases below are NOT interchangeable — see
  // `FundingReading`. In particular, UNAVAILABLE floors HIGHER than UNDECLARED,
  // because losing a reading must never buy operational freedom.
  let runwayDays: number | null = null
  let declaredFundingSek: number | null = null

  switch (input.funding.kind) {
    case 'UNDECLARED': {
      // The owner has never supplied a figure. A stable, deliberate absence —
      // not a failure — so it takes the owner's CONSERVE floor.
      applicable.add('funding_undeclared')
      gaps.add('funding_undeclared')
      gaps.add('runway_unknown')
      state = mostRestrictive(state, FUNDING_UNDECLARED_FLOOR)
      break
    }

    case 'UNAVAILABLE': {
      // A source was expected and the read failed. This is a TELEMETRY FAILURE,
      // and it floors at HIBERNATE — the most restrictive state, so no concealed
      // truth can exceed it. It floored at CRITICAL until a mechanical sweep
      // showed that insufficient: KNOWN funding at or below zero already reaches
      // HIBERNATE (see below), so a CRITICAL floor RELAXED a known-zero position
      // to CRITICAL merely by failing to read it — a ceiling that rises when
      // information is lost. That is the one direction this subsystem must never
      // move, and no floor below HIBERNATE can satisfy it.
      applicable.add('funding_unavailable')
      gaps.add('funding_unavailable')
      gaps.add('runway_unknown')
      state = mostRestrictive(state, FUNDING_UNAVAILABLE_FLOOR)
      break
    }

    case 'KNOWN': {
      declaredFundingSek = input.funding.declaredFundingSek

      if (declaredFundingSek <= 0) {
        // Zero or negative known funding. §18.41 lists exhausted budget as a
        // stopping condition, and there is nothing to project a runway from —
        // so this floors at HIBERNATE regardless of how much headroom remains.
        //
        // That floor is what forces FUNDING_UNAVAILABLE_FLOOR to be HIBERNATE
        // too; see its comment. Lowering this constant without lowering that one
        // is safe. Raising it is not.
        //
        // NOTE the scope plays no part here. A depleted declaration is HIBERNATE
        // whether the observation covers the platform or one project, because
        // "there is nothing to spend" does not become less true by looking at
        // less of the platform. Coverage can only ever withhold a POSITIVE
        // figure.
        applicable.add('funding_depleted')
        runwayDays = 0
        state = mostRestrictive(state, FUNDING_DEPLETED_FLOOR)
      } else if (input.runwayCoverage === 'PARTIAL_SCOPE') {
        // ── THE RULE THIS PHASE EXISTS FOR ──────────────────────────────────
        // Platform-wide capital over a partial burn is not runway. The division
        // would be larger than the truth — it omits the burn of every project
        // outside this observation — and an overstated runway is exactly the
        // input that would relax the autonomy ceiling. So the figure is not
        // produced at all.
        //
        // ── WHY THE CAP IS CRITICAL, NOT CONSERVE ───────────────────────────
        // It was CONSERVE, and that was too high. The property is narrow and
        // exact, and it is worth stating precisely because the loose version of
        // it is FALSE:
        //
        //   Changing ONLY the runway coverage — PLATFORM_COMPLETE →
        //   PARTIAL_SCOPE — while holding every OTHER supplied measurement
        //   equal, may never produce a MORE PERMISSIVE state, because runway
        //   information was lost.
        //
        // CONSERVE breaks that: with the same funding, burn and headroom, a
        // complete observation whose runway falls under
        // `PROVISIONAL_RUNWAY_CRITICAL_DAYS` is CRITICAL, so a partial one
        // reporting CONSERVE sits a full level above it — a ceiling raised by
        // losing runway information. Same defect class as the
        // FUNDING_UNAVAILABLE_FLOOR sweep documented above.
        //
        // CRITICAL is the EXACT bound, not a safe over-correction. Holding the
        // other measurements fixed and funding positive with headroom not
        // exhausted, CRITICAL is the most restrictive state a complete
        // observation can reach: HIBERNATE requires `headroom_exhausted` or
        // depleted funding, and neither is reachable here by a coverage change.
        //
        // ── WHAT THIS DOES NOT CLAIM ────────────────────────────────────────
        // This is NOT a statement that a real project-scoped observation is
        // always at least as restrictive as a real platform-complete one. It is
        // not, and coverage is not why. Headroom is itself scope-dependent: a
        // platform-complete set can contain a project whose own headroom is
        // exhausted (HIBERNATE) that a single-project observation never sees.
        // That divergence is caused by the HEADROOM measurement, not by runway,
        // and no cap in this branch can or should address it.
        //
        // Nor does it claim the platform IS critical. The gap below records that
        // a runway figure was withheld, which is the fact a reader needs; the
        // state is only the conservative bound for runway uncertainty.
        //
        // A test asserts the fixed-inputs property across the full funding ×
        // burn × headroom × revenue matrix with every other input held equal
        // between the two coverages, so the bound survives future edits rather
        // than only the constant.
        gaps.add('runway_scope_incomplete')
        state = mostRestrictive(state, 'CRITICAL')
      } else if (input.burnSekPerDay !== null && input.burnSekPerDay > 0) {
        runwayDays = declaredFundingSek / input.burnSekPerDay
        if (runwayDays < PROVISIONAL_RUNWAY_CRITICAL_DAYS) {
          applicable.add('runway_short')
          state = mostRestrictive(state, 'CRITICAL')
        } else if (runwayDays < PROVISIONAL_RUNWAY_CONSERVE_DAYS) {
          applicable.add('runway_short')
          state = mostRestrictive(state, 'CONSERVE')
        }
      } else {
        // Funding is known and the scope is complete, but there is no measured
        // burn to project from, so a runway in days does not exist. Reported as
        // unknown rather than as an infinite runway.
        gaps.add('runway_unknown')
      }
      break
    }
  }

  // ── Incomplete reads ──────────────────────────────────────────────────────
  const readsComplete = input.reads.budgets && input.reads.burn && input.reads.revenue
  if (!readsComplete) {
    applicable.add('reads_unavailable')
    gaps.add('reads_incomplete')
    // A failed read may only make the answer more conservative. If the reads
    // that DID succeed already say CRITICAL, that stands — the cap raises
    // nothing and hides nothing.
    state = mostRestrictive(state, 'CONSERVE')
  }

  // ── EXPAND ────────────────────────────────────────────────────────────────
  // The only state that is information rather than restriction. It requires
  // every measured fact to be present AND favourable, and it is reachable only
  // on KNOWN funding — which is what makes the two floors above meaningful
  // rather than cosmetic.
  if (
    state === 'NORMAL'
    && readsComplete
    && input.funding.kind === 'KNOWN'
    && runwayDays !== null
    && runwayDays >= PROVISIONAL_EXPAND_MIN_RUNWAY_DAYS
    && binding !== null
    && binding.remainingSek / binding.limitSek >= PROVISIONAL_EXPAND_MIN_HEADROOM_FRACTION
    && input.revenueTrendSek !== null
    && input.revenueTrendSek > 0
  ) {
    state = 'EXPAND'
  }

  // This snapshot does not read infrastructure cost at all, so it cannot claim
  // a complete cost position. Stated unconditionally rather than only on
  // failure: a gap that appears sometimes is a gap a reader will assume away.
  gaps.add('infrastructure_cost_untracked')

  return {
    state,
    reasons: REASON_ORDER.filter(reason => applicable.has(reason)),
    gaps: GAP_ORDER.filter(gap => gaps.has(gap)),
    bindingScope: binding?.scope ?? null,
    bindingProjectId: binding?.projectId ?? null,
    bindingLimitSek: binding?.limitSek ?? null,
    bindingRemainingSek: binding?.remainingSek ?? null,
    burnSekPerDay: input.burnSekPerDay,
    fundingState: input.funding.kind,
    declaredFundingSek,
    runwayDays,
    runwayCoverage: input.runwayCoverage,
    revenueTrendSek: input.revenueTrendSek,
    // Copied through, never branched on. If it ever influenced `state` above,
    // an owner pause and a survival reduction would become indistinguishable
    // and §18.251 could not be satisfied.
    operatingPaused: input.operatingPaused,
    asOf: options.at,
  }
}
