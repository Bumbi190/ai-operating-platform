/**
 * Omnira Trading — the planned trade / proposal view.
 *
 * A PLANNED TRADE IS NOT AN ORDER, AND IT IS NOT A POSITION.
 *
 * It is what the system *would* propose, described for a human to read. It has
 * never been to a broker, it has no broker identity, and there is no way to send
 * it from here. Those are structural facts about this type, not policy:
 *
 *  - no `orderId`, no `brokerOrderId`, no `clientOrderId`
 *  - no method, no callback, no command field of any kind — every member is
 *    readonly data
 *  - no status that means "sent", "working", "filled" or "accepted"
 *
 * The counterpart model is `ObservedPosition`, which describes actual exposure a
 * provider reports. The two are deliberately separate types with no shared base
 * and no conversion between them, because they answer different questions:
 *
 *      PlannedTradeView   "what does the system think is worth doing"
 *      ObservedPosition   "what is actually open, according to the broker"
 *
 * Those can disagree, and when they do, the provider is authoritative about
 * exposure. Merging them into one model would make that disagreement
 * unrepresentable — which is exactly the failure this separation prevents.
 */

import type {
  DisplayDirection,
  DisplaySetupGrade,
  MarketInstrument,
  MarketProposalStatus,
  PriceText,
  PropDisplayStatus,
  RiskEngineStatus,
  Timestamp,
  TradingSession,
} from '../market-view'
import type { SetupLifecycle } from './lifecycle'

/**
 * One planned trade, as the rail will render it.
 *
 * `status` reuses Stage 1's `MarketProposalStatus`, whose every member is
 * non-executable and which has no executable member to drift into.
 */
export interface PlannedTradeView {
  /** Stable within a scenario. Not a broker identifier. */
  readonly plannedTradeId: string
  /** Threads this plan to the events that produced it. */
  readonly correlationId: string
  readonly instrument: MarketInstrument
  readonly direction: DisplayDirection
  readonly grade: DisplaySetupGrade
  readonly lifecycle: SetupLifecycle
  readonly status: MarketProposalStatus

  readonly entry: PriceText | null
  readonly stopLoss: PriceText | null
  readonly takeProfit: PriceText | null
  readonly breakEven: PriceText | null
  readonly riskReward: PriceText | null
  readonly proposedRisk: PriceText | null

  readonly session: TradingSession | null
  /** The thesis this plan hangs on, by correlation, not by embedding it. */
  readonly thesisRef: string | null

  /** All market time. Never wall-clock. */
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
  /** Null where the plan carries no expiry — not "no expiry known". */
  readonly expiresAt: Timestamp | null

  /** Why it is in this status, in the operator's language. */
  readonly reason: string
  /** Reported gate states. Displayed, never evaluated here. */
  readonly riskStatus: RiskEngineStatus
  readonly propStatus: PropDisplayStatus
}

/**
 * Whether a planned trade could be sent. Always false.
 *
 * Total over `MarketProposalStatus`, which has no executable member. A test
 * iterates every member, so introducing one fails loudly rather than quietly
 * flipping this to true.
 */
export function plannedTradeIsExecutable(plan: PlannedTradeView): boolean {
  const status: MarketProposalStatus = plan.status
  return (
    status !== 'OBSERVATION_ONLY'
    && status !== 'SIMULATED'
    && status !== 'NO_EXECUTION_PROVIDER'
  )
}

/**
 * Whether this plan has passed its expiry at a given market instant.
 *
 * The instant is passed in rather than read, so the answer is reproducible.
 * Boundary matches Trading Core's `isExpiredAt`: equal counts as expired,
 * because on a safety boundary the conservative reading is the correct one.
 */
export function plannedTradeExpiredAt(plan: PlannedTradeView, now: Timestamp): boolean {
  if (plan.expiresAt === null) return false
  return Date.parse(now) >= Date.parse(plan.expiresAt)
}
