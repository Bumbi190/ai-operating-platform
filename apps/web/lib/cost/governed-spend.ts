/**
 * lib/cost/governed-spend.ts — the canonical provider spend boundary.
 *
 * ── WHAT THIS CLOSES ────────────────────────────────────────────────────────
 * The Governance Hard Gate audit found 33 runtime call sites that can spend real
 * money and exactly ONE that reserved budget first. Every other path constructed
 * a provider SDK inline or fetched a provider hostname directly, so
 * `project_budgets` bounded roughly 3% of spend and `H1_SPEND_GATE` would have
 * enforced a ceiling over almost nothing.
 *
 * This module is the one place a billable call may be made from. It owns project
 * resolution, the estimate, the reservation, the refusal and the settlement.
 * Provider adapters own the request shape and nothing else.
 *
 *     withGovernedSpend            ← project, estimate, reserve, refuse, settle
 *          ↓
 *     provider adapter             ← Anthropic / Ideogram / OpenAI / ElevenLabs
 *          ↓
 *     provider SDK or fetch
 *
 * ── ONE BUDGET SYSTEM ───────────────────────────────────────────────────────
 * `reserveSpend` / `settleSpend` / `releaseSpend`, `project_budgets`,
 * `spend_reservations`, `cost_rates` and `cost_events` are REUSED unchanged.
 * Nothing here introduces a second budget store, a second rate table or a second
 * approval concept — that was the explicit failure mode the audit warned about
 * after finding a dead parallel `MediaSpendPolicy` seam.
 *
 * ── FAIL CLOSED (audit F-002) ───────────────────────────────────────────────
 * The old ElevenLabs call site read:
 *
 *     const reservation = projectId ? await reserveSpend(…) : null
 *     if (reservation && !reservation.allowed) throw …
 *
 * so an unresolvable project — a missing row, or a transient database error that
 * `resolveCostProjectId` swallowed into `null` — skipped the gate entirely and
 * the provider was called anyway. A database blip silently disabled the only
 * enforcement Omnira had.
 *
 * Here, every way of NOT getting an answer refuses: no project reference, an
 * unresolvable one, a lookup that threw, a non-finite estimate, a reservation
 * RPC that failed. `unavailable` is never read as `allowed`. The one deliberate
 * exception is the enforcement flag itself: `H1_SPEND_GATE` off means the
 * refusal is RECORDED and overridden, which is the existing advisory rollout
 * semantics and is decided inside `reserveSpend`, not here.
 *
 * ── AMBIGUITY IS NOT A REFUND ───────────────────────────────────────────────
 * `withSpendGate` released the reservation on every thrown error. That is wrong
 * for a call that may already have been billed: a timeout after the provider
 * accepted the request would hand the budget back and let the next caller spend
 * it a second time. Failures are therefore classified, and the DEFAULT for an
 * unrecognised failure is to SETTLE — keep the money counted. Only a failure an
 * adapter can prove never reached the provider releases the headroom.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { reserveSpend, settleSpend, releaseSpend, type SpendVerdict } from './budget-gate'
// Value import, but no runtime cycle: `execution-signal` imports only
// `run-authority` and `execution-stop`, and the latter's reference back here is
// `import type` — erased at compile time.
import { isPhysicalAdmissionRefusal } from '@/lib/governance/execution-signal'
import {
  ExecutionStoppedError, resolveExecutionStopForContract,
  type ExecutionContract,
} from '@/lib/governance/execution-stop'

/**
 * Which project a billable call is charged to. Required — there is no default.
 *
 * A hidden default is exactly how the audit found every voiceover, including
 * Familje-Stunden's, billed to `ai-media-automation`: `resolveCostProjectId()`
 * was called with no argument and silently resolved one hardcoded slug. Callers
 * that genuinely have no project of their own must name a compatibility slug
 * explicitly at the call site, where a reviewer can see it.
 */
export type ProjectRef = { projectId: string } | { projectSlug: string }

/**
 * The compatibility mapping for platform-level work that predates per-project
 * attribution — Atlas chat and Atlas TTS serve every project at once and belong
 * to none of them.
 *
 * Deliberately a named constant rather than a fallback inside the resolver: it
 * is declared at each call site, greppable, and listed in the G1 report as a
 * decision G2 must make when it introduces budget scopes. It is NOT a fallback —
 * if this slug fails to resolve, the call is refused like any other.
 */
export const PLATFORM_COMPAT_PROJECT_SLUG = 'ai-media-automation'

/**
 * The media pipeline's own project.
 *
 * This is not a compatibility mapping — script generation, scene images, news
 * images and pipeline voiceover genuinely belong to `ai-media-automation`, and
 * that is where their cost has always been recorded. Named here so the
 * attribution is a stated decision rather than a string repeated in fifteen
 * files, and so a reviewer can see which calls are correctly attributed and
 * which (see `PLATFORM_COMPAT_PROJECT_SLUG`) are awaiting one.
 */
export const MEDIA_PIPELINE_PROJECT_SLUG = 'ai-media-automation'

/** Convenience for the common case. Still explicit at every call site. */
export const MEDIA_PIPELINE_PROJECT: ProjectRef = { projectSlug: MEDIA_PIPELINE_PROJECT_SLUG }
export const PLATFORM_COMPAT_PROJECT: ProjectRef = { projectSlug: PLATFORM_COMPAT_PROJECT_SLUG }

export type SpendRefusalReason =
  | 'project_unresolved'
  | 'project_lookup_failed'
  | 'invalid_estimate'
  | SpendVerdict['reason']

/** Thrown instead of calling the provider. Carries why, never a credential. */
export class SpendRefusedError extends Error {
  readonly reason: SpendRefusalReason
  readonly provider: string
  readonly operation: string
  readonly verdict: SpendVerdict | null

  constructor(args: {
    reason: SpendRefusalReason
    provider: string
    operation: string
    detail?: string
    verdict?: SpendVerdict | null
  }) {
    super(
      `Spend refused for ${args.provider}/${args.operation}: ${args.reason}`
      + (args.detail ? ` — ${args.detail}` : ''),
    )
    this.name = 'SpendRefusedError'
    this.reason = args.reason
    this.provider = args.provider
    this.operation = args.operation
    this.verdict = args.verdict ?? null
  }
}

/**
 * Thrown by an adapter to state that the provider was demonstrably NOT billed —
 * the request never left the process, or the provider rejected it before doing
 * any work. This is the ONLY way to get a reservation released after dispatch
 * was attempted, and it is a claim the adapter has to be able to defend.
 */
export class ProviderNotDispatchedError extends Error {
  readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ProviderNotDispatchedError'
    this.cause = cause
  }
}

const projectIdCache = new Map<string, string | null>()

/**
 * Resolve a project reference to a UUID.
 *
 * Distinguishes "no such project" from "could not ask", because the caller
 * refuses on both but the operator needs to tell them apart.
 */
export async function resolveGovernedProjectId(
  ref: ProjectRef,
): Promise<{ ok: true; projectId: string } | { ok: false; reason: 'project_unresolved' | 'project_lookup_failed' }> {
  if ('projectId' in ref) {
    return ref.projectId
      ? { ok: true, projectId: ref.projectId }
      : { ok: false, reason: 'project_unresolved' }
  }
  const slug = ref.projectSlug
  if (!slug) return { ok: false, reason: 'project_unresolved' }
  if (projectIdCache.has(slug)) {
    const cached = projectIdCache.get(slug) ?? null
    return cached ? { ok: true, projectId: cached } : { ok: false, reason: 'project_unresolved' }
  }
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('projects').select('id').eq('slug', slug).limit(1).maybeSingle()
    // A query error is NOT "no such project" — never cache it, never treat it as
    // an answer. This is the exact conflation that made F-002 fail open.
    if (error) return { ok: false, reason: 'project_lookup_failed' }
    const id = (data?.id as string | undefined) ?? null
    projectIdCache.set(slug, id)
    return id ? { ok: true, projectId: id } : { ok: false, reason: 'project_unresolved' }
  } catch {
    return { ok: false, reason: 'project_lookup_failed' }
  }
}

export interface GovernedSpendInput {
  /**
   * BILLING attribution. Required, no default, no fallback.
   *
   * This is which budget pays. It is NOT which stop authority binds — see
   * `execution`. The two are deliberately separate fields because they are
   * separate facts: `PLATFORM_COMPAT_PROJECT_SLUG` and
   * `MEDIA_PIPELINE_PROJECT_SLUG` are the same slug, so deriving authority from
   * attribution would let a media-project pause take Atlas offline.
   */
  project: ProjectRef
  /**
   * EXECUTION classification. Required, no default, no optional shape.
   *
   * Says why this work is running (context) and which stop authorities bind it
   * (scope). Required so a billable dispatch cannot reach a provider without
   * having declared itself: an optional field would be omitted exactly where the
   * omission is least safe.
   */
  execution: ExecutionContract
  /** Ledger provider name, e.g. 'anthropic'. Matches cost_events.provider. */
  provider: string
  /** What is being paid for, e.g. 'messages.create'. */
  operation: string
  /**
   * Conservative UPPER BOUND in SEK, computed before the call from the shared
   * rate accessor. Never an optimistic figure: the reservation is what stops a
   * concurrent caller, so under-estimating re-opens the race it exists to close.
   */
  estimatedSek: number
  /**
   * Stable identity for ONE logical spend, so a retry reserves once.
   *
   * ── SAFE SINCE G2 (audit F-105 / F-106 closed) ────────────────────────────
   * G1 plumbed this but no adapter passed one, because `budget_reserve`'s replay
   * branch returned BEFORE the advisory lock and BEFORE the budget read — a key
   * whose reservation had already settled came back `allowed = true` with no new
   * reservation and no budget check.
   *
   * G2 moved the locks above the replay and made the verdict a closed state
   * machine: only a still-OPEN reservation replays as allowed (it is holding its
   * own headroom); settled and released are terminal refusals. A key can
   * therefore no longer resurrect a completed spend.
   *
   * WHAT IT GUARANTEES: at most one reservation per key, and — since the final
   * hardening — that an existing key can NEVER authorise a second provider
   * dispatch. Every replay state refuses: `replay_in_flight` while the
   * reservation is live, `replay_stale` once it has aged out (a visibility
   * timeout proves only that nothing was OBSERVED finishing, not that the
   * original request is dead), `replay_settled`, `replay_released`, and
   * `replay_identity_mismatch` if the key names a different project, provider,
   * operation or a larger estimate. Zero replay states return allowed.
   *
   * STILL DORMANT AT RUNTIME. No adapter passes one, for a reason measured
   * rather than assumed (`budget-retry-lifecycle.test.ts`): every retry wrapper
   * in this codebase sits OUTSIDE this boundary, so attempt 1 has already
   * settled or released before attempt 2 begins. A key would therefore turn a
   * retryable 503 into a spend refusal. Activation waits for a dispatch-claim
   * design; until then, every attempt takes its own reservation, which
   * over-reserves on retry and can never under-reserve.
   */
  idempotencyKey?: string
}

/**
 * Reserve, then call, then settle or release. The provider call happens ONLY
 * after an allowed reservation — there is no branch through this function that
 * reaches `run()` without one.
 */
export async function withGovernedSpend<T>(
  input: GovernedSpendInput,
  run: () => Promise<T>,
): Promise<T> {
  const { provider, operation } = input

  if (!Number.isFinite(input.estimatedSek) || input.estimatedSek < 0) {
    throw new SpendRefusedError({
      reason: 'invalid_estimate', provider, operation,
      detail: `estimate ${String(input.estimatedSek)} is not a usable amount`,
    })
  }

  const resolved = await resolveGovernedProjectId(input.project)
  if (!resolved.ok) {
    throw new SpendRefusedError({
      reason: resolved.reason, provider, operation,
      detail: 'a billable call may not proceed without a known project',
    })
  }

  const verdict = await reserveSpend({
    projectId: resolved.projectId,
    estimatedSek: input.estimatedSek,
    idempotencyKey: input.idempotencyKey,
    provider,
    operation,
  })

  if (!verdict.allowed) {
    // The reservation row, if any, is already 'released' by budget_reserve when
    // it refuses; releasing again is a harmless no-op that also covers the
    // replay path, where the id belongs to a reservation we did not create.
    await releaseSpend(verdict.reservationId)
    throw new SpendRefusedError({
      reason: verdict.reason, provider, operation,
      detail: `estimate ${input.estimatedSek.toFixed(4)} SEK, headroom `
        + `${verdict.headroomSek ?? 'unknown'} SEK`
        + (verdict.bindingScope ? ` (binding scope: ${verdict.bindingScope})` : ''),
      verdict,
    })
  }

  // ── G3C-1 · FINAL DISPATCH STOP CHECK ─────────────────────────────────────
  //
  // The last safe boundary before money leaves. It runs AFTER the reservation
  // and IMMEDIATELY BEFORE `run()`, with nothing between it and dispatch.
  //
  // Precisely: a stopped call DOES briefly hold a reservation — it is taken
  // before this check — but it does not RETAIN that headroom, because the
  // refusal path releases it below. Ordering is deliberate: reserving first
  // means a stopped call and a permitted one contend for headroom identically,
  // so the stop cannot become a way to jump the budget queue.
  //
  // A FRESH decision, every time. Any earlier check — in a route, an executor,
  // a previous retry attempt — is an optimisation, not the guarantee: the pause
  // may have committed since. Caching a StopDecision here would reintroduce
  // exactly the stale-read window G3B closed in SQL.
  //
  // The EXECUTION project is resolved independently of the billing project just
  // resolved above. `resolved.projectId` is deliberately not passed anywhere
  // near this call.
  const decision = await resolveExecutionStopForContract(
    createAdminClient(),
    input.execution,
    async ref => {
      const r = await resolveGovernedProjectId(ref)
      return r.ok ? r.projectId : null
    },
  )

  if (!decision.allowed) {
    // KNOWN-NOT-DISPATCHED: the provider was never called, so the headroom is
    // free. Release rather than settle.
    try {
      await releaseSpend(verdict.reservationId)
    } catch (releaseError) {
      // A failed release must NEVER become a dispatch. The reservation stays
      // conservatively open and ages out through normal stale handling; the one
      // thing that does not happen is calling the provider anyway.
      console.error('[governed-spend] release after stop refusal failed; the '
        + 'refusal stands and the reservation will age out:',
        releaseError instanceof Error ? releaseError.message : String(releaseError))
    }
    throw new ExecutionStoppedError({
      reason: decision.reason ?? 'stop_state_unavailable',
      context: input.execution.context,
      scopeKind: input.execution.scope.kind,
      decision,
      provider, operation,
    })
  }

  try {
    const result = await run()
    await settleSpend(verdict.reservationId, input.estimatedSek)
    return result
  } catch (e) {
    if (isPhysicalAdmissionRefusal(e)) {
      // ── G3C-3C-A · GOVERNANCE REFUSED BEFORE DISPATCH ──────────────────────
      // Nothing left the machine, so this is not the ambiguous case below —
      // settling would count budget for a call that was never made. Its own
      // error type, deliberately: reporting it as a provider rejection would be
      // a lie about who refused and why.
      //
      // D4: the release is bookkeeping ABOUT the refusal, never a revision of
      // it. If it throws, the refusal still stands — the reservation stays
      // conservatively open and ages out through normal stale handling. Letting
      // the release error escape instead would turn "governance refused before
      // dispatch" into an unrecognised failure at the drain, which would then
      // charge a retry for a request that never left. Same principle as the
      // canonical stop-refusal path above.
      try {
        await releaseSpend(verdict.reservationId)
      } catch (releaseError) {
        console.error('[governed-spend] release after admission refusal failed; the '
          + 'refusal stands and the reservation will age out:',
          releaseError instanceof Error ? releaseError.message : String(releaseError))
      }
      throw e
    }
    if (e instanceof ProviderNotDispatchedError) {
      // The adapter can prove nothing was billed. Free the headroom now rather
      // than making a burst of auth failures starve the budget for 30 minutes.
      await releaseSpend(verdict.reservationId)
      throw e.cause ?? e
    }
    // Everything else is AMBIGUOUS: a timeout, a socket reset mid-response, a
    // parse failure after the provider already did the work. Settling keeps the
    // estimate counted, so the worst case is over-counting one call rather than
    // handing back budget for a call that was charged.
    await settleSpend(verdict.reservationId, input.estimatedSek)
    throw e
  }
}
