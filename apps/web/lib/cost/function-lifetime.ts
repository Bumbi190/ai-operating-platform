/**
 * lib/cost/function-lifetime.ts — keep the Vercel Function alive for work that
 * must finish after the response.
 *
 * ── WHY THIS EXISTS (M0 hotfix) ─────────────────────────────────────────────
 * A streamed governed call settles its reservation only once the stream has
 * ended, which is AFTER the route has returned its streaming Response. On
 * Vercel, a promise nobody registered is not part of the Function's lifetime:
 * once the response finishes the instance may be frozen, and the settlement
 * simply never runs. Production showed exactly that (2026-10-02, reservation
 * 3af0bad5…): the metering chain started, the response closed, and
 * `budget_settle_recorded` never reached the database — no error, no log.
 *
 * `waitUntil` from `@vercel/functions` is Vercel's supported primitive for this
 * on Next.js < 15.1 (no `after()`): the Function stays alive until the
 * registered promise settles, up to its maxDuration.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 * - Call it while the request is still in flight (the governed call runs inside
 *   the request's async context, so the Vercel request context is reachable).
 * - Pass a promise that NEVER rejects and resolves only when the work is done or
 *   has definitively failed. A rejection here would be an unhandled one.
 * - Registration can never throw into the caller: a streamed response that
 *   already reached the client must not turn into an application error because
 *   bookkeeping about it could not be registered.
 */

import { waitUntil } from '@vercel/functions'

// Read ONLY to make a missing request context visible. `waitUntil` itself is a
// silent no-op without one, which is precisely the failure this hotfix closes —
// so a deployed Function that cannot register says so loudly instead.
const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context')

function hasRequestContext(): boolean {
  const holder = (globalThis as Record<symbol, { get?: () => { waitUntil?: unknown } | undefined } | undefined>)[
    VERCEL_REQUEST_CONTEXT]
  return typeof holder?.get?.()?.waitUntil === 'function'
}

/**
 * Registers `work` with the current Vercel Function lifetime. Returns whether a
 * request context accepted it (false outside Vercel, e.g. tests and local dev,
 * where the process is not frozen and the promise runs to completion anyway).
 */
export function keepFunctionAliveUntil(work: Promise<void>, label: string): boolean {
  let accepted = false
  try {
    accepted = hasRequestContext()
    waitUntil(work)
  } catch (e) {
    console.error(`[function-lifetime] could not register ${label}; it runs unregistered and may be `
      + 'frozen with the Function:', e instanceof Error ? e.message : e)
    return false
  }
  if (!accepted && process.env.VERCEL) {
    console.error(`[function-lifetime] no Vercel request context while registering ${label}; it runs `
      + 'unregistered and may be frozen with the Function')
  }
  return accepted
}
