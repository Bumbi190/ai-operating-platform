/**
 * Omnira Trading — provider protocol foundation, public surface.
 *
 * Import from `@/lib/trading/provider-protocol`, not from the modules beneath
 * it. That is not a style preference here: several modules under this directory
 * are deliberately unreachable from outside, and a guard fails the build if
 * anything in the repository deep-imports one.
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The provider-neutral machinery that sits between R1A's session runtime and a
 * future provider's protocol: a codec boundary, a session that turns frames into
 * typed messages, optional correlation, and the binding that keeps that session's
 * lifetime tied to the runtime that owns the connection.
 *
 *     ExecutionProviderAdapter
 *         ↓
 *     Provider integration
 *         ↓
 *     ProtocolSession  +  ProtocolCodec        ← THIS PACKAGE
 *         ↓
 *     ProviderTransport / ProviderSessionRuntime (R1A, unchanged)
 *
 * THERE IS EXACTLY ONE WAY TO BUILD A SESSION
 * ───────────────────────────────────────────
 * `createProtocolIntegration`. It builds the fan-out, the session, the runtime
 * and the lifecycle binding in one call, so there is no ordering to get wrong
 * and no step to forget.
 *
 * The raw constructors — `createProtocolSession`, `createFanOutTransport`,
 * `createCorrelationRegistry` — are NOT exported, and neither is any lifetime
 * control. A session whose lifetime nothing ends is unsafe the moment R1A stops
 * being usable: pending work would sit waiting for a generation that may never
 * advance, and frames from a finished link would look like current traffic.
 * Exporting a constructor that can produce one would make that outcome
 * reachable by accident, and this package has zero production consumers today —
 * which makes now the cheapest possible moment to close it.
 *
 * WHAT IT IS NOT
 * ──────────────
 * It is not a provider and names none. There is no protocol here either — only
 * the shape one must take. The single codec that ships is a synthetic JSON toy
 * for tests, invented in this repository and derived from nothing.
 *
 * R1A IS UNTOUCHED. This package adds zero lines to `provider-runtime/`. Where it
 * needed a guarantee R1A's contract does not make — that two subscribers can
 * observe one transport — it manufactures that guarantee ABOVE the contract with
 * an internal fan-out wrapper, rather than editing a locked boundary.
 *
 * FIVE BOUNDARIES THIS PACKAGE DOES NOT CROSS
 * ───────────────────────────────────────────
 * POLICY. Reconnect, retry, backoff, close intent and heartbeat timing stay in
 * R1A. A session reports facts; it never decides what they warrant.
 *
 * GENERATION. R1A alone decides which transport attempt is current, and alone
 * decides when one has stopped being usable. The binding OBSERVES both and
 * translates them into begin/end on a lifetime. Nothing here computes either.
 *
 * AUTHORITY. Nothing here can mint a RiskClearance, PropClearance, ApprovalGrant
 * or ExecutionIntent. A decoded message is a message.
 *
 * CAPABILITY. A successful exchange promotes nothing to SUPPORTED.
 *
 * EXECUTION. There is no method that could place, modify or cancel an order —
 * not even a disabled one, because a disabled method is one someone can enable.
 */

// ─── The one supported way to build a session ─────────────────────────────────
export { createProtocolIntegration } from './integration'
export type {
  BoundAuthenticationStep,
  ProtocolIntegration,
  ProtocolIntegrationOptions,
} from './integration'

// ─── Codec boundary ───────────────────────────────────────────────────────────
export { CODEC_REFUSALS, decodeRefused, decoded, encodeRefused, encoded } from './codec'
export type { CodecRefusal, DecodeOutcome, EncodeOutcome, ProtocolCodec } from './codec'

// ─── Consumer-facing session types ────────────────────────────────────────────
export { PROTOCOL_FACTS } from './session'
export type {
  AwaitOutcome,
  AwaitRefusal,
  BoundProtocolSession,
  ProtocolFact,
  ProtocolFactKind,
  ProtocolFactListener,
  SendOutcome,
  SendRefusal,
} from './session'

// ─── Correlation vocabulary ───────────────────────────────────────────────────
/*
 * The key SOURCE is public — a deterministic counter is useful to any
 * integration and can do no harm. The registry CONSTRUCTOR is not: it is the
 * piece a hand-rolled session would be built from.
 */
export { OPEN_REFUSALS, PENDING_CANCELLATIONS, SETTLE_OUTCOMES, createCounterKeys } from './correlation'
export type {
  OpenOutcome,
  OpenRefusal,
  PendingCancellation,
  PendingResult,
  SettleOutcome,
} from './correlation'

// ─── Transport wrapper type ───────────────────────────────────────────────────
export type { FanOutTransport } from './fan-out'

// ─── Supervision ──────────────────────────────────────────────────────────────
export { createSessionSupervisor, sessionRole } from './supervisor'
export type { ConnectSequenceOutcome, SessionRole, SessionSupervisor, SupervisedSession } from './supervisor'

// ─── Synthetic test protocol ──────────────────────────────────────────────────
/*
 * Shipped the way R1A ships its fake transport: a known-good implementation a
 * future provider package's tests can check their own wiring against. It is a
 * codec, not a session — it cannot produce an unbound lifetime.
 */
export {
  FAKE_REJECTIONS,
  createFakeCodec,
  fakeCorrelationKey,
  fakeFrame,
  garbageFrame,
} from './fake-protocol'
export type { FakeInbound, FakeOutbound, FakeRejection } from './fake-protocol'
