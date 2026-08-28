/**
 * lib/media/providers/gate.ts — the media execution gate (pure decision, no I/O).
 *
 * Shaped after `lib/ai/policy-gate.ts`, which is Omnira's existing precedent for
 * this: a small pure function that answers one authority question, kept free of
 * I/O so it is exhaustively testable and so no code path can "helpfully" fetch
 * something that changes the answer. Same philosophy here, same Default Deny.
 *
 * THE THREE STATES, and what each one actually forbids:
 *
 *   disabled     → NO outbound MuAPI call of any kind. Not generation, not
 *                  polling, not a health check, not a model listing. A "read-
 *                  only calls are surely fine" carve-out is precisely how a
 *                  disabled integration acquires a live network path, and once
 *                  one exists the next call site copies it.
 *
 *   test         → outbound calls permitted, but ONLY on the test credential.
 *                  Enforced structurally rather than by policy: `config.ts`
 *                  will not hand out the production key while the mode is test,
 *                  so there is no key available to spend with.
 *
 *   production   → REFUSED unless `MUAPI_PRODUCTION_ENABLED` is separately set.
 *                  Two switches, because one switch is one typo. Selecting
 *                  production without the second switch is treated as a
 *                  configuration mistake and refused loudly, not downgraded to
 *                  test — a silent downgrade would let an operator believe
 *                  production was live while it quietly was not.
 *
 * WHAT THIS GATE IS NOT: it is not a budget. It answers "may an outbound call
 * happen at all", never "is this call affordable". The spend seam at the bottom
 * of this file is where that second question will attach; today it is types and
 * a refusing default, because Omnira has cost TRACKING (`lib/cost/track.ts`,
 * the `cost_events` table) and no budget layer at all. Inventing a budget
 * system here would put Omnira's first spending authority inside a bootstrap.
 */

import type { MediaCapability, MediaProviderErrorCode, MediaProviderId } from './types'
import type { MuapiConfig } from './config'
import { MUAPI_ENV } from './config'
import { MediaProviderError } from './errors'

// ── The decision ─────────────────────────────────────────────────────────────

export interface MediaExecutionDecision {
  allowed: boolean
  /** Null when allowed. Never contains a credential — only env var NAMES. */
  reason: string | null
  /** The typed ground for refusal, for callers that map to an error. */
  code: MediaProviderErrorCode | null
  /**
   * Whether calls in this state are billable. False in test mode: MuAPI sandbox
   * keys return mock outputs without billing. Carried separately from `allowed`
   * because "may run" and "costs money" are different questions and a spend
   * policy needs the second one.
   */
  billable: boolean
}

const ALLOWED_TEST: MediaExecutionDecision = {
  allowed: true,
  reason: null,
  code: null,
  billable: false,
}

const ALLOWED_PRODUCTION: MediaExecutionDecision = {
  allowed: true,
  reason: null,
  code: null,
  billable: true,
}

/**
 * The whole authority decision, from config alone.
 *
 * Order is load-bearing. `disabled` is checked first so that no later branch
 * can grant anything; the missing-credential check comes before the production
 * switch check so an operator sees the nearest problem first.
 */
export function decideMediaExecution(config: MuapiConfig): MediaExecutionDecision {
  if (config.mode === 'disabled') {
    return {
      allowed: false,
      reason: `MuAPI is disabled. Set ${MUAPI_ENV.enabled}=1 to enable it.`,
      code: 'MEDIA_EXECUTION_DISABLED',
      billable: false,
    }
  }

  if (!config.hasCredential) {
    const expected = config.mode === 'production' ? MUAPI_ENV.prodKey : MUAPI_ENV.testKey
    return {
      allowed: false,
      reason: `MuAPI mode is "${config.mode}" but ${expected} is not set. `
        + 'Credentials are never shared between modes.',
      code: 'MEDIA_PROVIDER_NOT_CONFIGURED',
      billable: false,
    }
  }

  if (config.mode === 'production') {
    if (!config.productionEnabled) {
      return {
        allowed: false,
        reason: `MuAPI production mode requires ${MUAPI_ENV.productionEnabled}=1 in addition `
          + `to ${MUAPI_ENV.mode}=production. Production is never entered by configuration alone.`,
        code: 'MEDIA_EXECUTION_DISABLED',
        billable: false,
      }
    }
    return ALLOWED_PRODUCTION
  }

  return ALLOWED_TEST
}

/**
 * Throwing form, for adapters. Refusals are never retryable — a retry cannot
 * change a configuration decision, and marking them retryable would put a
 * disabled provider into a backoff loop instead of failing immediately.
 */
export function assertMediaExecutionAllowed(
  config: MuapiConfig,
  provider: MediaProviderId,
  operation: string,
): void {
  const decision = decideMediaExecution(config)
  if (decision.allowed) return
  throw new MediaProviderError({
    code: decision.code ?? 'MEDIA_EXECUTION_DISABLED',
    message: `[${provider}] ${operation} refused: ${decision.reason}`,
    provider,
    retryable: false,
  })
}

/**
 * Capability refusal, checked before any network call so an unsupported
 * operation is a typed refusal rather than a vendor 404 the caller must parse.
 */
export function assertCapability(
  capabilities: readonly MediaCapability[],
  wanted: MediaCapability,
  provider: MediaProviderId,
): void {
  if (capabilities.includes(wanted)) return
  throw new MediaProviderError({
    code: 'MEDIA_CAPABILITY_UNSUPPORTED',
    message: `[${provider}] does not support "${wanted}".`,
    provider,
    retryable: false,
  })
}

// ── Spend seam (declared, not implemented) ───────────────────────────────────

/**
 * The shape a spend policy will have, written now so the call sites that will
 * need it are already the right shape, and so the eventual budget layer is a
 * new implementation rather than a refactor of every adapter.
 *
 * Deliberately NOT implemented beyond the refusing default below. The four
 * thresholds Omnira has named — project budget, autonomous spend threshold,
 * approval-required threshold, and reconciliation against actual cost — each
 * need a persistence decision (which table, scoped to which project, reconciled
 * against `cost_events` how) that belongs with the Media Orchestrator, not with
 * a provider adapter.
 */
export interface MediaSpendRequest {
  provider: MediaProviderId
  model: string
  projectId: string | null
  /** From `MediaProvider.estimateCost`. Null when the vendor gave no estimate. */
  estimate: { unit: 'credits' | 'usd'; amount: number; exact: boolean } | null
}

export type MediaSpendVerdict =
  /** Under the autonomous threshold — an agent may proceed unattended. */
  | { decision: 'allow'; reason: string }
  /** Over the autonomous threshold — a human must approve before execution. */
  | { decision: 'approval_required'; reason: string }
  /** Over budget, or unestimable. Refused outright. */
  | { decision: 'deny'; reason: string }

export interface MediaSpendPolicy {
  (req: MediaSpendRequest): Promise<MediaSpendVerdict>
}

/**
 * The production default: every billable spend requires human approval.
 *
 * Mirrors `unprovenAvailability` in `lib/atlas/mission/capability.ts` — absence
 * of a policy is never a permissive answer. Note this default does not consult
 * the estimate at all: with no budget to compare against, an estimate proves
 * nothing, and a default that reads it would imply a threshold exists.
 */
export const approvalRequiredSpendPolicy: MediaSpendPolicy = async ({ provider, model }) => ({
  decision: 'approval_required',
  reason: `No spend policy is configured for ${provider}/${model}. `
    + 'Until a project budget exists, every billable generation needs explicit approval.',
})
