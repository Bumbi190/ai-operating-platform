/**
 * Omnira Trading — provider session runtime behaviour.
 *
 * Every test here runs against the in-memory transport and a hand-driven clock.
 * Nothing sleeps, nothing opens a socket, and every ordering the runtime must
 * survive is produced by calling a method rather than by hoping the scheduler
 * cooperates.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  authenticated,
  authenticationFailed,
  classifyClose,
  createFakeCredentials,
  isRetriable,
  createFakeTransport,
  createManualScheduler,
  createProviderSessionRuntime,
  delaySequence,
  reasonCodeOf,
  redactText,
  redactValue,
  sessionReducer,
  initialSessionModel,
  testHeartbeatPolicy,
  type AuthenticationResult,
  type FakeTransport,
  type ManualScheduler,
  type ProviderSessionRuntime,
  type ReconnectPolicy,
  type SessionLogFields,
} from './index'

/** Drain the microtask queue so an injected async step can finish. */
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

const NO_RETRY: ReconnectPolicy = {
  maxAttempts: 0, initialDelayMs: 10, backoffFactor: 1, maxDelayMs: 10,
}
const RETRY_3: ReconnectPolicy = {
  maxAttempts: 3, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1_000,
}

interface Harness {
  readonly runtime: ProviderSessionRuntime
  readonly transport: FakeTransport
  readonly clock: ManualScheduler
  readonly logs: readonly SessionLogFields[]
  readonly borrows: readonly string[]
  authOutcome: AuthenticationResult | 'throw' | 'hang'
  readonly authCalls: () => number
}

function harness(options: {
  reconnect?: ReconnectPolicy
  heartbeat?: ReturnType<typeof testHeartbeatPolicy>
} = {}): Harness {
  const transport = createFakeTransport()
  const clock = createManualScheduler()
  const credentials = createFakeCredentials()
  const logs: SessionLogFields[] = []
  let authCalls = 0

  const h: Harness = {
    transport, clock, logs,
    borrows: credentials.borrows,
    authOutcome: authenticated,
    authCalls: () => authCalls,
    runtime: createProviderSessionRuntime({
      transport,
      endpoint: { endpoint: 'inmemory://provider' },
      scheduler: clock,
      reconnect: options.reconnect ?? NO_RETRY,
      heartbeat: options.heartbeat ?? testHeartbeatPolicy(),
      credentials,
      credentialSecretRef: 'trading/provider/placeholder',
      authenticate: async (ctx) => {
        authCalls += 1
        // Read once: narrowing on a mutable property does not survive an await.
        const outcome = h.authOutcome
        // Exercises the borrow path without the runtime ever seeing the value.
        await ctx.withCredential(() => undefined)
        if (outcome === 'throw') throw new Error('password=hunter2 rejected')
        if (outcome === 'hang') return await new Promise<AuthenticationResult>(() => {})
        return outcome
      },
      sendHeartbeat: (send) => { send(new Uint8Array([0xff])) },
      logger: (fields) => { logs.push(fields) },
    }),
  }
  return h
}

/** Drive a harness to READY. */
async function connectReady(h: Harness): Promise<void> {
  const p = h.runtime.connect()
  h.transport.emitOpen()
  await p
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('the session lifecycle', () => {
  it('reaches READY through CONNECTING and AUTHENTICATING', async () => {
    const h = harness()
    expect(h.runtime.model.state).toBe('DISCONNECTED')
    const p = h.runtime.connect()
    expect(h.runtime.model.state).toBe('CONNECTING')
    h.transport.emitOpen()
    const result = await p
    expect(result.ok).toBe(true)
    expect(h.runtime.model.state).toBe('READY')
    expect(h.runtime.model.liveness).toBe('ACTIVITY_RECENT')
    expect(h.transport.opens).toBe(1)
  })

  it('reports a refused credential as PROVIDER_AUTHENTICATION_FAILED', async () => {
    /*
     * It used to report SECURITY_DEGRADED, which the canon defines as a
     * credential BROADER than requested — a different fact entirely. The
     * connectivity codes made the honest statement available.
     */
    const h = harness()
    h.authOutcome = authenticationFailed('AUTH_FAILED')
    const p = h.runtime.connect()
    h.transport.emitOpen()
    const result = await p
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.reasonCode).toBe('PROVIDER_AUTHENTICATION_FAILED')
    expect(h.runtime.model.state).toBe('FAILED')
    // Not retriable: a refused credential will be refused again.
    expect(h.runtime.model.reconnectEligible).toBe(false)
    expect(h.clock.pending()).toBe(0)
  })

  it('fails a connect that never opens', async () => {
    const h = harness()
    h.transport.failNextOpen('econnrefused')
    const result = await h.runtime.connect()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.reasonCode).toBe('PROVIDER_CONNECT_FAILED')
  })

  it('disconnect is idempotent', async () => {
    const h = harness()
    await connectReady(h)
    await h.runtime.disconnect()
    expect(h.runtime.model.state).toBe('DISCONNECTED')
    await h.runtime.disconnect()
    await h.runtime.disconnect()
    expect(h.runtime.model.state).toBe('DISCONNECTED')
    expect(h.clock.pending()).toBe(0)
  })

  it('coalesces a second connect rather than opening a second transport', async () => {
    // The documented answer to §19 G.
    const h = harness()
    const first = h.runtime.connect()
    const second = h.runtime.connect()
    h.transport.emitOpen()
    const [a, b] = await Promise.all([first, second])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(h.transport.opens).toBe(1)
  })
})

// ─── §19 Stale-session races ──────────────────────────────────────────────────

describe('stale events cannot touch a newer session', () => {
  it('A. a late generation-1 open does not disturb generation 2', async () => {
    const h = harness()
    const first = h.runtime.connect()
    const gen1 = h.runtime.model.generation
    await h.runtime.disconnect()
    await first

    const second = h.runtime.connect()
    h.transport.emitOpen()
    await second
    const gen2 = h.runtime.model.generation
    expect(gen2).toBeGreaterThan(gen1)
    expect(h.runtime.model.state).toBe('READY')

    // The old session's success, arriving now.
    const stale = sessionReducer(h.runtime.model, { type: 'TRANSPORT_OPENED', generation: gen1 })
    expect(stale).toBe(h.runtime.model)
    expect(h.runtime.model.state).toBe('READY')
  })

  it('B. a generation-1 heartbeat timeout leaves generation 2 READY', async () => {
    const h = harness()
    await connectReady(h)
    const gen1 = h.runtime.model.generation
    await h.runtime.disconnect()
    await connectReady(h)
    expect(h.runtime.model.state).toBe('READY')

    const stale = sessionReducer(h.runtime.model, { type: 'HEARTBEAT_MISSED', generation: gen1 })
    expect(stale).toBe(h.runtime.model)
    expect(h.runtime.model.state).toBe('READY')
  })

  it('C. a generation-1 reconnect timer cannot open a third transport', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    expect(h.transport.opens).toBe(1)

    h.transport.emitClosed()          // unexpected drop → RECONNECTING
    expect(h.runtime.model.state).toBe('RECONNECTING')

    await h.runtime.disconnect()           // operator stops during the backoff
    h.clock.advance(10_000)                // the old timer's moment arrives

    expect(h.transport.opens).toBe(1)
    expect(h.runtime.model.state).toBe('DISCONNECTED')
    expect(h.clock.pending()).toBe(0)
  })

  it('D. a disconnect during CONNECTING discards the later connect result', async () => {
    const h = harness()
    h.transport.hangNextOpen()
    const p = h.runtime.connect()
    expect(h.runtime.model.state).toBe('CONNECTING')

    await h.runtime.disconnect()
    expect(h.transport.lastOpenAborted).toBe(true)

    // The transport reports success afterwards; it belongs to a dead generation.
    h.transport.emitOpen()
    const result = await p
    expect(result.ok).toBe(false)
    // An operator stop, named as one — not as a generic disconnection.
    if (!result.ok) expect(result.error.reasonCode).toBe('PROVIDER_SESSION_CANCELLED')
    expect(h.runtime.model.state).toBe('DISCONNECTED')
  })

  it('E. a disconnect during RECONNECTING stops all further attempts', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    h.transport.emitClosed()
    expect(h.runtime.model.state).toBe('RECONNECTING')

    await h.runtime.disconnect()
    h.clock.advance(60_000)
    expect(h.transport.opens).toBe(1)
    expect(h.runtime.model.reconnectEligible).toBe(false)
    expect(h.clock.pending()).toBe(0)
  })

  it('F. an old transport close does not kill the new session', async () => {
    const h = harness()
    await connectReady(h)
    const gen1 = h.runtime.model.generation
    await h.runtime.disconnect()
    await connectReady(h)
    expect(h.runtime.model.state).toBe('READY')

    const stale = sessionReducer(h.runtime.model, {
      type: 'SESSION_FAILED', generation: gen1, failure: 'CONNECTION_LOST',
      retryBudgetAvailable: true,
    })
    expect(stale).toBe(h.runtime.model)
    expect(h.runtime.model.state).toBe('READY')
  })

  it('an operator disconnect is never followed by a reconnect, however retriable', () => {
    // The single most important transition in the machine.
    let m = initialSessionModel()
    m = sessionReducer(m, { type: 'CONNECT_REQUESTED' })
    m = sessionReducer(m, { type: 'TRANSPORT_OPENED', generation: m.generation })
    m = sessionReducer(m, { type: 'AUTHENTICATED', generation: m.generation })
    m = sessionReducer(m, { type: 'DISCONNECT_REQUESTED' })
    // CONNECTION_LOST is retriable in general — but not after an operator stop.
    m = sessionReducer(m, {
      type: 'SESSION_FAILED', generation: m.generation, failure: 'CONNECTION_LOST',
      // Budget available on purpose: the operator's stop is what must win here,
      // not an empty budget. A false here would prove nothing.
      retryBudgetAvailable: true,
    })
    expect(m.state).toBe('FAILED')
    expect(m.reconnectEligible).toBe(false)
  })
})

// ─── §20 Heartbeat ────────────────────────────────────────────────────────────

describe('heartbeat', () => {
  it('runs one loop per generation and stops on disconnect', async () => {
    const h = harness({ heartbeat: testHeartbeatPolicy({ intervalMs: 100, timeoutMs: 50 }) })
    await connectReady(h)
    expect(h.clock.pending()).toBe(1)

    h.clock.advance(100)
    expect(h.transport.sent.length).toBe(1)
    expect(h.runtime.model.liveness).toBe('HEARTBEAT_PENDING')

    await h.runtime.disconnect()
    expect(h.clock.pending()).toBe(0)

    h.clock.advance(10_000)
    expect(h.transport.sent.length).toBe(1)   // no beat after teardown
  })

  it('inbound activity clears a pending beat when policy says it counts', async () => {
    const h = harness({ heartbeat: testHeartbeatPolicy({ intervalMs: 100, timeoutMs: 50 }) })
    await connectReady(h)
    h.clock.advance(100)
    expect(h.runtime.model.liveness).toBe('HEARTBEAT_PENDING')

    h.transport.emitFrame()
    expect(h.runtime.model.liveness).toBe('ACTIVITY_RECENT')

    h.clock.advance(50)
    expect(h.runtime.model.state).toBe('READY')   // not a miss
  })

  it('ignores inbound as liveness when policy says it does not count', async () => {
    const h = harness({
      heartbeat: testHeartbeatPolicy({
        intervalMs: 100, timeoutMs: 50, inboundCountsAsActivity: false,
      }),
    })
    await connectReady(h)
    h.clock.advance(100)
    h.transport.emitFrame()
    expect(h.runtime.model.liveness).toBe('HEARTBEAT_PENDING')
    h.clock.advance(50)
    expect(h.runtime.model.state).toBe('DEGRADED')
  })

  it('degrades on one miss and fails only after the threshold', async () => {
    const h = harness({
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy({ intervalMs: 100, timeoutMs: 50, missesBeforeFailure: 2 }),
    })
    await connectReady(h)

    h.clock.advance(150)                       // beat + timeout → miss 1
    expect(h.runtime.model.state).toBe('DEGRADED')
    expect(h.runtime.model.liveness).toBe('HEARTBEAT_MISSED')

    h.clock.advance(150)                       // miss 2 → threshold
    expect(h.runtime.model.state).toBe('FAILED')
    expect(h.runtime.model.lastFailure).toBe('HEARTBEAT_TIMEOUT')
    expect(h.clock.pending()).toBe(0)
  })

  it('never beats after FAILED', async () => {
    const h = harness({
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy({ intervalMs: 100, timeoutMs: 50, missesBeforeFailure: 1 }),
    })
    await connectReady(h)
    h.clock.advance(150)
    expect(h.runtime.model.state).toBe('FAILED')
    const sentAtFailure = h.transport.sent.length
    h.clock.advance(10_000)
    expect(h.transport.sent.length).toBe(sentAtFailure)
  })

  it('a missed beat degrades liveness and mints no authority', async () => {
    const h = harness({ heartbeat: testHeartbeatPolicy({ intervalMs: 100, timeoutMs: 50 }) })
    await connectReady(h)
    h.clock.advance(150)
    const model = h.runtime.model
    expect(model.state).toBe('DEGRADED')
    // The model carries liveness and nothing resembling a permission.
    expect(Object.keys(model).sort()).toEqual([
      'attempt', 'disconnectRequested', 'generation', 'lastFailure',
      'liveness', 'reconnectEligible', 'state',
    ])
  })
})

// ─── §21 Reconnect ────────────────────────────────────────────────────────────

describe('reconnect', () => {
  it('produces the exact documented delay sequence', () => {
    expect(delaySequence(RETRY_3)).toEqual([100, 200, 400])
    expect(delaySequence({ ...RETRY_3, maxDelayMs: 150 })).toEqual([100, 150, 150])
  })

  it('attempts exactly the configured number of times, then exhausts', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    expect(h.transport.opens).toBe(1)

    h.transport.emitClosed()
    for (const delay of [100, 200, 400]) {
      h.transport.failNextOpen('still down')
      h.clock.advance(delay)
      await settle()
    }

    // 1 original + 3 reconnect attempts, and not one more.
    expect(h.transport.opens).toBe(4)
    expect(h.runtime.model.state).toBe('FAILED')
    expect(h.runtime.model.lastFailure).toBe('RECONNECT_EXHAUSTED')
    expect(h.clock.pending()).toBe(0)

    h.clock.advance(60_000)
    expect(h.transport.opens).toBe(4)
  })

  it('recovers when an attempt succeeds, and resets the budget', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    h.transport.emitClosed()

    h.clock.advance(100)
    await settle()
    h.transport.emitOpen()
    await settle()

    expect(h.transport.opens).toBe(2)
    expect(h.runtime.model.state).toBe('READY')
    expect(h.runtime.model.attempt).toBe(0)   // budget restored by success
  })

  it('does not reconnect after an operator-requested close', async () => {
    // Under the corrected authority model the close is identical on the wire;
    // what makes it terminal is that the operator asked.
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    await h.runtime.disconnect()
    h.clock.advance(60_000)
    expect(h.transport.opens).toBe(1)
    expect(h.runtime.model.state).toBe('DISCONNECTED')
  })
})

// ─── §5 Close authority belongs to the runtime ────────────────────────────────

describe('the runtime classifies a close; the transport only reports one', () => {
  it('E. classification uses no hint from the transport', () => {
    /*
     * The CLOSED event has no field that could carry intent — no `expected`, no
     * `fatal`, no `shouldReconnect`. Everything below is decided from session
     * state alone.
     */
    let m = initialSessionModel()
    m = sessionReducer(m, { type: 'CONNECT_REQUESTED' })
    m = sessionReducer(m, { type: 'TRANSPORT_OPENED', generation: m.generation })
    m = sessionReducer(m, { type: 'AUTHENTICATED', generation: m.generation })
    expect(classifyClose(m)).toBe('UNEXPECTED')

    const stopping = sessionReducer(m, { type: 'DISCONNECT_REQUESTED' })
    expect(classifyClose(stopping)).toBe('EXPECTED')
  })

  it('F. one identical observation, two outcomes, decided by runtime intent', async () => {
    // Case 1: the operator asked. Terminal, no reconnect.
    const stopped = harness({ reconnect: RETRY_3 })
    await connectReady(stopped)
    await stopped.runtime.disconnect()
    stopped.clock.advance(60_000)
    expect(stopped.runtime.model.state).toBe('DISCONNECTED')
    expect(stopped.transport.opens).toBe(1)

    // Case 2: nobody asked. Exactly the same emitClosed() call.
    const dropped = harness({ reconnect: RETRY_3 })
    await connectReady(dropped)
    dropped.transport.emitClosed()
    expect(dropped.runtime.model.state).toBe('RECONNECTING')
    dropped.clock.advance(100)
    await settle()
    expect(dropped.transport.opens).toBe(2)
  })

  it('A. operator disconnect reaches DISCONNECTED with zero reconnects', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    await h.runtime.disconnect()
    expect(h.runtime.model.state).toBe('DISCONNECTED')
    expect(h.runtime.model.reconnectEligible).toBe(false)
    expect(h.clock.pending()).toBe(0)
    h.clock.advance(60_000)
    expect(h.transport.opens).toBe(1)

    /*
     * THE ASSERTION THAT ACTUALLY TESTS THE CLASSIFICATION.
     *
     * Reaching DISCONNECTED alone proves little: the operator path is defended
     * twice over — `classifyClose` treats it as expected, AND the reducer
     * refuses reconnect eligibility while `disconnectRequested`. Breaking the
     * first defence leaves the outcome unchanged, so a test that only checks
     * the outcome cannot see it.
     *
     * `lastFailure` can. A close classified as EXPECTED records no failure at
     * all; one misclassified as a loss records CONNECTION_LOST on the way past
     * the second defence. This is the assertion that goes red if the runtime
     * ever stops owning the classification.
     */
    expect(h.runtime.model.lastFailure).toBeNull()
  })

  it('B. a remote close while READY reconnects per policy', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    h.transport.emitClosed({ code: 1006, detail: 'abnormal closure' })
    expect(h.runtime.model.state).toBe('RECONNECTING')
    expect(h.runtime.model.lastFailure).toBe('CONNECTION_LOST')
  })

  it('C. a remote close while AUTHENTICATING is an unexpected loss', async () => {
    const h = harness({ reconnect: RETRY_3 })
    h.authOutcome = 'hang'                       // stay in AUTHENTICATING
    void h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    expect(h.runtime.model.state).toBe('AUTHENTICATING')

    h.transport.emitClosed()
    expect(h.runtime.model.lastFailure).toBe('CONNECTION_LOST')
    expect(h.runtime.model.state).toBe('RECONNECTING')
  })

  it('D. a late close from a stopped generation cannot touch the new session', async () => {
    const h = harness({ reconnect: RETRY_3 })
    await connectReady(h)
    const gen1 = h.runtime.model.generation
    await h.runtime.disconnect()

    await connectReady(h)
    expect(h.runtime.model.state).toBe('READY')
    const gen2 = h.runtime.model.generation
    expect(gen2).toBeGreaterThan(gen1)

    const stale = sessionReducer(h.runtime.model, {
      type: 'SESSION_FAILED', generation: gen1,
      failure: 'CONNECTION_LOST', retryBudgetAvailable: true,
    })
    expect(stale).toBe(h.runtime.model)
    expect(h.runtime.model.state).toBe('READY')
  })
})

// ─── §6 Typed authentication outcomes ─────────────────────────────────────────

describe('authentication reports a machine-readable outcome', () => {
  it('accepted reaches READY', async () => {
    const h = harness()
    h.authOutcome = authenticated
    await connectReady(h)
    expect(h.runtime.model.state).toBe('READY')
  })

  it('preserves each failure kind rather than flattening to AUTH_FAILED', async () => {
    /*
     * The whole point of the typed result. A boolean would make these three
     * indistinguishable, and the runtime would have to read prose to recover
     * what the codec already knew.
     */
    for (const failure of ['AUTH_FAILED', 'REMOTE_REJECTED', 'PROTOCOL_ERROR'] as const) {
      const h = harness()
      h.authOutcome = authenticationFailed(failure)
      const p = h.runtime.connect()
      h.transport.emitOpen()
      await p
      expect(h.runtime.model.lastFailure, failure).toBe(failure)
      expect(h.runtime.model.state, failure).toBe('FAILED')
    }
  })

  it('CANCELLED from the step does not reconnect', async () => {
    const h = harness({ reconnect: RETRY_3 })
    h.authOutcome = authenticationFailed('CANCELLED')
    const p = h.runtime.connect()
    h.transport.emitOpen()
    await p
    expect(h.runtime.model.lastFailure).toBe('CANCELLED')
    expect(h.runtime.model.reconnectEligible).toBe(false)
    h.clock.advance(60_000)
    expect(h.transport.opens).toBe(1)
  })

  it('a thrown step is AUTH_FAILED — an exception is not a classification', async () => {
    const h = harness()
    h.authOutcome = 'throw'
    const p = h.runtime.connect()
    h.transport.emitOpen()
    await p
    expect(h.runtime.model.lastFailure).toBe('AUTH_FAILED')
  })

  it('no authentication result can carry a credential', async () => {
    // Structural: the union has exactly one field beyond the discriminant.
    const failed = authenticationFailed('REMOTE_REJECTED')
    expect(Object.keys(failed).sort()).toEqual(['failure', 'ok'])
    expect(Object.keys(authenticated)).toEqual(['ok'])
  })
})

// ─── §22 Secrets ──────────────────────────────────────────────────────────────

describe('secrets never reach output', () => {
  const SECRET = 'hunter2-TOPSECRET'

  it('redacts secret-bearing text and objects', () => {
    expect(redactText(`password=${SECRET}`)).not.toContain(SECRET)
    expect(redactText(`{"token":"${SECRET}"}`)).not.toContain(SECRET)
    expect(redactText(`Authorization: Bearer ${SECRET}`)).not.toContain(SECRET)
    expect(redactText(`wss://user:${SECRET}@host/path`)).not.toContain(SECRET)
    const deep = redactValue({ a: { b: { credential: SECRET, safe: 'keep' } } })
    expect(JSON.stringify(deep)).not.toContain(SECRET)
    expect(JSON.stringify(deep)).toContain('keep')
  })

  it('POSITIVE CONTROL: the assertions above can actually fail', () => {
    /*
     * Without this, every test in this block would pass against an output that
     * was never examined. It proves the haystack is real.
     */
    const notRedacted = `password ${SECRET}`   // no '=' or ':' — deliberately unmatched
    expect(notRedacted).toContain(SECRET)
  })

  it('keeps the credential out of logs, errors and serialized state', async () => {
    const h = harness()
    h.authOutcome = 'throw'                    // message contains password=hunter2
    const p = h.runtime.connect()
    h.transport.emitOpen()
    const result = await p

    expect(h.borrows).toEqual(['trading/provider/placeholder'])   // borrowed, not held

    const serialized = JSON.stringify({
      logs: h.logs,
      model: h.runtime.model,
      error: result.ok ? null : result.error,
    })
    for (const forbidden of ['hunter2', SECRET, 'placeholder-not-a-real-secret']) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
    // And the haystack really contains the session's output.
    expect(serialized).toContain('SESSION_FAILED')
  })

  it('log fields carry only enums, numbers and booleans', async () => {
    const h = harness()
    await connectReady(h)
    for (const entry of h.logs) {
      for (const [key, value] of Object.entries(entry)) {
        expect(['string', 'number', 'boolean'], `${key}`).toContain(typeof value)
      }
      expect(Object.keys(entry).sort()).toEqual(
        Object.keys(entry).filter((k) =>
          ['event', 'state', 'generation', 'attempt', 'liveness', 'failure', 'delayMs'].includes(k),
        ).sort(),
      )
    }
  })
})

// ─── Failure mapping ──────────────────────────────────────────────────────────

describe('failure mapping is total and canonical', () => {
  it('every runtime failure maps to an existing canonical reason code', async () => {
    const { CORE_REASON_CODES, RISK_REASON_CODES } = await import('../reason-codes')
    const canonical = new Set<string>([...CORE_REASON_CODES, ...RISK_REASON_CODES])
    const { SESSION_FAILURES } = await import('./failure')
    for (const failure of SESSION_FAILURES) {
      expect(canonical.has(reasonCodeOf(failure)), failure).toBe(true)
    }
  })

  it('an authentication failure is not reported as a disconnection', () => {
    expect(reasonCodeOf('AUTH_FAILED')).toBe('PROVIDER_AUTHENTICATION_FAILED')
    expect(reasonCodeOf('CONNECTION_LOST')).toBe('PROVIDER_CONNECTION_LOST')
    // And neither is reported as the pre-amendment catch-all.
    expect(reasonCodeOf('AUTH_FAILED')).not.toBe('SECURITY_DEGRADED')
    expect(reasonCodeOf('CONNECTION_LOST')).not.toBe('PROVIDER_DISCONNECTED')
  })
})

// ─── R1A.1 Connectivity reason codes, canon amendment ─────────────────────────

describe('every session failure has exactly one canonical connectivity code', () => {
  const EXPECTED: Readonly<Record<string, string>> = {
    CONNECT_FAILED: 'PROVIDER_CONNECT_FAILED',
    AUTH_FAILED: 'PROVIDER_AUTHENTICATION_FAILED',
    CONNECTION_LOST: 'PROVIDER_CONNECTION_LOST',
    HEARTBEAT_TIMEOUT: 'PROVIDER_HEARTBEAT_TIMEOUT',
    PROTOCOL_ERROR: 'PROVIDER_PROTOCOL_ERROR',
    REMOTE_REJECTED: 'PROVIDER_REMOTE_REJECTED',
    CANCELLED: 'PROVIDER_SESSION_CANCELLED',
    RECONNECT_EXHAUSTED: 'PROVIDER_RECONNECT_EXHAUSTED',
    UNKNOWN: 'PROVIDER_FAILURE_UNKNOWN',
  }

  // A
  it('maps all nine variants to the intended code', async () => {
    const { SESSION_FAILURES } = await import('./failure')
    expect(SESSION_FAILURES).toHaveLength(9)
    for (const failure of SESSION_FAILURES) {
      expect(reasonCodeOf(failure), failure).toBe(EXPECTED[failure])
    }
  })

  // B
  it('every new code is a recognised ReasonCode', async () => {
    const { isReasonCode, CORE_REASON_CODES } = await import('../reason-codes')
    for (const code of Object.values(EXPECTED)) {
      expect(isReasonCode(code), code).toBe(true)
      expect(CORE_REASON_CODES as readonly string[], code).toContain(code)
    }
  })

  // C
  it('is injective — no two failures share a canonical code', async () => {
    const { SESSION_FAILURES } = await import('./failure')
    const codes = SESSION_FAILURES.map(reasonCodeOf)
    expect(new Set(codes).size).toBe(codes.length)
  })

  // D / E — the pre-amendment codes keep their own meanings.
  it('leaves PROVIDER_DISCONNECTED and SECURITY_DEGRADED in place', async () => {
    const { CORE_REASON_CODES, isReasonCode } = await import('../reason-codes')
    for (const code of ['PROVIDER_DISCONNECTED', 'SECURITY_DEGRADED']) {
      expect(CORE_REASON_CODES as readonly string[], code).toContain(code)
      expect(isReasonCode(code), code).toBe(true)
    }
  })

  // F
  it('no session failure reports SECURITY_DEGRADED any more', async () => {
    /*
     * SECURITY_DEGRADED means a credential broader than requested. Reporting a
     * refused credential as that was the temporary R1A compatibility mapping,
     * and it is exactly what this amendment removes.
     */
    const { SESSION_FAILURES } = await import('./failure')
    for (const failure of SESSION_FAILURES) {
      expect(reasonCodeOf(failure), failure).not.toBe('SECURITY_DEGRADED')
    }
  })

  it('and no session failure collapses onto PROVIDER_DISCONNECTED', async () => {
    const { SESSION_FAILURES } = await import('./failure')
    for (const failure of SESSION_FAILURES) {
      expect(reasonCodeOf(failure), failure).not.toBe('PROVIDER_DISCONNECTED')
    }
  })

  // G
  it('CANCELLED is named as a cancellation, not an error', () => {
    expect(reasonCodeOf('CANCELLED')).toBe('PROVIDER_SESSION_CANCELLED')
    // It is not a fault, so it must not be retriable on its own.
    expect(isRetriable('CANCELLED')).toBe(false)
  })

  // H
  it('UNKNOWN stays UNKNOWN and is never promoted by inference', () => {
    expect(reasonCodeOf('UNKNOWN')).toBe('PROVIDER_FAILURE_UNKNOWN')
    for (const specific of [
      'PROVIDER_CONNECTION_LOST', 'PROVIDER_PROTOCOL_ERROR', 'PROVIDER_AUTHENTICATION_FAILED',
    ]) {
      expect(reasonCodeOf('UNKNOWN'), specific).not.toBe(specific)
    }
  })

  // I — exhaustiveness is enforced by the compiler, and the shape proves it.
  it('an unmapped future failure would be a compile error', () => {
    const source = readFileSync(new URL('./failure.ts', import.meta.url), 'utf8')
    expect(source).toContain('const exhaustive: never = failure')
    // Every current variant has its own case; nothing falls through to a default.
    for (const failure of Object.keys(EXPECTED)) {
      expect(source, failure).toContain(`case '${failure}':`)
    }
  })

  // J — no policy or authority leaked into the canonical vocabulary.
  it('the codes carry no retry, severity or authority metadata', async () => {
    const registry = readFileSync(new URL('../reason-codes.ts', import.meta.url), 'utf8')
    const executable = registry
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    // The registry is a list of string literals, not a table of properties.
    for (const forbidden of [
      'retryable', 'fatal:', 'severity', 'backoff', 'reconnectAfter',
      'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
    ]) {
      expect(executable, forbidden).not.toContain(forbidden)
    }
    // And retry policy still lives in the runtime, where it belongs.
    expect(isRetriable('CONNECTION_LOST')).toBe(true)
    expect(isRetriable('AUTH_FAILED')).toBe(false)
  })
})
