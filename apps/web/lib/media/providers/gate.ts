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
 * happen at all", never "is this call affordable". That second question now has
 * exactly one answer in Omnira — `lib/cost/governed-spend.ts`, which owns
 * project resolution, the estimate, the reservation and the settlement for every
 * provider. A MuAPI adapter that becomes billable calls THAT boundary.
 *
 * This file used to declare its own `MediaSpendPolicy` types and a refusing
 * default, written when Omnira had cost tracking and no budget layer. Governance
 * G1 removed them: a second spend abstraction is a second place for "may we
 * spend" to be answered, and the audit that produced G1 named exactly that as a
 * thing to avoid. Nothing consumed them — no adapter, no route, no orchestrator.
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
