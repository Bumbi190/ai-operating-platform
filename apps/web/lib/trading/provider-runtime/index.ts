/**
 * Omnira Trading — provider session runtime, public surface.
 *
 * Import from `@/lib/trading/provider-runtime`, not from the modules beneath it.
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The provider-neutral machinery a future execution-provider adapter needs in
 * order to have a session at all: connect, authenticate, stay alive, notice
 * when it dies, decide whether to try again, and stop when asked. It is the
 * middle layer of three:
 *
 *     ExecutionProviderAdapter     — provider semantics (accounts, contracts…)
 *         ↓
 *     ProviderSessionRuntime       — THIS PACKAGE
 *         ↓
 *     ProviderTransport + codec    — provider bytes (a later phase)
 *
 * WHAT IT IS NOT
 * ──────────────
 * It is not an adapter and it is not a provider. Nothing here names a provider,
 * a protocol, a message template, a symbol, an account or an order, and the
 * import-discipline suite asserts that mechanically. It opens no sockets: the
 * only transport shipped is the in-memory fake.
 *
 * THREE BOUNDARIES WORTH STATING PLAINLY
 * ──────────────────────────────────────
 * AUTHORITY. A session reaching READY is evidence that a link exists and was
 * authenticated. It is not permission to do anything. No state here can mint a
 * RiskClearance, PropClearance, ApprovalGrant or ExecutionIntent, and nothing
 * in this package imports the module that issues them.
 *
 * CAPABILITY. A working connection says nothing about what the provider
 * supports. `getPositions` does not become SUPPORTED because a socket opened;
 * capability is separate evidence, gathered by the adapter above.
 *
 * TIME. The scheduler here is a RUNTIME clock, for timers. It is not provider
 * time and may never satisfy `getProviderTime()`. The two are kept in different
 * files with different types precisely so the substitution cannot be made by
 * accident.
 *
 * READ-ONLY. There is no method here that could place, modify or cancel an
 * order, and a guard test fails if one ever appears. The firewall exists now,
 * before any provider is wired in, so the adapter inherits it rather than
 * having to be trusted with it.
 */

// ─── Failure vocabulary ───────────────────────────────────────────────────────
export {
  SESSION_FAILURES,
  authenticated,
  authenticationFailed,
  isRetriable,
  reasonCodeOf,
  sessionError,
} from './failure'
export type { AuthenticationFailure, AuthenticationResult, SessionFailure } from './failure'

// ─── The state machine ────────────────────────────────────────────────────────
export {
  LIVENESS_STATES,
  SESSION_STATES,
  classifyClose,
  heartbeatShouldRun,
  initialSessionModel,
  isCurrent,
  isEstablished,
  mayReconnect,
  sessionReducer,
} from './session-state'
export type { Liveness, SessionAction, SessionModel, SessionState } from './session-state'

// ─── Transport boundary ───────────────────────────────────────────────────────
export type {
  ProviderTransport,
  TransportEndpoint,
  TransportEvent,
  TransportFrame,
  TransportListener,
} from './transport'

// ─── Scheduling ───────────────────────────────────────────────────────────────
export { createManualScheduler } from './scheduler'
export type { ManualScheduler, RuntimeScheduler } from './scheduler'

// ─── Policies ─────────────────────────────────────────────────────────────────
export {
  DEFAULT_RECONNECT_POLICY,
  delayForAttempt,
  delaySequence,
  hasAttemptsLeft,
} from './reconnect'
export type { ReconnectPolicy } from './reconnect'
export { missesExhausted, shouldSendOutbound, testHeartbeatPolicy } from './heartbeat'
export type { HeartbeatPolicy } from './heartbeat'

// ─── Redaction ────────────────────────────────────────────────────────────────
export { REDACTED, describeThrown, redactText, redactValue, silentLogger } from './redaction'
export type { SessionLogFields, SessionLogger } from './redaction'

// ─── The runtime ──────────────────────────────────────────────────────────────
export { createProviderSessionRuntime } from './runtime'
export type {
  AuthenticationContext,
  AuthenticationStep,
  CredentialProvider,
  ProviderSessionRuntime,
  ProviderSessionRuntimeOptions,
} from './runtime'

// ─── Test kit ─────────────────────────────────────────────────────────────────
export { createFakeCredentials, createFakeTransport } from './fake-transport'
export type { FakeTransport } from './fake-transport'
