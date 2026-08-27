/**
 * Omnira Trading Core — ExecutionIntent shape and vocabulary.
 *
 * PUBLIC, AND DELIBERATELY INERT. This module declares what an execution intent
 * *is*. It cannot produce one.
 *
 * Intents are created only by the execution gate in
 * `lib/trading/internal/execution-gate.ts`, which requires authority
 * capabilities that only `lib/trading/internal/authority.ts` can issue. Neither
 * is re-exported from `@/lib/trading`.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §24 (execution intent), §17 (gateway)
 *  - Datamodell v0.1 §36 (fields), §37 (status set)
 *
 * INVARIANTS:
 *  - No exported constructor. There is intentionally no `executionIntent(...)`
 *    helper here — such a function would hand out the very thing the gate exists
 *    to control.
 *  - Immutable once created (Datamodell §36).
 *  - `idempotencyKey` ensures a retry or network fault cannot turn one intent
 *    into two positions (Systemarkitektur §24).
 */

import type { AuthorityMode } from './authority'
import type { Decimal } from './decimal'
import type { TradingEnvironment } from './environment'
import type { AccountId, ExecutionId, InstrumentId, ProposalId, RunnerId } from './ids'
import type { Timestamp } from './time'

/** Order types the gateway may express. Core selects none of them. */
export const ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP'] as const
export type OrderType = (typeof ORDER_TYPES)[number]

/** Execution lifecycle states (Datamodell §37). */
export const EXECUTION_STATUSES = [
  'CREATED',
  'DISPATCHED',
  'RECEIVED',
  'REVALIDATING',
  'DENIED',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'FILLED',
  'PARTIALLY_FILLED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
  'RECONCILED',
] as const
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]

/**
 * The only object an Execution Runner may act on.
 *
 * `maximumAllowedDeviation` is carried but NOT enforced by Core — the threshold
 * is GATE-12, still open. The Execution Gateway must enforce it in Fas 6 once
 * that gate closes.
 */
export interface ExecutionIntent {
  readonly executionId: ExecutionId
  readonly proposalId: ProposalId
  readonly accountId: AccountId
  readonly instrumentId: InstrumentId
  readonly runnerId: RunnerId
  readonly environment: TradingEnvironment
  readonly authorityMode: AuthorityMode
  readonly side: 'BUY' | 'SELL'
  readonly quantity: Decimal
  readonly orderType: OrderType
  readonly expectedEntry: Decimal
  readonly maximumAllowedDeviation: Decimal | null
  readonly stopLoss: Decimal
  readonly takeProfit: Decimal
  readonly createdAt: Timestamp
  readonly expiresAt: Timestamp
  readonly idempotencyKey: string
  readonly status: ExecutionStatus
}
