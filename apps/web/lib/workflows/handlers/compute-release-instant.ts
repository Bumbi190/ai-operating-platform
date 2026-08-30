/**
 * The first executable workflow action.
 *
 * Computes the month's release instant from the instance key. It is the safest
 * possible first action by construction: pure computation with no network, no
 * credential, no database write and no external system — `authoritativeSystem`
 * is null because nothing was consulted, and that is the honest answer rather
 * than a missing field.
 *
 * The DST reasoning is PR4's, reused rather than restated: October's release is
 * 22:00 UTC (+02:00) and November's is 23:00 UTC (+01:00), and the offset is
 * derived per month via `Intl` instead of by adding a month to a previous
 * instant. That distinction is why this is worth executing at all — a wrong
 * instant publishes material an hour early or late.
 *
 * A caller cannot choose the month, the timezone or the release time. The month
 * comes from the instance key on the run's immutable binding; the rule comes
 * from the canonical definition.
 */

import { computeReleaseInstant, InvalidMonthKeyError } from '../adapters/familje-stunden/instant'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput } from './types'

/** The declared check this action answers. Must exist in the adapter catalogue. */
export const COMPUTE_RELEASE_INSTANT_CHECK = 'release_instant_computed'

export const computeReleaseInstantHandler: ReadOnlyHandler = async input => {
  const expected = 'first day of month 00:00 Europe/Stockholm, stored as UTC'
  try {
    const instant = computeReleaseInstant(input.instanceKey)
    const ok: ReadOnlyHandlerOutput = {
      result: 'pass',
      checkKey: COMPUTE_RELEASE_INSTANT_CHECK,
      expected,
      observed: `${instant.utc} (${instant.stockholm} ${instant.utcOffset})`,
      authoritativeSystem: null,          // nothing external was consulted
      detail: {
        month_key: input.instanceKey,
        computed_utc: instant.utc,
        local_release_time: instant.stockholm,
        timezone: 'Europe/Stockholm',
        utc_offset: instant.utcOffset,
        computed_at: input.now,
      },
    }
    return ok
  } catch (e) {
    // An exception is never laundered into a pass. A month key the canonical
    // rule cannot parse is a definition/instance problem, not an observation.
    const failed: ReadOnlyHandlerOutput = {
      result: 'error',
      checkKey: COMPUTE_RELEASE_INSTANT_CHECK,
      expected,
      observed: e instanceof InvalidMonthKeyError
        ? `instance key "${input.instanceKey}" is not a YYYY-MM month`
        : `release instant could not be computed: ${e instanceof Error ? e.message : 'unknown error'}`,
      authoritativeSystem: null,
      detail: {
        month_key: input.instanceKey,
        error_kind: e instanceof InvalidMonthKeyError ? 'invalid_month_key' : 'computation_failed',
        computed_at: input.now,
      },
    }
    return failed
  }
}
