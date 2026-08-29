/**
 * Omnira Trading Core — event and journal foundation.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §29 (append-oriented audit trail), §36 (replayability)
 *  - Datamodell v0.1 §54 (SystemEvent), §55 (correlation), §56 (auditability), §57 (immutability)
 *
 * The trail must later answer, for any executed trade: what data did the system
 * see, which strategy version ran, which rules passed, what did AI say, what did
 * Risk and Prop decide, who approved, what intent was sent, what came back.
 * (Datamodell §56.)
 *
 * INVARIANTS:
 *  - Events are append-only and frozen. Nothing rewrites history.
 *  - `occurredAt` (when it happened) is distinct from `recordedAt` (when we
 *    learned). Collapsing them destroys the ability to detect delayed reporting.
 *  - `correlationId` threads one lifecycle; `causationId` names the immediate
 *    predecessor. Together they reconstruct the chain, not just the set.
 *  - Every event carries environment. An event that cannot say which environment
 *    it came from cannot be trusted in performance statistics (Datamodell §50).
 *
 * PHASE 1 SCOPE: the envelope and its invariants. No storage, no transport, no
 * journal database — that arrives with the Journal layer.
 */

import type { TradingEnvironment } from './environment'
import type { AccountId, CorrelationId, EventId, StrategyVersionId } from './ids'
import type { Timestamp } from './time'

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

/**
 * Event severity. Technical system health is kept separate from trading
 * performance (Systemarkitektur §35), so a denied trade is INFO, not ERROR —
 * a correctly blocked loss is not a system fault (Risk v0.1 §79).
 */
export const EVENT_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
export type EventSeverity = (typeof EVENT_SEVERITIES)[number]

/** The entity kinds an event can be about. */
export const EVENT_ENTITY_TYPES = [
  'THESIS', 'SETUP', 'SIGNAL', 'AI_ANALYSIS', 'RISK_DECISION', 'PROP_DECISION',
  'PROPOSAL', 'APPROVAL', 'EXECUTION_INTENT', 'ORDER', 'FILL', 'POSITION',
  'TRADE', 'KILL_SWITCH', 'RUNNER', 'INCIDENT',
] as const
export type EventEntityType = (typeof EVENT_ENTITY_TYPES)[number]

/**
 * Event types for the lifecycle Phase 1 can actually observe.
 *
 * Deliberately narrow. Fill, position-management and exit events belong to the
 * phases that produce them; inventing their names now would freeze vocabulary
 * for behaviour that has not been designed.
 */
export const EVENT_TYPES = [
  'SETUP_CREATED',
  'SIGNAL_CREATED',
  'AI_ANALYSIS_RECORDED',
  'RISK_DECIDED',
  'RISK_DENIED',
  'PROP_DECIDED',
  'PROP_DENIED',
  'PROPOSAL_CREATED',
  'PROPOSAL_STATUS_CHANGED',
  'PROPOSAL_EXPIRED',
  'APPROVAL_RECORDED',
  'EXECUTION_GATE_OPENED',
  'EXECUTION_GATE_REFUSED',
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_CLEARED',
  'INCIDENT_RAISED',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

// ─── Envelope ─────────────────────────────────────────────────────────────────

/**
 * One append-only journal record.
 *
 * `payload` is deliberately `unknown`: Core does not own the shape of every
 * future event body, and pretending otherwise would force later phases to widen
 * this type. `payloadVersion` is what makes an opaque payload readable years
 * later.
 */
export interface TradingEvent {
  readonly eventId: EventId
  readonly eventType: EventType
  readonly entityType: EventEntityType
  readonly entityId: string
  readonly occurredAt: Timestamp
  readonly recordedAt: Timestamp
  readonly correlationId: CorrelationId
  readonly causationId: EventId | null
  readonly environment: TradingEnvironment
  readonly accountId: AccountId | null
  readonly strategyVersionId: StrategyVersionId | null
  readonly sourceComponent: string
  readonly severity: EventSeverity
  readonly payloadVersion: string
  readonly payload: unknown
}

/** Freeze an event. Append-only means the record never changes after this. */
export function tradingEvent(event: TradingEvent): TradingEvent {
  return Object.freeze({ ...event })
}

/**
 * Order events for reconstruction.
 *
 * Sorts by `occurredAt`, then `recordedAt`, then `eventId`. The tiebreakers
 * matter: two events can share a millisecond, and a reconstruction that is not
 * total is not reproducible.
 */
export function orderEvents(events: readonly TradingEvent[]): readonly TradingEvent[] {
  return [...events].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
    if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1
    if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1
    return 0
  })
}

/** All events belonging to one lifecycle, in reconstruction order. */
export function eventsForCorrelation(
  events: readonly TradingEvent[],
  correlationId: CorrelationId,
): readonly TradingEvent[] {
  return orderEvents(events.filter((e) => e.correlationId === correlationId))
}

/**
 * Follow the causation chain backwards from one event.
 *
 * Returns oldest-first. Guards against cycles: a malformed chain that points at
 * itself must terminate, not hang.
 */
export function causationChain(
  events: readonly TradingEvent[],
  from: EventId,
): readonly TradingEvent[] {
  const byId = new Map(events.map((e) => [e.eventId, e]))
  const chain: TradingEvent[] = []
  const seen = new Set<EventId>()
  let cursor: EventId | null = from
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor)
    const event: TradingEvent | undefined = byId.get(cursor)
    if (event === undefined) break
    chain.push(event)
    cursor = event.causationId
  }
  return chain.reverse()
}

// ─── Deterministic serialization ──────────────────────────────────────────────

/**
 * Serialize with keys sorted at every depth.
 *
 * Two structurally identical events must produce byte-identical output
 * regardless of key insertion order, otherwise hashing and replay comparison
 * are meaningless (Systemarkitektur §37).
 *
 * `undefined` is dropped, matching JSON.stringify. Cycles throw rather than
 * silently truncating.
 *
 * A repeated reference is NOT a cycle. An event payload may legitimately reach
 * the same object twice — two fields sharing one value object, a value that
 * appears in both an object and a list — and that structure is a DAG with a
 * finite serialization. Only a reference that is its own ancestor cannot
 * terminate.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new WeakSet()))
}

/**
 * `ancestors` is the ACTIVE RECURSION PATH, not everything seen so far.
 *
 * That distinction is the whole cycle test: an object is added on the way down
 * and removed on the way back up, so membership means "this object is currently
 * an ancestor of itself", which is exactly a cycle. A set that only ever grew
 * would instead mean "seen anywhere in the document", and would reject a shared
 * sibling reference that serializes perfectly well.
 *
 * Still a `WeakSet`: it already supports the `delete` this needs, so the fix is
 * a change of meaning rather than a change of collection.
 */
function canonicalize(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value
  }
  if (ancestors.has(value)) throw new Error('canonicalJson: circular reference')
  ancestors.add(value)

  // `finally` rather than a plain `delete` after the loop, so the path unwinds
  // even when a value deeper in the walk throws.
  //
  // Today that is defensive rather than load-bearing: `canonicalJson` builds a
  // fresh ancestry per top-level call and nothing catches inside the recursion,
  // so a throw abandons the whole call anyway. It is written this way because
  // scope-based cleanup is what makes `ancestors` genuinely path-scoped instead
  // of merely usually-path-scoped — and it stays correct if this ever gains an
  // internal catch or a caller-supplied set.
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalize(item, ancestors))
    }

    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      const field = source[key]
      if (field === undefined) continue
      out[key] = canonicalize(field, ancestors)
    }
    return out
  } finally {
    ancestors.delete(value)
  }
}
