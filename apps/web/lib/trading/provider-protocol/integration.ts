/**
 * Omnira Trading — the only supported way to build a protocol session.
 *
 * WHY THIS EXISTS AT ALL
 * ──────────────────────
 * A protocol session is safe only while something ends its lifetime whenever
 * R1A's link stops being usable. Leaving that to the caller — "remember to
 * observe the runtime, remember to rotate, remember to end" — is a rule that
 * holds until the first integration written under time pressure.
 *
 * So the safe composition is the ONLY composition. `createProtocolIntegration`
 * builds the fan-out, the session, the runtime and the binding together, and the
 * package root exports no way to build a session without it. There is no
 * ordering for a caller to get wrong and no step to forget, because there are no
 * steps: the binding is installed before the runtime is returned, and the
 * runtime cannot be connected before it is returned.
 *
 * IT ALSO SOLVES A CIRCULARITY, RATHER THAN LEAVING IT TO THE CALLER
 * ─────────────────────────────────────────────────────────────────
 * The runtime needs an `AuthenticationStep`; that step needs the session; the
 * session's binding needs the runtime. Wired by hand this becomes a `let`
 * assigned after construction and used before it — the sort of thing that works
 * until someone reorders two lines. Here the step is simply handed the session
 * as its first argument.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 * It schedules nothing, retries nothing, classifies nothing and decides nothing.
 * It reads `model.state` and `model.generation` — two facts R1A publishes — and
 * translates them into begin/end on a lifetime. Every judgement about what those
 * facts MEAN stays where the retry budget, the close classification and the
 * reason codes already live.
 */

import {
  createProviderSessionRuntime,
  type AuthenticationContext,
  type AuthenticationResult,
  type ProviderSessionRuntime,
  type ProviderSessionRuntimeOptions,
  type ProviderTransport,
  type SessionState,
} from '../provider-runtime'
import type { ProtocolCodec } from './codec'
import { createFanOutTransport } from './fan-out'
import {
  createProtocolSession,
  type BoundProtocolSession,
  type ProtocolFactListener,
} from './session'
import type { SessionRole, SupervisedSession } from './supervisor'

/**
 * The states in which an attempt can carry protocol traffic.
 *
 * `CONNECTING` is DELIBERATELY EXCLUDED. An earlier draft included it on the
 * theory that starting early was safer, but during CONNECTING there is no open
 * wire, so the only thing a lifetime could do is accept a frame that belongs to
 * no attempt — the exact thing everything else here prevents. Nothing needs it:
 * the only consumer of session state during an attempt is the authentication
 * step, and R1A's OPEN branch reads
 *
 *     dispatch({ type: 'TRANSPORT_OPENED', generation })   // → AUTHENTICATING
 *     void runAuthentication(generation)
 *
 * — observers run synchronously inside that dispatch, so a lifetime beginning at
 * AUTHENTICATING is already in force before the step exists. A test asserts that
 * from a recorded trace rather than from this reading.
 *
 * Everything else — DISCONNECTED, CONNECTING, RECONNECTING, DISCONNECTING,
 * FAILED — ends the lifetime immediately. Three of those are reachable WITHOUT
 * the generation advancing, which is why observing the generation alone is not
 * enough.
 */
const USABLE: readonly SessionState[] = ['AUTHENTICATING', 'READY', 'DEGRADED']

/** An authentication step, handed the session it is expected to speak through. */
export type BoundAuthenticationStep<Outbound, Inbound, Key> = (
  session: BoundProtocolSession<Outbound, Inbound, Key>,
  context: AuthenticationContext,
) => Promise<AuthenticationResult>

/**
 * Everything R1A needs, minus the two things this module supplies itself.
 *
 * `transport` is replaced by the raw transport (the fan-out is built here, so it
 * cannot be forgotten), and `authenticate` is replaced by the bound form above.
 */
export type ProtocolIntegrationOptions<Outbound, Inbound, Key> =
  Omit<ProviderSessionRuntimeOptions, 'transport' | 'authenticate'> & {
    readonly role: SessionRole
    /** The raw transport. It is wrapped for fan-out here, exactly once. */
    readonly transport: ProviderTransport
    readonly codec: ProtocolCodec<Outbound, Inbound>
    readonly correlationKeyOf?: (message: Inbound) => Key | null
    readonly capacity?: number
    readonly onFact?: ProtocolFactListener
    readonly authenticate: BoundAuthenticationStep<Outbound, Inbound, Key>
  }

export interface ProtocolIntegration<Outbound, Inbound, Key> extends SupervisedSession {
  readonly role: SessionRole
  readonly runtime: ProviderSessionRuntime
  readonly session: BoundProtocolSession<Outbound, Inbound, Key>
  /** Release the binding, the session and the fan-out. Idempotent. */
  dispose(): void
}

export function createProtocolIntegration<Outbound, Inbound, Key>(
  options: ProtocolIntegrationOptions<Outbound, Inbound, Key>,
): ProtocolIntegration<Outbound, Inbound, Key> {
  const fan = createFanOutTransport(options.transport)

  /*
   * Subscribed to the transport at construction, before any connect — a
   * protocol that answers in the same tick as the request would otherwise
   * deliver its response before anyone was listening.
   */
  const session = createProtocolSession<Outbound, Inbound, Key>({
    transport: fan,
    codec: options.codec,
    correlationKeyOf: options.correlationKeyOf,
    capacity: options.capacity,
    onFact: options.onFact,
  })

  const runtime = createProviderSessionRuntime({
    ...options,
    transport: fan,
    authenticate: (context) => options.authenticate(session, context),
  })

  /*
   * THE BINDING.
   *
   * R1A dispatches synchronously, and its OPEN branch is `dispatch(...)` and
   * then `runAuthentication(...)` — so this observer has already run by the time
   * an authentication step can touch session state. The generation advances one
   * step earlier still, in the reducer branch that starts an attempt. A test
   * asserts that order from a trace the participants record themselves rather
   * than trusting the reading.
   */
  const unobserve = runtime.observe((model) => {
    if (USABLE.includes(model.state)) session.beginLifetime(model.generation)
    else session.endLifetime()
  })

  // A runtime that is already running when bound: adopt its current state.
  if (USABLE.includes(runtime.model.state)) session.beginLifetime(runtime.model.generation)

  let disposed = false
  return {
    role: options.role,
    runtime,
    session,
    dispose() {
      if (disposed) return
      disposed = true
      // Unobserve first: teardown must not be reported back into a dying session.
      unobserve()
      session.dispose()
      fan.dispose()
    },
  }
}
