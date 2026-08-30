/**
 * Omnira Trading — Level-1 provider acceptance, public surface.
 *
 * Import from `@/lib/trading/provider-acceptance`, not from the modules
 * beneath it.
 *
 * WHAT THIS PACKAGE IS FOR
 * ────────────────────────
 * Certifying that an `ExecutionProviderAdapter` satisfies Omnira Level-1
 * read-only behaviour. It is provider-neutral: the suite is written once, and a
 * new provider is certified by supplying a context rather than by editing it.
 *
 *     runProviderAcceptanceSuite('Rithmic', createRithmicAcceptanceContext())
 *
 * WHAT PASSING IT DOES NOT MEAN
 * ─────────────────────────────
 * Not that live trading is safe, not that a provider is reliable, not that a
 * credential is least-privilege in production, and not that anything is
 * profitable. It certifies READ-ONLY CONTRACT CONFORMANCE and nothing beyond
 * it. GATE-08 stays open, no order path exists anywhere in this package, and
 * acceptance is not permission to execute.
 *
 * SERVER AND TEST SIDE. Deliberately NOT re-exported from the `@/lib/trading`
 * barrel, for the same reason `provider/` and `provider-normalization/` are
 * not: nothing in the browser has any business holding a provider port, and
 * keeping it off the barrel makes the client payload delta structurally zero.
 *
 * This package never imports `lib/trading/internal/`, where execution authority
 * is issued.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 */

// ─── What an adapter must supply to be certified ──────────────────────────────
export { ACCEPTANCE_AREAS, isInertRecord } from './contract'
export type { AcceptanceArea, ProviderAcceptanceContext } from './contract'

// ─── The reusable invariants ──────────────────────────────────────────────────
export {
  CAPABILITY_OBLIGATIONS,
  availabilityOf,
  exactReading,
  failureCarriesStructuredReason,
  isHonestFailure,
  isKnownFlat,
  meetsSafetyCriticalRequirement,
  obligationFor,
  refusedUnknownReference,
  resolutionWasExplicit,
} from './checks'
export type { CapabilityObligation, ExactReading } from './checks'

// ─── The suite ────────────────────────────────────────────────────────────────
export { runProviderAcceptanceSuite } from './acceptance-suite'

// ─── The first reference adapter's context ────────────────────────────────────
export {
  ACCEPTANCE_INSTRUMENT,
  ACCEPTANCE_INSTRUMENT_MAPPINGS,
  ACCEPTANCE_POSITIONS,
  ACCEPTANCE_REPLAY_METADATA,
  acceptanceTranscript,
  createRecordedAcceptanceContext,
} from './recorded-context'
