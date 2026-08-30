/**
 * Omnira Trading — the Level-1 provider observation types.
 *
 * Transcription of Execution Provider Adapter Canonical v1.2:
 *   §3.1  ProviderCapabilities · F7 HistoryWindowCapability
 *   §7.1  ContractSnapshot        §7.2  HistoryRequest · FillHistory
 *   F3    ProviderHealth          F4    ProviderConfig · ProviderSession
 *   F5    ProviderIdentity        F6    ProviderClock
 *   F8    AccountRef · ProviderAccountSnapshot
 *   F9    ContractSpec · ContractRef
 *   F10   PositionSnapshot        F11   OrderSnapshot · FillSnapshot
 *   F12   ReadOnlyReconciliation
 *
 * EVERYTHING HERE IS READONLY (v1.2 §7, §10)
 * ──────────────────────────────────────────
 * "Observationer är immutabla. En snapshot beskriver ett ögonblick och ändras
 * aldrig i efterhand." §10 locks what that means in TypeScript: readonly fields
 * and readonly collections on every provider fact. The adapter *instance* is not
 * required to be immutable — it holds a session — but nothing a consumer
 * receives can be edited after the fact.
 *
 * These are records, not authority. v1.2 §2: a provider observation is a record
 * exactly as a `RiskDecision` is, and records cannot mint `RiskClearance`,
 * `PropClearance`, `ApprovalGrant` or `ExecutionIntent`.
 */

import type { AccountId, FillId, InstrumentId, OrderId, PositionId } from '../ids'
import type { Decimal } from '../decimal'
import type { TradingEnvironment } from '../environment'
import type { Timestamp } from '../time'
import type { Verdict } from '../authority'
import type { ReasonCode } from '../reason-codes'
import type {
  Available,
  CapabilityState,
  ContractId,
  CredentialMode,
  ProviderId,
  ProviderTimestamp,
} from './primitives'

// ─── F4 Session ───────────────────────────────────────────────────────────────

/**
 * What the generic port needs to open a session.
 *
 * No hostname, no password, no API key, no token, no URL. `credentialSecretRef`
 * follows the Datamodell §8 pattern: the database holds a REFERENCE to secret
 * storage, never the secret. v1.2 F4 marks it "opak referens, ALDRIG en
 * hemlighet".
 *
 * `environment` is required and never defaulted, because §6 forbids
 * `getEnvironment()` returning a default and the configuration has to say which
 * environment is being asked for.
 */
export interface ProviderConfig {
  readonly providerId: ProviderId
  readonly environment: TradingEnvironment
  readonly credentialSecretRef: string
}

/**
 * An established session.
 *
 * A FROZEN RECORD, NOT A HANDLE. It has no methods, carries no token, and cannot
 * be invoked. Holding one is not authority: `ExecutionIntent` is still minted
 * only by `openExecutionGate`, which requires three unforgeable capabilities,
 * and a session is not among its inputs (v1.2 §2, F4).
 *
 * `resolvedCredentialMode` is the mode the provider actually supplied. Where it
 * is broader than least privilege, §4 requires `SECURITY_DEGRADED` on the health
 * surface. The comparison is against least privilege — there is no requested
 * mode at Level 1.
 */
export interface ProviderSession {
  readonly providerId: ProviderId
  readonly sessionRef: string
  readonly environment: TradingEnvironment
  readonly resolvedCredentialMode: CredentialMode
  readonly establishedAt: Timestamp
}

// ─── F5 Identity ──────────────────────────────────────────────────────────────

/**
 * Who the provider is.
 *
 * Identifier and label are kept apart, per Datamodell §4: identifiers must not
 * be derived from names. `displayLabel` is human-readable and is never an
 * identifier. Session and credential identity are deliberately absent — a
 * provider identity that carried them would depend on who was logged in.
 */
export interface ProviderIdentity {
  readonly providerId: ProviderId
  readonly displayLabel: string
  readonly environment: TradingEnvironment
  readonly providerVersion: Available<string>
  readonly observedAt: Timestamp
}

// ─── F3 Health ────────────────────────────────────────────────────────────────

/**
 * The provider's reported health.
 *
 * A structured surface that CONTAINS a Verdict, resolving what v1.2 F3 records
 * as a contradiction in v1.0: §7 implied a bare `Verdict`, while §4 required
 * `SECURITY_DEGRADED` to be reportable here, which a three-value enum cannot
 * carry.
 *
 * `SECURITY_DEGRADED` rides in `reasonCodes`. What v1.2 deliberately does NOT
 * decide is whether a given downstream policy must fail closed because of that
 * degradation — health reports state; the authority chain decides consequences.
 * Nothing in this type pre-empts that in either direction.
 *
 * An empty `reasonCodes` with `verdict: 'ALLOW'` is a positive statement of
 * health. It is not the same as `verdict: 'UNKNOWN'`, which means health could
 * not be established.
 */
export interface ProviderHealth {
  readonly verdict: Verdict
  readonly reasonCodes: readonly ReasonCode[]
  readonly observedAt: Timestamp
}

// ─── F6 Clock ─────────────────────────────────────────────────────────────────

/**
 * A reading of the provider's clock.
 *
 * v1.2 F6: skew is MEASURED, never assumed — an UNKNOWN skew never becomes 0.
 * There is no wall-clock fallback: if the provider reports no time, the call
 * fails with a `ProviderError` rather than substituting a local instant.
 *
 * That the provider reported a time is not a claim that the time is correct.
 * The contract carries the reading, not a judgement about it.
 */
export interface ProviderClock {
  readonly providerTime: ProviderTimestamp
  readonly observedAt: Timestamp
  readonly skewMs: Available<Decimal>
}

// ─── §3.1 / F7 Capabilities ───────────────────────────────────────────────────

/**
 * How far back the provider will serve fill history.
 *
 * v1.2 §7.2 states that no assumption of unlimited history exists anywhere, and
 * defines `HistoryRequest.cursor` / `FillHistory.nextCursor` — so whether the
 * provider honours a cursor is a capability question. `maxPageSize` was proposed
 * and rejected at review (F7); page-size limits arrive when a real provider
 * requirement needs them.
 */
export interface HistoryWindowCapability {
  readonly state: CapabilityState
  readonly maxLookbackMs: Available<Decimal>
  readonly supportsCursor: CapabilityState
}

/**
 * What this provider can report. Fourteen fields, exactly as §3.1.
 *
 * An OBSERVATION, not a permission. §3.1: "Den skapar aldrig behörighet, och
 * ingenting i Trading Core härleder auktoritet ur den."
 */
export interface ProviderCapabilities {
  readonly readOnlyCredentialMode: CredentialMode
  readonly accountSnapshots: CapabilityState
  readonly positions: CapabilityState
  readonly workingOrders: CapabilityState
  readonly fills: CapabilityState
  readonly fillHistoryWindow: HistoryWindowCapability
  readonly contractDiscovery: CapabilityState
  readonly contractTickSize: CapabilityState
  readonly contractTickValue: CapabilityState
  readonly contractMultiplier: CapabilityState
  readonly providerTime: CapabilityState
  readonly streamingState: CapabilityState
  readonly reconciliation: CapabilityState
  readonly observedAt: Timestamp
}

// ─── F8 Accounts ──────────────────────────────────────────────────────────────

/** An account the provider exposes. `providerAccountRef` is opaque above the adapter. */
export interface AccountRef {
  readonly accountId: AccountId
  readonly providerAccountRef: string
  readonly environment: TradingEnvironment
  readonly displayLabel: Available<string>
}

/**
 * Account state as the provider reports it.
 *
 * NOT the persistence `AccountSnapshot` of Datamodell §65, and never aliased to
 * it (v1.2 F8.1). The two are different claims about the world: one is what
 * Omnira stores, the other is what a provider said at an instant, with
 * `Available<T>` wherever providers legitimately differ.
 *
 * Three §65 fields are deliberately absent, per F8.3: `daily_pnl` and `drawdown`
 * are Omnira-derived — Datamodell §66 keeps daily risk state separate precisely
 * because prop firms compute it differently — and `open_positions` is answered
 * by `getPositions`, where duplicating it would create two sources that can
 * disagree.
 *
 * No provider snapshot may carry an Omnira-derived value disguised as a
 * provider fact.
 */
export interface ProviderAccountSnapshot {
  readonly accountId: AccountId
  readonly providerAccountRef: string
  readonly environment: TradingEnvironment
  readonly currency: Available<string>
  readonly balance: Available<Decimal>
  readonly equity: Available<Decimal>
  readonly realizedPnl: Available<Decimal>
  readonly unrealizedPnl: Available<Decimal>
  readonly margin: Available<Decimal>
  readonly freeMargin: Available<Decimal>
  readonly observedAt: Timestamp
  readonly providerTime: Available<ProviderTimestamp>
}

// ─── F9 / §7.1 Contracts ──────────────────────────────────────────────────────

/**
 * What to resolve. Resolution is by EXPLICIT MAPPING, never heuristic.
 *
 * v1.2 F9: if the spec does not identify exactly one contract — neither
 * `expiration` nor `providerSymbol` is PRESENT and no locked series policy
 * exists — the call fails with `INVALID_INSTRUMENT_STATE`. It never guesses.
 *
 * Forbidden in any implementation of `resolveContract`: front-month algorithms,
 * continuous-contract mapping, symbol-prefix heuristics such as
 * startsWith("NQ"), and rollover calendars. Those belong to GATE-08, which
 * remains OPEN. This file defines resolution TYPES, not resolution POLICY.
 */
export interface ContractSpec {
  readonly instrumentId: InstrumentId
  readonly canonicalSymbol: string
  readonly expiration: Available<Timestamp>
  readonly providerSymbol: Available<string>
}

export interface ContractRef {
  readonly contractId: ContractId
  readonly instrumentId: InstrumentId
  readonly providerContractId: string
  readonly resolvedAt: Timestamp
}

/**
 * Eleven fields, exactly as §7.1.
 *
 * `source` is written inline, as canon writes it. §7.1 keeps provider
 * observation apart from a future canonical contract specification — "De två får
 * aldrig tyst slås ihop" — and naming the union would add provider vocabulary
 * that v1.2 deliberately does not define.
 */
export interface ContractSnapshot {
  readonly providerContractId: string
  readonly contractId: ContractId
  readonly rootSymbol: Available<string>
  readonly canonicalSymbol: Available<string>
  readonly exchange: Available<string>
  readonly expiration: Available<Timestamp>
  readonly tickSize: Available<Decimal>
  readonly tickValue: Available<Decimal>
  readonly multiplier: Available<Decimal>
  readonly observedAt: Timestamp
  readonly source: 'PROVIDER' | 'CANONICAL_SPEC'
}

// ─── F10 Positions ────────────────────────────────────────────────────────────

/**
 * The direction of an ACTUAL position. Nothing else.
 *
 * There is no FLAT, and v1.2 F10 is explicit about why. Known flat is a property
 * of the observation as a whole, not a position's direction:
 *
 *     KNOWN FLAT  =  a successful getPositions()  +  an empty readonly array
 *
 * Allowing `PositionSnapshot(side = FLAT)` as well would give two
 * representations of one reality, and therefore two ways for a consumer to
 * miscount. A flat account is never represented by fabricating a snapshot.
 */
export const POSITION_SIDES = ['LONG', 'SHORT', 'UNKNOWN'] as const
export type PositionSide = (typeof POSITION_SIDES)[number]

export const POSITION_STATES = ['OPEN', 'CLOSED', 'UNKNOWN'] as const
export type PositionState = (typeof POSITION_STATES)[number]

/**
 * A position as the provider reports it.
 *
 * Independent of the persisted `Position` in Datamodell §40, which carries
 * `originating_trade_id` — a field no provider can know. It is also not replay's
 * `ObservedPosition`: `unattributed`, `freshness` and `note` are replay-layer
 * judgements or presentation, and as provider fields they would be Omnira
 * opinions disguised as observations (v1.2 F10.2).
 *
 * FRESHNESS IS DERIVED, NOT OBSERVED (F10.3). It is a function of `observedAt`
 * and a reference instant the consumer supplies — never read from a wall clock
 * inside a normalization, because a normalization that reads `Date.now()`
 * produces a different answer on every run and cannot be reproduced in a
 * journal.
 *
 * `instrumentId` is `Available` on purpose: a position can be observed before
 * contract resolution succeeds, and requiring it would make GATE-08 block
 * observation itself.
 */
export interface PositionSnapshot {
  readonly positionId: PositionId
  readonly providerPositionRef: string
  readonly accountId: AccountId
  readonly contractId: ContractId
  readonly instrumentId: Available<InstrumentId>
  readonly side: PositionSide
  readonly state: PositionState
  readonly quantity: Available<Decimal>
  readonly averageEntry: Available<Decimal>
  readonly lastPrice: Available<Decimal>
  readonly unrealizedPnl: Available<Decimal>
  readonly stopLoss: Available<Decimal>
  readonly takeProfit: Available<Decimal>
  readonly openedAt: Available<Timestamp>
  readonly observedAt: Timestamp
  readonly providerTime: Available<ProviderTimestamp>
}

// ─── F11 Orders and fills ─────────────────────────────────────────────────────

export const ORDER_SIDES = ['BUY', 'SELL', 'UNKNOWN'] as const
export type OrderSide = (typeof ORDER_SIDES)[number]

/**
 * `OTHER` is deliberate: a provider may report an order type Omnira does not
 * model, and forcing it into MARKET would be a silent mistranslation. `UNKNOWN`
 * means something different — that the type was not reported at all.
 */
export const ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT', 'OTHER', 'UNKNOWN'] as const
export type OrderType = (typeof ORDER_TYPES)[number]

/**
 * Broader than "working" on purpose. `getWorkingOrders` returns what the
 * provider considers live; a snapshot taken in the same instant as a fill then
 * never has to lie about what it saw.
 */
export const ORDER_STATUSES = [
  'WORKING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'UNKNOWN',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** An observation. NOT an order command — nothing here can be sent anywhere. */
export interface OrderSnapshot {
  readonly orderId: OrderId
  readonly providerOrderRef: string
  readonly accountId: AccountId
  readonly contractId: ContractId
  readonly side: OrderSide
  readonly orderType: OrderType
  readonly status: OrderStatus
  readonly quantity: Available<Decimal>
  readonly filledQuantity: Available<Decimal>
  readonly limitPrice: Available<Decimal>
  readonly stopPrice: Available<Decimal>
  readonly submittedAt: Available<Timestamp>
  readonly observedAt: Timestamp
  readonly providerTime: Available<ProviderTimestamp>
}

/**
 * An observation. NOT an execution request.
 *
 * `spread_cost` and `slippage` from Datamodell §39 are absent: both are
 * Omnira-derived analytics requiring a reference the provider does not have.
 * `orderId` is `Available` because a provider does not always correlate a fill
 * back to its order.
 */
export interface FillSnapshot {
  readonly fillId: FillId
  readonly providerFillRef: string
  readonly accountId: AccountId
  readonly contractId: ContractId
  readonly orderId: Available<OrderId>
  readonly side: OrderSide
  readonly quantity: Available<Decimal>
  readonly price: Available<Decimal>
  readonly commission: Available<Decimal>
  readonly fee: Available<Decimal>
  readonly filledAt: Available<Timestamp>
  readonly observedAt: Timestamp
  readonly providerTime: Available<ProviderTimestamp>
}

// ─── §7.2 History ─────────────────────────────────────────────────────────────

export interface HistoryRequest {
  readonly from: Timestamp
  readonly to: Timestamp
  readonly cursor?: string
}

/**
 * v1.2 §7.2: TRUNCATED and UNKNOWN are both acceptable Phase 2 outcomes, "så
 * länge de rapporteras ärligt i stället för att presenteras som COMPLETE".
 */
export const HISTORY_COMPLETENESS = ['COMPLETE', 'TRUNCATED', 'UNKNOWN'] as const
export type HistoryCompleteness = (typeof HISTORY_COMPLETENESS)[number]

/**
 * Five fields, exactly as §7.2.
 *
 * The request windows are written inline, as canon writes them. Naming the
 * `{ from, to }` shape would add provider vocabulary v1.2 does not define.
 */
export interface FillHistory {
  readonly fills: readonly FillSnapshot[]
  readonly requested: {
    readonly from: Timestamp
    readonly to: Timestamp
  }
  readonly actual: Available<{
    readonly from: Timestamp
    readonly to: Timestamp
  }>
  readonly completeness: HistoryCompleteness
  readonly nextCursor: string | null
}

// ─── F12 Reconciliation ───────────────────────────────────────────────────────

/**
 * v1.2 F12 locks the invariant that mirrors known-flat:
 *
 *     AGREED        + []  =  the comparison ran and everything matched
 *     INDETERMINATE + []  =  the comparison could not be carried out
 *
 * An empty discrepancy list means nothing without its status.
 */
export const RECONCILIATION_STATUSES = ['AGREED', 'DISCREPANCY', 'INDETERMINATE'] as const
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number]

export const DISCREPANCY_KINDS = [
  'POSITION_MISSING_AT_PROVIDER',
  'POSITION_MISSING_IN_OMNIRA',
  'POSITION_QUANTITY_MISMATCH',
  'POSITION_SIDE_MISMATCH',
  'ORDER_MISSING_AT_PROVIDER',
  'ORDER_MISSING_IN_OMNIRA',
  'UNKNOWN',
] as const
export type DiscrepancyKind = (typeof DISCREPANCY_KINDS)[number]

/** `detail` is operator text. Like `ProviderError.message`, never decision input. */
export interface ReconciliationDiscrepancy {
  readonly kind: DiscrepancyKind
  readonly reasonCode: ReasonCode
  readonly contractId: Available<ContractId>
  readonly positionId: Available<PositionId>
  readonly orderId: Available<OrderId>
  readonly detail: string
}

/**
 * The result of comparing Omnira's view against the provider's.
 *
 * At Level 1, reconcile means COMPARE AND REPORT. v1.2 F12 forbids repairing
 * state, mutating provider state, cancelling orders, closing positions and
 * creating `ExecutionIntent`. Datamodell §68 blocks new execution while a
 * critical discrepancy stands — but that is a decision taken ABOVE the adapter
 * on the strength of this report. The adapter reports; it neither blocks nor
 * remediates.
 */
export interface ReadOnlyReconciliation {
  readonly accountId: AccountId
  readonly status: ReconciliationStatus
  readonly discrepancies: readonly ReconciliationDiscrepancy[]
  readonly startedAt: Timestamp
  readonly completedAt: Timestamp
  readonly observedAt: Timestamp
}
