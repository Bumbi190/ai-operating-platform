/**
 * Omnira Trading — contract LIFECYCLE facts.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §6 (ContractLifecycle)
 *
 * SUPPLIED FACTS, NEVER DERIVED
 * ─────────────────────────────
 * Every field below is a concrete calendar fact. Canonical v1.0 §6 states it
 * plainly — "Dessa är konkreta kalenderfakta, aldrig härledda ur
 * kvartalscykeln" — and §27.2 supplies the proof: CME's published 2026 table
 * gives the June expiry as 2026-06-18, a Thursday, while that month's third
 * Friday is 2026-06-19. A third-Friday formula would have been wrong for that
 * cycle, and there is no way for arithmetic to know which cycles are the
 * exceptions.
 *
 * So nothing here is computed from `quarterMonth`, from third-Friday
 * arithmetic, from a provider's front-month label, or from parsing a symbol.
 * The values arrive from an authored, versioned calendar or they do not exist.
 *
 * IDENTITY IS NOT HERE. `contract` names which listed contract these facts
 * describe; the facts themselves may be corrected without that contract
 * becoming a different contract (Canonical v1.0 §5).
 */

import type { Timestamp } from '../time'
import type { ResolvedContract } from '../contract-identity'

export interface ContractLifecycle {
  readonly contract: ResolvedContract
  /** When the contract stops trading. An authored fact. */
  readonly lastTradeAt: Timestamp
  /**
   * Reference to the authoritative final-settlement determination.
   *
   * A REFERENCE, not a computation. Omnira does not calculate a settlement
   * price and does not restate an exchange's procedure; it records where the
   * authoritative answer came from.
   */
  readonly finalSettlementRef: string
  /** When this contract becomes the selected one. An authored fact. */
  readonly rollEffectiveAt: Timestamp
  /** Which calendar version supplied these facts. */
  readonly calendarVersion: string
}
