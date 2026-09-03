/**
 * lib/media/orchestrator/eligibility.ts — who MAY run, then who SHOULD.
 *
 * Two functions, in this order, and the order is the whole design:
 *
 *     filterEligible(...)  →  rankEligible(...)
 *
 * `rankEligible` takes the OUTPUT of `filterEligible`. It has no access to the
 * full candidate list and no way to obtain one. That is what makes "ranking
 * never widens eligibility" a structural fact rather than a rule someone has to
 * remember — a preference cannot admit a candidate that eligibility rejected,
 * because ranking never sees it.
 *
 * ── PURE BY CONSTRUCTION ───────────────────────────────────────────────────
 * Neither function performs I/O. Both take an already-gathered candidate list
 * and a brief, and return a decision. Same shape as `lib/media/providers/gate.ts`
 * and `lib/ai/policy-gate.ts`, for the same reason: no branch can "helpfully"
 * fetch something that changes the answer, and every rule is exhaustively
 * testable without a network, a database, or a provider.
 *
 * ── WHICH RULES ARE FACTS, WHICH ARE NEW ───────────────────────────────────
 * Phase 2 was asked to distinguish these, and the distinction is small:
 *
 *   FACT — already enforced elsewhere; this layer only ASKS and reports:
 *     • capability licence   `lib/atlas/capability/media-generation.ts`
 *     • provider gate        `lib/media/providers/gate.ts`, via the router
 *     • credential presence  read by each adapter before it reserves budget
 *     • spend / budget       `withGovernedSpend`, INSIDE the adapters
 *     • stop authority       `ExecutionContract`, resolved by those adapters
 *
 *   NEW — genuinely added here, because nothing could express it before:
 *     • media-type match
 *     • reference support as a HARD constraint (the PR #164 contract, lifted
 *       from "one call site fails closed" to "an unsuitable provider is never
 *       selected in the first place")
 *     • PRICEABILITY (Phase 5) — whether spend governance has a proven price for
 *       this candidate's model at all. Not a budget check: budgets are live
 *       headroom and belong at dispatch. This asks the earlier question, the one
 *       that cannot be asked later without paying to find out.
 *
 * Spend and stop are deliberately NOT re-checked here. They are enforced at the
 * moment of dispatch by the adapter that owns them, and a pre-check would be a
 * second answer to a question that already has one — the exact duplication
 * Governance G1 deleted from this directory once already.
 */

import {
  MEDIA_GENERATION_AUTONOMOUS_EXECUTION,
} from '@/lib/atlas/capability/media-generation'
import type { MediaCandidate } from './candidates'
import type {
  MediaCandidateId,
  MediaEligibilityRejection,
  MediaGenerationBrief,
  MediaInvocation,
} from './types'

export interface EligibilityDecision {
  eligible: MediaCandidate[]
  rejected: MediaEligibilityRejection[]
}

/**
 * Whether the Atlas media capability licence permits THIS invocation.
 *
 * The licence governs whether a MISSION may declare `media.generate` among its
 * tools — `mediaGenerationAvailability` is a `MissionCapabilityAvailability`,
 * and `MEDIA_GENERATION_TOOL_BOUND` is a mission tool bound. It is a statement
 * about missions, not about every line of code that makes an image.
 *
 * So this asks which KIND of call is running rather than whether to waive
 * anything:
 *
 *   mission              → the licence applies, in full. `MEDIA_GENERATION_
 *                          AUTONOMOUS_EXECUTION` is false today, so every
 *                          mission-invoked generation is refused. There is no
 *                          parameter on this branch that could change that.
 *   internal-application → not a mission; the mission licence is not the
 *                          governing authority. Every OTHER rule still applies.
 *
 * An earlier revision took an `allowUnlicensed` boolean. That was the wrong
 * shape: it described a classification error ("this was never a mission") as a
 * permission ("ignore the rule"), and a boolean waiver is the kind of thing that
 * spreads. This cannot spread — `InternalMediaCaller` is a closed union, so a
 * new caller is a type change a reviewer sees.
 */
export function capabilityLicencePermits(invocation: MediaInvocation): boolean {
  if (invocation.kind === 'internal-application') return true
  return MEDIA_GENERATION_AUTONOMOUS_EXECUTION
}

/**
 * The deterministic filter. Every rejection carries the rule that caused it, so
 * "nothing was eligible" can always be explained rather than merely reported.
 *
 * Rule order is load-bearing for the MESSAGE, not the outcome: the licence is
 * checked first so that a blanket refusal is not reported as five unrelated
 * per-candidate problems.
 */
export function filterEligible(
  candidates: readonly MediaCandidate[],
  brief: MediaGenerationBrief,
): EligibilityDecision {
  const rejected: MediaEligibilityRejection[] = []

  if (!capabilityLicencePermits(brief.invocation)) {
    // Not a per-candidate fault: nothing may run, so nothing is eligible.
    return {
      eligible: [],
      rejected: candidates.map(c => ({
        candidate: c.id,
        rule: 'capability_licence' as const,
        detail: 'mission-invoked media generation is unlicensed (licence draft, autonomy L0)',
      })),
    }
  }

  const referenceRequired = brief.referenceRequirement === 'required'
  const eligible: MediaCandidate[] = []

  for (const c of candidates) {
    if (!c.mediaTypes.includes(brief.mediaType)) {
      rejected.push({ candidate: c.id, rule: 'media_type_unsupported',
        detail: `cannot produce "${brief.mediaType}"` })
      continue
    }

    // THE PR #164 CONTRACT, ONE LAYER UP.
    //
    // That fix guarantees a required reference never degrades once a provider
    // has been chosen. This guarantees an unsuitable provider is never chosen —
    // so the two together mean a reference requirement cannot be lost by
    // selection OR by execution. A candidate whose model cannot be conditioned
    // on references is not a worse option here; it is not an option.
    if (referenceRequired && !c.model.supportsReferenceImages) {
      rejected.push({ candidate: c.id, rule: 'reference_unsupported',
        detail: `model "${c.model.name}" cannot be conditioned on reference images` })
      continue
    }

    if (!c.configured) {
      rejected.push({ candidate: c.id, rule: 'not_configured',
        detail: 'no usable credential in this environment' })
      continue
    }

    if (c.gateRefused) {
      rejected.push({ candidate: c.id, rule: 'provider_gate_refused',
        detail: c.gateBlockedReason ?? 'the provider execution gate refuses' })
      continue
    }

    // THE PHASE 2 ELIGIBILITY PRINCIPLE.
    //
    // Last, because it is the only rule that is not an authority's refusal: the
    // candidate is allowed, and this orchestrator simply cannot finish the job.
    // Checked HERE rather than at dispatch so that a candidate is never ranked,
    // selected, and only then found undispatchable — by which point a selection
    // has been made and, for a reference request, a requirement could have been
    // silently attached to a provider that cannot honour it.
    if (!c.dispatch.supported) {
      rejected.push({ candidate: c.id, rule: 'execution_not_supported',
        detail: c.dispatch.reason })
      continue
    }

    // SPEND GOVERNANCE MUST BE ABLE TO PRICE IT — the Phase 5 addition.
    //
    // Last, and after dispatchability, because "we cannot submit this at all" is
    // the nearer problem: reporting an unpriceable model for a candidate that
    // also has no dispatch path would send an operator to fix the second thing.
    //
    // This is the one eligibility rule about MONEY, and it is deliberately not a
    // budget check. Budgets are `withGovernedSpend`'s, resolved at dispatch
    // against live headroom — re-asking here would be a second answer to a
    // question that already has one, and a stale one. What this asks is
    // narrower and cannot be answered later without a cost: is there a proven
    // PRICE at all? A candidate with no price has no conservative upper bound to
    // reserve, and reserving against an invented figure would make the budget
    // ceiling enforce a fiction.
    if (c.costGovernance && !c.costGovernance.admissible) {
      rejected.push({ candidate: c.id, rule: 'cost_governance_unavailable',
        detail: c.costGovernance.reason })
      continue
    }

    eligible.push(c)
  }

  return { eligible, rejected }
}

/**
 * Rank the ALREADY-ELIGIBLE set. Deterministic for identical inputs and state.
 *
 * WHAT IT MAY CONSIDER — only signals that exist today. There is no quality
 * score, no latency measurement and no live cost lookup in this repository, so
 * inventing a weighted formula over them would be fabricating inputs:
 *
 *   1. `providerPreference` — the caller's stated preference, honoured ONLY if
 *      that candidate is already eligible. This is the whole preference-vs-
 *      authority distinction, and it is enforced by the signature: this
 *      function is handed `eligible`, so a preference for a rejected candidate
 *      simply matches nothing.
 *   2. `quality: 'premium'` — prefers a reference-capable model, the one real
 *      quality signal the repository actually has. Not a claim that OpenAI beats
 *      Ideogram; a claim that a model which can be conditioned is better when
 *      fidelity is what was asked for.
 *   3. Candidate order from `describeMediaCandidates()` — a stable tie-break, so
 *      identical inputs always produce identical output.
 *
 * NO LLM is consulted. Nothing here is random, time-dependent, or stateful.
 */
export function rankEligible(
  eligible: readonly MediaCandidate[],
  brief: MediaGenerationBrief,
): MediaCandidate[] {
  const preference = brief.providerPreference
  const premium = brief.quality === 'premium'

  // Index in the source list — the deterministic tie-break.
  const order = new Map<MediaCandidateId, number>()
  eligible.forEach((c, i) => order.set(c.id, i))

  return [...eligible].sort((a, b) => {
    // 1. An eligible preference wins outright.
    if (preference) {
      const ap = a.id === preference ? 0 : 1
      const bp = b.id === preference ? 0 : 1
      if (ap !== bp) return ap - bp
    }
    // 2. Premium prefers a conditionable model.
    if (premium) {
      const ar = a.model.supportsReferenceImages ? 0 : 1
      const br = b.model.supportsReferenceImages ? 0 : 1
      if (ar !== br) return ar - br
    }
    // 3. Stable order.
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  })
}
