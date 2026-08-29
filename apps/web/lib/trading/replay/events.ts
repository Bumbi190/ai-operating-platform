/**
 * Omnira Trading — the replay event timeline.
 *
 * Events here are OBSERVATIONS AND STATE TRANSITIONS, never execution authority.
 * An event says "this was seen" or "this became true"; none of them grants
 * permission to do anything, and no constructor in this file can produce a
 * clearance, a grant or an intent.
 *
 * RELATIONSHIP TO THE CANONICAL JOURNAL
 * ─────────────────────────────────────
 * Trading Core already owns the journal envelope: `TradingEvent`, with its
 * `eventId` / `occurredAt` / `recordedAt` / `correlationId` / `causationId` /
 * `payloadVersion` invariants (Datamodell §54–57). This module does not invent a
 * competing one. It mirrors those field names exactly, and `toTradingEvent`
 * converts an event that has a canonical counterpart into a real `TradingEvent`.
 *
 * What it deliberately does NOT do is widen Core's `EVENT_TYPES`. That list is
 * documented as narrow on purpose — "inventing their names now would freeze
 * vocabulary for behaviour that has not been designed" — and market-observation
 * types like CANDLE_ADVANCED are exactly that behaviour. So observations carry
 * `journal: null` and stay outside the canonical taxonomy until the Journal
 * layer decides how to name them. Trading Core is untouched by this package.
 *
 * DETERMINISM
 * ───────────
 * Event ids are derived from scenario + sequence, never generated. `newId()`
 * would be both non-deterministic and a `node:crypto` import, and neither
 * belongs on a client-reachable replay path.
 */

import { canonicalJson, type EventEntityType, type EventType, type TradingEvent } from '../events'
import type { CorrelationId, EventId } from '../ids'
import type { Timestamp, TradingEnvironment } from '../market-view'
import type { MarketInstrument, PriceText } from '../market-view'
import type { SetupLifecycle } from './lifecycle'

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

/**
 * What a replay event reports.
 *
 * Split into two families on purpose:
 *
 *  - MARKET OBSERVATIONS — what the data showed. These have no canonical
 *    journal type yet and carry `journal: null`.
 *  - DECISION/STATE REPORTS — the reported outcome of something a decision
 *    layer produced. These map onto Core's `EVENT_TYPES`.
 */
export const REPLAY_EVENT_TYPES = [
  // Market observations
  'CANDLE_ADVANCED',
  'SESSION_WINDOW_CHANGED',
  'LIQUIDITY_OBSERVED',
  'FVG_STATE_CHANGED',
  'MANIPULATION_OBSERVED',
  'CONFIRMATION_CHANGED',
  'DATA_FRESHNESS_CHANGED',
  'THESIS_UPDATED',
  // Reported decisions and lifecycle
  'SETUP_LIFECYCLE_CHANGED',
  'PLANNED_TRADE_CREATED',
  'PLANNED_TRADE_UPDATED',
  'PLANNED_TRADE_BLOCKED',
  'PLANNED_TRADE_EXPIRED',
  'RISK_STATE_REPORTED',
  'PROP_STATE_REPORTED',
  // Externally observed position state
  'OBSERVED_POSITION_OPENED',
  'OBSERVED_POSITION_UPDATED',
  'OBSERVED_POSITION_CLOSED',
] as const
export type ReplayEventType = (typeof REPLAY_EVENT_TYPES)[number]

/**
 * The canonical journal type an event maps onto, where one exists.
 *
 * `null` is a real answer, not a gap to be filled in later by guessing: it means
 * Core has deliberately not named this kind of event yet.
 */
const JOURNAL_MAPPING: Readonly<
  Record<ReplayEventType, { eventType: EventType; entityType: EventEntityType } | null>
> = {
  CANDLE_ADVANCED: null,
  SESSION_WINDOW_CHANGED: null,
  LIQUIDITY_OBSERVED: null,
  FVG_STATE_CHANGED: null,
  MANIPULATION_OBSERVED: null,
  CONFIRMATION_CHANGED: null,
  DATA_FRESHNESS_CHANGED: null,
  THESIS_UPDATED: null,
  SETUP_LIFECYCLE_CHANGED: { eventType: 'SETUP_CREATED', entityType: 'SETUP' },
  PLANNED_TRADE_CREATED: { eventType: 'PROPOSAL_CREATED', entityType: 'PROPOSAL' },
  PLANNED_TRADE_UPDATED: { eventType: 'PROPOSAL_STATUS_CHANGED', entityType: 'PROPOSAL' },
  PLANNED_TRADE_BLOCKED: { eventType: 'PROPOSAL_STATUS_CHANGED', entityType: 'PROPOSAL' },
  PLANNED_TRADE_EXPIRED: { eventType: 'PROPOSAL_EXPIRED', entityType: 'PROPOSAL' },
  RISK_STATE_REPORTED: { eventType: 'RISK_DECIDED', entityType: 'RISK_DECISION' },
  PROP_STATE_REPORTED: { eventType: 'PROP_DECIDED', entityType: 'PROP_DECISION' },
  // A position observed at a provider is not one Omnira caused. Core has no
  // event type for "someone else's fill showed up in our account".
  OBSERVED_POSITION_OPENED: null,
  OBSERVED_POSITION_UPDATED: null,
  OBSERVED_POSITION_CLOSED: null,
}

export function journalMappingFor(type: ReplayEventType) {
  return JOURNAL_MAPPING[type]
}

/** Where an event came from. Stage 1.5 can only produce FIXTURE. */
export const EVENT_ORIGINS = ['FIXTURE', 'SIMULATION', 'LIVE'] as const
export type EventOrigin = (typeof EVENT_ORIGINS)[number]

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CandleAdvancedPayload {
  /** Index into the scenario's candle series that is now the latest bar. */
  readonly candleIndex: number
}

export interface ConfirmationChangedPayload {
  readonly confirmation: 'liquiditySweep' | 'iFvg' | 'cisd' | 'smt'
  /** PresenceState for the first three; SmtState for `smt`. */
  readonly state: string
  readonly note: string | null
}

export interface LifecycleChangedPayload {
  readonly from: SetupLifecycle
  readonly to: SetupLifecycle
  readonly reason: string
}

export interface PlannedTradePayload {
  readonly plannedTradeId: string
  readonly entry: PriceText | null
  readonly stopLoss: PriceText | null
  readonly takeProfit: PriceText | null
  readonly breakEven: PriceText | null
  readonly riskReward: PriceText | null
  readonly reason: string
}

export interface ObservedPositionPayload {
  readonly positionId: string
  readonly note: string | null
}

export interface FreshnessChangedPayload {
  readonly freshness: 'FRESH' | 'STALE' | 'UNKNOWN'
  readonly observedAt: Timestamp | null
}

/** Structured, never free text alone. A string field is always accompanied. */
export type ReplayEventPayload =
  | CandleAdvancedPayload
  | ConfirmationChangedPayload
  | LifecycleChangedPayload
  | PlannedTradePayload
  | ObservedPositionPayload
  | FreshnessChangedPayload
  | Record<string, unknown>

// ─── The envelope ─────────────────────────────────────────────────────────────

/**
 * One replay event.
 *
 * Field names mirror `TradingEvent` so the journal conversion is a rename-free
 * mapping. `sequence` is additional: replay needs a total order that does not
 * depend on two events sharing a millisecond.
 */
export interface ReplayEvent {
  /** Deterministic: `${scenarioId}:${sequence}`. Never generated. */
  readonly eventId: string
  /** Position in the scenario timeline, from 0. Total ordering. */
  readonly sequence: number
  readonly scenarioId: string
  readonly type: ReplayEventType
  readonly instrument: MarketInstrument
  /** Market time — when it happened. Never wall-clock time. */
  readonly occurredAt: Timestamp
  /** When the system learned it. Equal to `occurredAt` for fixtures. */
  readonly recordedAt: Timestamp
  /** Threads one opportunity's lifecycle across events. */
  readonly correlationId: string
  /** The immediate predecessor, or null for the first of a chain. */
  readonly causationId: string | null
  readonly environment: TradingEnvironment
  readonly origin: EventOrigin
  /** Which component produced it. Provenance, in Core's own field name. */
  readonly sourceComponent: string
  readonly payloadVersion: string
  readonly payload: ReplayEventPayload
  /** Operator-facing line. A projection of the payload, never the only record. */
  readonly summary: string
}

/** Build a deterministic event id. Exported so fixtures and tests agree. */
export function replayEventId(scenarioId: string, sequence: number): string {
  return `${scenarioId}:${String(sequence).padStart(4, '0')}`
}

/**
 * Freeze an event.
 *
 * Append-only means the record never changes after this, which is what lets a
 * replay recompute state from history rather than mutate it.
 */
export function replayEvent(event: ReplayEvent): ReplayEvent {
  return Object.freeze({ ...event })
}

// ─── Ordering and serialization ───────────────────────────────────────────────

/**
 * Total order over a timeline.
 *
 * By `occurredAt`, then `sequence`, then `eventId`. The tiebreakers matter for
 * the same reason they matter in Core: two events can share a millisecond, and
 * a reconstruction that is not total is not reproducible.
 */
export function orderReplayEvents(events: readonly ReplayEvent[]): readonly ReplayEvent[] {
  return [...events].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
    if (a.sequence !== b.sequence) return a.sequence - b.sequence
    if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1
    return 0
  })
}

/**
 * Canonical serialization, delegated to Core's `canonicalJson`.
 *
 * Keys sorted at every depth, so two structurally identical timelines produce
 * byte-identical output regardless of key insertion order.
 */
export function serializeTimeline(events: readonly ReplayEvent[]): string {
  return canonicalJson(events)
}

/** Every event belonging to one opportunity, in reconstruction order. */
export function eventsForCorrelation(
  events: readonly ReplayEvent[],
  correlationId: string,
): readonly ReplayEvent[] {
  return orderReplayEvents(events.filter((event) => event.correlationId === correlationId))
}

// ─── Journal conversion ───────────────────────────────────────────────────────

export interface JournalConversionContext {
  /** When the journal recorded it. Passed in — never read from a clock here. */
  readonly recordedAt: Timestamp
}

/**
 * Convert a replay event into a canonical `TradingEvent`.
 *
 * Returns null for market observations, which have no canonical type yet —
 * a deliberate refusal to invent one rather than a failure.
 *
 * The id casts are safe and type-only: `EventId` and `CorrelationId` are branded
 * strings, and `ids.ts` is imported for its types alone. Value-importing it
 * would pull `node:crypto` into the client bundle.
 */
export function toTradingEvent(
  event: ReplayEvent,
  context: JournalConversionContext,
): TradingEvent | null {
  const mapping = JOURNAL_MAPPING[event.type]
  if (mapping === null) return null

  return Object.freeze({
    eventId: event.eventId as unknown as EventId,
    eventType: mapping.eventType,
    entityType: mapping.entityType,
    entityId: event.correlationId,
    occurredAt: event.occurredAt,
    recordedAt: context.recordedAt,
    correlationId: event.correlationId as unknown as CorrelationId,
    causationId: event.causationId === null ? null : (event.causationId as unknown as EventId),
    environment: event.environment,
    // Fixtures have no account and no strategy version. Null is the honest
    // answer; a placeholder would be indistinguishable from a real one later.
    accountId: null,
    strategyVersionId: null,
    sourceComponent: event.sourceComponent,
    severity: event.type === 'PLANNED_TRADE_BLOCKED' ? 'WARNING' : 'INFO',
    payloadVersion: event.payloadVersion,
    payload: event.payload,
  })
}

/** Every event on a timeline that a journal could record today. */
export function journalableEvents(
  events: readonly ReplayEvent[],
  context: JournalConversionContext,
): readonly TradingEvent[] {
  const out: TradingEvent[] = []
  for (const event of orderReplayEvents(events)) {
    const converted = toTradingEvent(event, context)
    if (converted !== null) out.push(converted)
  }
  return out
}
