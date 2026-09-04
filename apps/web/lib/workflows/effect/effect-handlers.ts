/**
 * lib/workflows/effect/effect-handlers.ts — the closed effect-handler map.
 *
 * Keyed by `GovernedEffectEnabledKind`, so a kind that is not on the allowlist
 * is a TYPE ERROR here rather than a runtime lookup miss. That mirrors the
 * read-only map's `ExecutableReadOnlyActionKind` keying and gives the same
 * property: the surface cannot grow by accident.
 *
 * `generate_monthly_story` is deliberately absent. It is declared in the
 * registry with the governed-effect family and it has no entry here, because
 * enabling it is a separate decision belonging to the phase that performs the
 * first real dispatch.
 */

import type { GovernedEffectEnabledKind } from '../action-registry'
import type { EffectHandler } from './effect-handler'
import { proofGovernedEffectHandler } from './proof-handler'

export const EFFECT_HANDLERS: Record<GovernedEffectEnabledKind, EffectHandler> = {
  proof_governed_effect: proofGovernedEffectHandler,
}

export function effectHandlerFor(kind: string): EffectHandler | null {
  return (EFFECT_HANDLERS as Record<string, EffectHandler>)[kind] ?? null
}
