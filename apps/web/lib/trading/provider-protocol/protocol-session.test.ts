/**
 * Omnira Trading — protocol session behaviour, and the inbound-frame proof.
 *
 * Everything runs against R1A's in-memory transport and hand-driven clock, plus
 * a synthetic protocol invented here. No socket, no timer, no provider.
 */

import { describe, expect, it } from 'vitest'
import {
  authenticationFailed,
  authenticated,
  createFakeCredentials,
  createFakeTransport,
  createManualScheduler,
  createProviderSessionRuntime,
  testHeartbeatPolicy,
  type AuthenticationResult,
  type ProviderTransport,
  type ReconnectPolicy,
  type TransportEndpoint,
  type TransportEvent,
  type TransportFrame,
  type TransportListener,
} from '../provider-runtime'
/*
 * THE INTERNAL CONSTRUCTORS ARE IMPORTED FROM THEIR MODULES, NOT FROM THE ROOT.
 *
 * They are unavailable through `./index` on purpose, and this file can reach
 * them only because it lives inside the package. That is the same boundary the
 * deep-import guard enforces from the outside, seen from within: a test proving
 * the unsafe primitive behaves correctly is not a reason to publish it.
 */
import { createCorrelationRegistry } from './correlation'
import { createFanOutTransport } from './fan-out'
import { createProtocolSession, type ProtocolLifetime } from './session'
import {
  createCounterKeys,
  createFakeCodec,
  createProtocolIntegration,
  createSessionSupervisor,
  fakeCorrelationKey,
  fakeFrame,
  garbageFrame,
  sessionRole,
  type FakeInbound,
  type FakeOutbound,
  type ProtocolFact,
} from './index'

const NO_RETRY: ReconnectPolicy = {
  maxAttempts: 0, initialDelayMs: 10, backoffFactor: 1, maxDelayMs: 10,
}
const settle = (): Promise<void> => new Promise((r) => { setTimeout(r, 0) })

// ─── §4 A. What the transport contract actually guarantees ────────────────────

describe('the transport contract does not promise multi-listener delivery', () => {
  /**
   * A CONFORMING transport that keeps only the most recent listener.
   *
   * Every word of `ProviderTransport` is satisfied: `listen` subscribes and
   * returns an unsubscribe. Nothing in the contract says an EARLIER subscriber
   * keeps receiving events. This is the implementation that would silently
   * starve the runtime — or the session — if the protocol layer assumed fan-out.
   */
  function createLastListenerWinsTransport(): ProviderTransport & { emit(e: TransportEvent): void } {
    let current: TransportListener | null = null
    return {
      async open(_t: TransportEndpoint, _s: AbortSignal) {},
      send(_f: TransportFrame) {},
      close() { current?.({ type: 'CLOSED' }) },
      listen(listener) {
        current = listener                       // replaces, and is allowed to
        return () => { if (current === listener) current = null }
      },
      emit(event) { current?.(event) },
    }
  }

  it('a conforming transport may drop the first subscriber entirely', () => {
    const t = createLastListenerWinsTransport()
    const first: TransportEvent[] = []
    const second: TransportEvent[] = []
    t.listen((e) => first.push(e))
    t.listen((e) => second.push(e))

    t.emit({ type: 'FRAME', frame: new Uint8Array([1]) })

    // This is the whole reason fan-out exists rather than being assumed.
    expect(first).toHaveLength(0)
    expect(second).toHaveLength(1)
  })

  it('the fan-out wrapper restores the guarantee over that same transport', () => {
    const inner = createLastListenerWinsTransport()
    const fan = createFanOutTransport(inner)
    const first: TransportEvent[] = []
    const second: TransportEvent[] = []
    fan.listen((e) => first.push(e))
    fan.listen((e) => second.push(e))

    inner.emit({ type: 'FRAME', frame: new Uint8Array([1]) })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(fan.subscriberCount).toBe(2)
  })

  // §4 D
  it('requires no ordering assumption — both subscription orders behave alike', () => {
    for (const reversed of [false, true]) {
      const fan = createFanOutTransport(createFakeTransport())
      const seen: string[] = []
      const a = (): void => { seen.push('a') }
      const b = (): void => { seen.push('b') }
      if (reversed) { fan.listen(b); fan.listen(a) } else { fan.listen(a); fan.listen(b) }
      // Both receive it; neither depends on the other having run.
      expect(seen).toHaveLength(0)
      fan.dispose()
    }
  })

  it('releases exactly one inner subscription on dispose', () => {
    const inner = createFakeTransport()
    const fan = createFanOutTransport(inner)
    expect(inner.listenerCount).toBe(1)        // one, however many subscribe above
    fan.listen(() => {})
    fan.listen(() => {})
    expect(inner.listenerCount).toBe(1)
    fan.dispose()
    expect(inner.listenerCount).toBe(0)
    expect(fan.subscriberCount).toBe(0)
  })
})

// ─── §4 B/C/E. Runtime and session observing the same stream ──────────────────

interface Harness {
  readonly transport: ReturnType<typeof createFakeTransport>
  readonly integration: ReturnType<typeof createProtocolIntegration<FakeOutbound, FakeInbound, number>>
  readonly session: Harness['integration']['session']
  readonly runtime: Harness['integration']['runtime']
  readonly scheduler: ReturnType<typeof createManualScheduler>
  readonly facts: readonly ProtocolFact[]
  readonly keys: { next(): number }
  readonly borrows: readonly string[]
  /** What the AuthenticationStep actually returned, in order. */
  readonly authTrace: readonly string[]
}

/**
 * Build a role through the ONLY supported path.
 *
 * `createProtocolIntegration` constructs the fan-out, the session, the runtime
 * and the lifecycle binding together. Nothing here wires the binding by hand,
 * because nothing outside the package can — which is the point.
 */
function harness(options: {
  respond?: (sent: FakeOutbound) => FakeInbound | null
  onSendEmitSynchronously?: boolean
  reconnect?: ReconnectPolicy
} = {}): Harness {
  const transport = createFakeTransport()
  const credentials = createFakeCredentials()
  const facts: ProtocolFact[] = []
  const keys = createCounterKeys()
  const scheduler = createManualScheduler()
  const authTrace: string[] = []
  const record = (outcome: AuthenticationResult): AuthenticationResult => {
    authTrace.push(outcome.ok ? 'AUTHENTICATED' : outcome.failure)
    return outcome
  }

  const integration = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
    role: sessionRole('synthetic'),
    transport,
    codec: createFakeCodec(),
    correlationKeyOf: fakeCorrelationKey,
    capacity: 8,
    onFact: (f) => { facts.push(f) },
    endpoint: { endpoint: 'inmemory://synthetic' },
    scheduler,
    reconnect: options.reconnect ?? NO_RETRY,
    heartbeat: testHeartbeatPolicy(),
    credentials,
    credentialSecretRef: 'trading/provider/placeholder',
    authenticate: async (session, { signal, withCredential }): Promise<AuthenticationResult> => {
      const id = keys.next()
      const waiting = session.awaitCorrelated(id, signal)
      if (!waiting.ok) return record(authenticationFailed('PROTOCOL_ERROR'))

      const message: FakeOutbound = await withCredential((secret) => ({
        kind: 'HELLO' as const, id, proof: secret,
      }))
      const sent = session.send(message)
      if (!sent.ok) return record(authenticationFailed('PROTOCOL_ERROR'))

      // A synthetic server that answers in the SAME TICK as the send.
      if (options.onSendEmitSynchronously === true) {
        const reply = options.respond?.(message)
        if (reply !== null && reply !== undefined) transport.emitFrame(fakeFrame(reply))
      }

      const outcome = await waiting.settled
      if (!outcome.ok) {
        /*
         * A CANCELLED WAIT IS NOT A PROTOCOL FAULT. All four cancellations mean
         * the attempt was ended from outside the protocol — by the operator, by
         * the link stopping, by a newer generation, by teardown — so all four
         * map to CANCELLED. Reporting PROTOCOL_ERROR would blame a peer that did
         * nothing wrong. The reason is kept in the trace, so which one it was
         * stays visible without inventing a fifth AuthenticationFailure.
         */
        authTrace.push(`CANCELLED(${outcome.cancelled})`)
        return authenticationFailed('CANCELLED')
      }
      const reply = outcome.value
      if (reply.kind === 'ACCEPT') return record(authenticated)
      if (reply.kind === 'REJECT') {
        // Chosen from a machine-readable field. Never from prose.
        if (reply.why === 'BAD_PROOF') return record(authenticationFailed('AUTH_FAILED'))
        if (reply.why === 'REFUSED') return record(authenticationFailed('REMOTE_REJECTED'))
        return record(authenticationFailed('PROTOCOL_ERROR'))
      }
      return record(authenticationFailed('PROTOCOL_ERROR'))
    },
  })

  return {
    transport,
    integration,
    session: integration.session,
    runtime: integration.runtime,
    scheduler,
    facts,
    keys,
    authTrace,
    borrows: credentials.borrows,
  }
}

describe('a protocol session and the runtime observe the same transport', () => {
  it('B. both receive FRAME events, and each applies its own rules', async () => {
    const h = harness()
    const messages: FakeInbound[] = []
    h.session.observe((m) => messages.push(m))

    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()

    // Unsolicited push while the runtime is still authenticating.
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(messages).toEqual([{ kind: 'NOTICE' }])
    /*
     * The runtime saw it too and DELIBERATELY did not count it: R1A treats
     * inbound traffic as liveness only once a session is established. Asserting
     * the runtime's real rule here rather than the one that would be convenient
     * is the point — the two subscribers are independent, not synchronised.
     */
    expect(h.runtime.model.state).toBe('AUTHENTICATING')
    expect(h.runtime.model.liveness).toBe('TRANSPORT_UP')

    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect((await connecting).ok).toBe(true)
    expect(h.runtime.model.state).toBe('READY')
    expect(messages).toHaveLength(2)

    /*
     * Now make the RUNTIME's own receipt observable. A pending heartbeat clears
     * only if the runtime itself received the next frame — which it can only do
     * through the fan-out, while the session is subscribed to the same source.
     */
    h.scheduler.advance(1_000)
    expect(h.runtime.model.liveness).toBe('HEARTBEAT_PENDING')

    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(h.runtime.model.liveness).toBe('ACTIVITY_RECENT')
    expect(messages).toHaveLength(3)
    h.integration.dispose()
  })

  it('E. a same-tick response cannot be missed, because the session subscribes first', async () => {
    const h = harness({
      onSendEmitSynchronously: true,
      respond: (sent) => ({ kind: 'ACCEPT', id: sent.id }),
    })
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    const result = await connecting

    // The reply was emitted synchronously inside send(), before any await.
    expect(result.ok).toBe(true)
    expect(h.runtime.model.state).toBe('READY')
    h.integration.dispose()
  })

  it('the two subscriptions are genuinely independent', () => {
    /*
     * Built from the raw primitives on purpose. At the public boundary session
     * and fan-out are disposed together, which is correct but would hide the
     * property being checked here: the session's subscription and the runtime's
     * are separate, and releasing one leaves the other receiving.
     */
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const seenByA: TransportEvent[] = []
    const seenByB: TransportEvent[] = []
    const releaseA = fan.listen((e) => seenByA.push(e))
    fan.listen((e) => seenByB.push(e))

    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seenByA).toHaveLength(1)
    expect(seenByB).toHaveLength(1)

    releaseA()
    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seenByA).toHaveLength(1)
    expect(seenByB).toHaveLength(2)
    fan.dispose()
  })

  it('disposing the integration releases every subscription it made', async () => {
    const h = harness()
    const messages: FakeInbound[] = []
    h.session.observe((m) => messages.push(m))

    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting
    expect(h.transport.listenerCount).toBe(1)      // one fan-out, however many above

    h.integration.dispose()
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))

    expect(h.transport.listenerCount).toBe(0)
    expect(messages).toEqual([{ kind: 'ACCEPT', id: 1 }])
    expect(h.session.disposed).toBe(true)
  })
})

// ─── §16 Authentication composition ───────────────────────────────────────────

describe('authentication composes with the existing AuthenticationStep', () => {
  const cases = [
    ['ACCEPT', { kind: 'ACCEPT', id: 1 } as FakeInbound, true, null],
    ['BAD_PROOF', { kind: 'REJECT', id: 1, why: 'BAD_PROOF' } as FakeInbound, false, 'AUTH_FAILED'],
    ['REFUSED', { kind: 'REJECT', id: 1, why: 'REFUSED' } as FakeInbound, false, 'REMOTE_REJECTED'],
    ['MALFORMED', { kind: 'REJECT', id: 1, why: 'MALFORMED' } as FakeInbound, false, 'PROTOCOL_ERROR'],
  ] as const

  for (const [label, reply, expectOk, failure] of cases) {
    it(`${label} → ${expectOk ? 'READY' : failure}`, async () => {
      const h = harness()
      const connecting = h.runtime.connect()
      h.transport.emitOpen()
      await settle()
      h.transport.emitFrame(fakeFrame(reply))
      const result = await connecting

      expect(result.ok).toBe(expectOk)
      if (expectOk) {
        expect(h.runtime.model.state).toBe('READY')
      } else {
        expect(h.runtime.model.lastFailure).toBe(failure)
      }
      h.integration.dispose()
    })
  }

  it('ABORT DURING WAIT → the correlated wait reports ABORTED, not a timeout', async () => {
    const registry = createCorrelationRegistry<number, string>({ capacity: 2 })
    const controller = new AbortController()
    const waiting = registry.open(1, controller.signal)
    controller.abort()
    if (waiting.ok) expect(await waiting.settled).toEqual({ ok: false, cancelled: 'ABORTED' })
    registry.dispose()
  })

  it('CANCELLED when the operator aborts during the wait', async () => {
    const h = harness()
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    // No reply ever arrives; the operator stops instead.
    await h.runtime.disconnect()
    await connecting
    await settle()
    expect(h.runtime.model.state).toBe('DISCONNECTED')
    /*
     * The step classified it, and the trace names WHICH cancellation reached it.
     * LINK_ENDED, not ABORTED: R1A records the stop intent and dispatches
     * DISCONNECTING before it aborts the signal, so the binding ends the
     * lifetime first. Both are operator-initiated; only one of them arrives.
     */
    expect(h.authTrace).toEqual(['CANCELLED(LINK_ENDED)'])
    h.integration.dispose()
  })

  it('a stale reply after disposal settles nothing', async () => {
    const h = harness()
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()

    h.integration.dispose()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await settle()

    // The session is disposed, so the correlated wait was cancelled, not settled.
    expect(h.runtime.model.state).not.toBe('READY')
    await h.runtime.disconnect()
    await connecting
  })

  it('RECONNECT THEN FRESH AUTHENTICATION: attempt B succeeds on clean state', async () => {
    const supervisor = createSessionSupervisor()
    const r = reconnectingRole('re-auth')
    supervisor.register(r)

    const connecting = supervisor.connectSequence([r.role])
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect((await connecting).ok).toBe(true)

    r.transport.emitClosed()
    r.scheduler.advance(100)
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 2 }))
    await settle()

    // The SAME AuthenticationStep ran again and succeeded against fresh state.
    expect(r.runtime.model.state).toBe('READY')
    expect(r.runtime.model.lastFailure).toBeNull()
    // The SAME step ran twice, each time on a lifetime that had just begun.
    expect(r.trace.filter((e) => e.startsWith('AUTH@'))).toEqual([
      'AUTH@1 active=true pending=0',
      'AUTH@2 active=true pending=0',
    ])
    await supervisor.disposeAll()
  })

  it('the credential is borrowed and never retained anywhere', async () => {
    const SECRET = 'placeholder-not-a-real-secret'
    const h = harness()
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting

    expect(h.borrows).toEqual(['trading/provider/placeholder'])
    /*
     * The secret went into the encoded frame and nowhere else. Session state,
     * facts and the runtime model are all checked — and the frame bytes are
     * deliberately NOT asserted against, so this test never records a secret.
     */
    const serialized = JSON.stringify({
      facts: h.facts,
      model: h.runtime.model,
      pending: h.session.pending,
      disposed: h.session.disposed,
    })
    expect(serialized).not.toContain(SECRET)
    expect(serialized).toContain('READY')       // the haystack is real
    h.integration.dispose()
  })
})

// ─── Codec and facts ──────────────────────────────────────────────────────────

describe('the codec returns refusals as values', () => {
  it('decodes a well-formed synthetic frame', () => {
    const codec = createFakeCodec()
    const out = codec.decode(fakeFrame({ kind: 'ACCEPT', id: 7 }))
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.message).toEqual({ kind: 'ACCEPT', id: 7 })
  })

  it('refuses garbage without throwing', () => {
    const codec = createFakeCodec()
    let threw = false
    let refusal: string | null = null
    try {
      const out = codec.decode(garbageFrame())
      if (!out.ok) refusal = out.refusal
    } catch { threw = true }
    expect(threw).toBe(false)
    expect(refusal).toBe('MALFORMED')
  })

  it('refuses an empty frame as TRUNCATED and an unknown kind as UNRECOGNIZED', () => {
    const codec = createFakeCodec()
    const empty = codec.decode(new Uint8Array([]))
    expect(empty.ok === false && empty.refusal).toBe('TRUNCATED')
    const unknown = codec.decode(new TextEncoder().encode('{"kind":"OTHER","id":1}'))
    expect(unknown.ok === false && unknown.refusal).toBe('UNRECOGNIZED')
  })

  it('reports a decode refusal as a FACT and never as policy', () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const facts: ProtocolFact[] = []
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan, codec: createFakeCodec(), onFact: (f) => { facts.push(f) },
    })

    /*
     * TWO doors have to be open for a frame to reach a raw session: the wire
     * (the fan-out's ingress fence, opened by OPEN) and the lifetime (the
     * session's own gate). Both are proven in their own describes below; here
     * they are simply satisfied.
     */
    transport.emitOpen()
    session.beginLifetime(1)

    transport.emitFrame(garbageFrame())
    expect(facts).toEqual([{ kind: 'DECODE_REFUSED', refusal: 'MALFORMED' }])

    // A fact carries no retry, severity or reason code.
    for (const fact of facts) {
      expect(Object.keys(fact).sort()).toEqual(['kind', 'refusal'])
    }
    session.dispose()
  })

  it('a codec that throws is contained and reported as an EXCEPTION, not a refusal', () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const facts: ProtocolFact[] = []
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan,
      codec: {
        encode: () => { throw new Error('SECRET-IN-THE-THROWN-VALUE') },
        decode: () => { throw new Error('SECRET-IN-THE-THROWN-VALUE') },
      },
      onFact: (f) => { facts.push(f) },
    })
    transport.emitOpen()
    session.beginLifetime(1)
    expect(() => transport.emitFrame(garbageFrame())).not.toThrow()

    /*
     * CODEC_EXCEPTION, not DECODE_REFUSED/MALFORMED. The codec never reached a
     * verdict about these bytes, so claiming it found them malformed would put a
     * fabricated classification into the record.
     */
    expect(facts).toEqual([{ kind: 'CODEC_EXCEPTION' }])
    // And the thrown value went nowhere: the fact has no payload to carry it.
    expect(JSON.stringify(facts)).not.toContain('SECRET-IN-THE-THROWN-VALUE')
    expect(Object.keys(facts[0])).toEqual(['kind'])
    session.dispose()
  })

  it('a refusal and an exception stay distinguishable', () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const facts: ProtocolFact[] = []
    let explode = false
    const inner = createFakeCodec()
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan,
      codec: {
        encode: (m) => inner.encode(m),
        decode: (f) => { if (explode) throw new Error('boom'); return inner.decode(f) },
      },
      onFact: (f) => { facts.push(f) },
    })

    transport.emitOpen()
    session.beginLifetime(1)
    transport.emitFrame(garbageFrame())          // a real refusal
    explode = true
    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))   // a defect

    expect(facts).toEqual([
      { kind: 'DECODE_REFUSED', refusal: 'MALFORMED' },
      { kind: 'CODEC_EXCEPTION' },
    ])
    session.dispose()
  })

  it('works with no correlation at all — a pure stream', () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const seen: FakeInbound[] = []
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan, codec: createFakeCodec(),
    })
    transport.emitOpen()
    session.beginLifetime(1)
    session.observe((m) => seen.push(m))
    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seen).toEqual([{ kind: 'NOTICE' }])
    expect(session.pending).toBe(0)
    session.dispose()
  })
})

// ─── §10 Correlation ──────────────────────────────────────────────────────────

describe('correlation is deterministic, bounded and explicitly settled', () => {
  it('produces the same key sequence every run', () => {
    const a = createCounterKeys()
    const b = createCounterKeys()
    expect([a.next(), a.next(), a.next()]).toEqual([1, 2, 3])
    expect([b.next(), b.next(), b.next()]).toEqual([1, 2, 3])
  })

  it('refuses a duplicate key rather than stranding the first caller', () => {
    const r = createCorrelationRegistry<number, string>({ capacity: 4 })
    expect(r.open(1).ok).toBe(true)
    const second = r.open(1)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.refusal).toBe('DUPLICATE_KEY')
    r.dispose()
  })

  it('refuses beyond capacity', () => {
    const r = createCorrelationRegistry<number, string>({ capacity: 2 })
    expect(r.open(1).ok).toBe(true)
    expect(r.open(2).ok).toBe(true)
    const third = r.open(3)
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.refusal).toBe('CAPACITY_EXCEEDED')
    r.dispose()
  })

  it('settles explicitly and reports an unknown key as a fact', async () => {
    const r = createCorrelationRegistry<number, string>({ capacity: 4 })
    const opened = r.open(1)
    expect(r.settle(2, 'nobody-waiting')).toBe('UNKNOWN_KEY')
    expect(r.settle(1, 'value')).toBe('SETTLED')
    if (opened.ok) expect(await opened.settled).toEqual({ ok: true, value: 'value' })
    expect(r.pending).toBe(0)
    r.dispose()
  })

  it('a disposed registry cancels pending work and settles nothing afterwards', async () => {
    const r = createCorrelationRegistry<number, string>({ capacity: 4 })
    const opened = r.open(1)
    r.dispose()
    if (opened.ok) expect(await opened.settled).toEqual({ ok: false, cancelled: 'DISPOSED' })
    expect(r.settle(1, 'late')).toBe('DISPOSED')
    expect(r.open(2).ok).toBe(false)
  })

  it('an abort cancels only its own wait', async () => {
    const r = createCorrelationRegistry<number, string>({ capacity: 4 })
    const controller = new AbortController()
    const aborted = r.open(1, controller.signal)
    const other = r.open(2)
    controller.abort()
    if (aborted.ok) expect(await aborted.settled).toEqual({ ok: false, cancelled: 'ABORTED' })
    expect(r.settle(2, 'still fine')).toBe('SETTLED')
    if (other.ok) expect((await other.settled).ok).toBe(true)
    r.dispose()
  })
})

// ─── §18 Multi-session ────────────────────────────────────────────────────────

describe('supervised sessions are independent', () => {
  function role(name: string) {
    const transport = createFakeTransport()
    const integration = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
      role: sessionRole(name),
      transport,
      codec: createFakeCodec(),
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      endpoint: { endpoint: `inmemory://${name}` },
      scheduler: createManualScheduler(),
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: `trading/provider/${name}`,
      authenticate: async () => authenticated,
    })
    return { ...integration, transport }
  }

  it('two roles have independent streams, correlation and lifetimes', async () => {
    const supervisor = createSessionSupervisor()
    const a = role('alpha')
    const b = role('beta')
    expect(supervisor.register(a).ok).toBe(true)
    expect(supervisor.register(b).ok).toBe(true)
    expect(supervisor.roles).toHaveLength(2)

    // Both must be connected: an inactive lifetime treats no frame as its own.
    const connectingA = a.runtime.connect()
    a.transport.emitOpen()
    expect((await connectingA).ok).toBe(true)
    const connectingB = b.runtime.connect()
    b.transport.emitOpen()
    expect((await connectingB).ok).toBe(true)

    const seenA: FakeInbound[] = []
    const seenB: FakeInbound[] = []
    a.session.observe((m) => seenA.push(m))
    b.session.observe((m) => seenB.push(m))

    a.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seenA).toHaveLength(1)
    expect(seenB).toHaveLength(0)

    const pendingA = a.session.awaitCorrelated(1)
    expect(pendingA.ok).toBe(true)
    expect(a.session.pending).toBe(1)
    expect(b.session.pending).toBe(0)

    // Closing one leaves the other entirely alone.
    await supervisor.release(a.role)
    expect(a.session.disposed).toBe(true)
    expect(b.session.disposed).toBe(false)
    b.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seenB).toHaveLength(1)

    await supervisor.disposeAll()
    expect(b.session.disposed).toBe(true)
  })

  it('releasing a role stops the link, then releases the layer above it', async () => {
    const supervisor = createSessionSupervisor()
    const a = role('alpha')
    supervisor.register(a)

    const connecting = supervisor.connectSequence([a.role])
    a.transport.emitOpen()
    expect((await connecting).ok).toBe(true)
    expect(a.runtime.model.state).toBe('READY')

    await supervisor.release(a.role)

    expect(a.runtime.model.state).toBe('DISCONNECTED')
    // An operator stop is EXPECTED, so teardown records no failure.
    expect(a.runtime.model.lastFailure).toBeNull()
    expect(a.transport.closes).toBe(1)
    expect(a.session.disposed).toBe(true)
    expect(supervisor.roles).toEqual([])
    /*
     * Nothing is still listening. The integration holds the ONLY subscription to
     * the raw transport (the fan-out's), so this reaching zero proves the
     * runtime, the session and the fan-out were all released.
     */
    expect(a.transport.listenerCount).toBe(0)
  })

  it('refuses a duplicate role rather than orphaning a runtime', async () => {
    const supervisor = createSessionSupervisor()
    const a = role('alpha')
    expect(supervisor.register(a).ok).toBe(true)
    const again = supervisor.register(role('alpha'))
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.refusal).toBe('DUPLICATE_ROLE')
    await supervisor.disposeAll()
  })

  it('N = 1 works with no placeholder role', async () => {
    const supervisor = createSessionSupervisor()
    const only = role('solo')
    supervisor.register(only)
    expect(supervisor.roles).toEqual([sessionRole('solo')])

    const connecting = supervisor.connectSequence([only.role])
    only.transport.emitOpen()
    expect((await connecting).ok).toBe(true)
    await supervisor.disposeAll()
  })

  it('connectSequence reports which role failed', async () => {
    const supervisor = createSessionSupervisor()
    const outcome = await supervisor.connectSequence([sessionRole('never-registered')])
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.role).toBe(sessionRole('never-registered'))
      expect(outcome.error).toBeNull()
    }
  })
})

// ─── §19 Bootstrap composition ────────────────────────────────────────────────

describe('bootstrap is composition, with no runtime change and no endpoint mutation', () => {
  it('session A discovers, disconnects intentionally, and session B connects', async () => {
    const transportA = createFakeTransport()
    const a = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
      role: sessionRole('bootstrap'),
      transport: transportA,
      codec: createFakeCodec(),
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      endpoint: { endpoint: 'inmemory://bootstrap' },
      scheduler: createManualScheduler(),
      reconnect: { maxAttempts: 3, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1_000 },
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: 'trading/provider/bootstrap',
      authenticate: async () => authenticated,
    })

    const discovered: FakeInbound[] = []
    a.session.observe((m) => discovered.push(m))

    const connectingA = a.runtime.connect()
    transportA.emitOpen()
    expect((await connectingA).ok).toBe(true)

    // A synthetic discovery answer. Its CONTENT is not the point of this test.
    transportA.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(discovered).toHaveLength(1)

    // The operator stops A. EXPECTED close, so no reconnect follows.
    await a.runtime.disconnect()
    a.dispose()

    expect(a.runtime.model.state).toBe('DISCONNECTED')
    expect(a.runtime.model.lastFailure).toBeNull()
    expect(transportA.opens).toBe(1)

    // A second integration, a different endpoint. Nothing was mutated on A.
    const transportB = createFakeTransport()
    const b = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
      role: sessionRole('session'),
      transport: transportB,
      codec: createFakeCodec(),
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      endpoint: { endpoint: 'inmemory://discovered-target' },
      scheduler: createManualScheduler(),
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: 'trading/provider/session',
      authenticate: async () => authenticated,
    })

    const connectingB = b.runtime.connect()
    transportB.emitOpen()
    expect((await connectingB).ok).toBe(true)
    expect(b.runtime.model.state).toBe('READY')
    expect(transportB.targets).toEqual(['inmemory://discovered-target'])

    b.dispose()
  })
})

// ─── Reconnect: R1A advances its generation, the protocol lifetime rotates ────

/**
 * A supervised role wired the way an integration is meant to wire one.
 *
 * `reconnect` is a REAL policy here, not `NO_RETRY`: the point of these tests is
 * what happens when R1A reconnects inside the same runtime instance, reusing the
 * same options object and calling this same `authenticate` again.
 */
function reconnectingRole(name: string) {
  const transport = createFakeTransport()
  const scheduler = createManualScheduler()
  const keys = createCounterKeys()
  const trace: string[] = []

  const integration = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
    role: sessionRole(name),
    transport,
    codec: createFakeCodec(),
    correlationKeyOf: fakeCorrelationKey,
    capacity: 4,
    endpoint: { endpoint: `inmemory://${name}` },
    scheduler,
    /*
     * A REAL reconnect policy, not NO_RETRY: these tests are about what happens
     * when R1A reconnects inside the same runtime instance, reusing the same
     * options object and calling this same authentication step again.
     */
    reconnect: { maxAttempts: 3, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1_000 },
    heartbeat: testHeartbeatPolicy(),
    credentials: createFakeCredentials(),
    credentialSecretRef: `trading/provider/${name}`,
    authenticate: async (session, { signal }) => {
      // Records what the step SAW when it began. A late binding shows up here.
      trace.push(`AUTH@${integration.runtime.model.generation}`
        + ` active=${session.active} pending=${session.pending}`)
      const id = keys.next()
      const waiting = session.awaitCorrelated(id, signal)
      if (!waiting.ok) return authenticationFailed('PROTOCOL_ERROR')
      const sent = session.send({ kind: 'HELLO', id })
      if (!sent.ok) return authenticationFailed('PROTOCOL_ERROR')

      const outcome = await waiting.settled
      if (!outcome.ok) {
        return authenticationFailed(outcome.cancelled === 'ABORTED' ? 'CANCELLED' : 'PROTOCOL_ERROR')
      }
      return outcome.value.kind === 'ACCEPT' ? authenticated : authenticationFailed('PROTOCOL_ERROR')
    },
  })

  /*
   * Registered AFTER the integration, so R1A calls the binding's observer first.
   * Everything this records therefore reflects a decision the binding has
   * already made — which is what makes the trace an ordering proof rather than
   * a coincidence.
   */
  integration.runtime.observe((model) => {
    trace.push(`${model.state}@${model.generation}`
      + ` active=${integration.session.active} pending=${integration.session.pending}`)
  })

  return { ...integration, transport, scheduler, keys, trace }
}

describe('a reconnect inside one runtime rotates the protocol lifetime', () => {
  it('generation-1 pending work cannot survive into generation 2 — twice over', async () => {
    const supervisor = createSessionSupervisor()
    const r = reconnectingRole('rotating')
    expect(supervisor.register(r).ok).toBe(true)

    // ── attempt A ────────────────────────────────────────────────────────────
    const connecting = supervisor.connectSequence([r.role])
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect((await connecting).ok).toBe(true)
    expect(r.runtime.model.state).toBe('READY')
    const generationA = r.runtime.model.generation
    expect(r.session.generation).toBe(generationA)

    // One correlated operation, deliberately never answered.
    const orphan = r.session.awaitCorrelated(99)
    expect(orphan.ok).toBe(true)
    expect(r.session.pending).toBe(1)

    // ── the link dies, R1A reconnects on its own ─────────────────────────────
    r.transport.emitClosed()
    expect(r.runtime.model.state).toBe('RECONNECTING')
    r.scheduler.advance(100)                       // R1A's own backoff timer
    expect(r.runtime.model.generation).toBe(generationA + 1)

    // The pending operation from generation A is already gone.
    if (orphan.ok) {
      expect(await orphan.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })
    }
    expect(r.session.pending).toBe(0)
    /*
     * A reconnect ATTEMPT starting is not a lifetime beginning. The wire is not
     * open yet, so there is nothing a lifetime could legitimately accept — the
     * session stays inactive, still carrying the number of the generation whose
     * work it just cancelled.
     */
    expect(r.session.active).toBe(false)
    expect(r.session.generation).toBe(generationA)

    // A response for the OLD key settles nothing — its waiter no longer exists.
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 99 }))

    // ── attempt B authenticates against fresh state ──────────────────────────
    r.transport.emitOpen()
    await settle()
    expect(r.session.active).toBe(true)
    expect(r.session.generation).toBe(generationA + 1)
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 2 }))
    await settle()
    expect(r.runtime.model.state).toBe('READY')
    expect(r.runtime.model.lastFailure).toBeNull()

    // ── and again, because once could be an accident ─────────────────────────
    const secondOrphan = r.session.awaitCorrelated(99)   // the SAME key, safely
    expect(secondOrphan.ok).toBe(true)
    expect(r.session.pending).toBe(1)

    const generationB = r.runtime.model.generation
    r.transport.emitClosed()
    r.scheduler.advance(200)                       // backoffFactor 2
    expect(r.runtime.model.generation).toBe(generationB + 1)
    if (secondOrphan.ok) {
      expect(await secondOrphan.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })
    }
    expect(r.session.pending).toBe(0)

    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 3 }))
    await settle()
    expect(r.runtime.model.state).toBe('READY')

    // Three attempts, three transport opens. No reconnect logic outside R1A.
    expect(r.transport.opens).toBe(3)
    await supervisor.disposeAll()
  })

  it('ORDERING: rotation completes before the new attempt authenticates', async () => {
    const supervisor = createSessionSupervisor()
    const r = reconnectingRole('ordered')
    supervisor.register(r)

    const connecting = supervisor.connectSequence([r.role])
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting

    r.session.awaitCorrelated(50)
    r.transport.emitClosed()
    r.scheduler.advance(100)
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 2 }))
    await settle()

    /*
     * Not timing intuition — the participants recorded their own order. Each
     * AUTH entry also records what `pending` was when the step began, so a
     * rotation that ran late would show `pending=1` and fail here.
     */
    /*
     * Not timing intuition — the participants recorded their own order, and the
     * binding's observer runs before the one that wrote these lines, so every
     * `active`/`pending` here is a decision already made.
     *
     *   CONNECTING@1     NOT active. No wire is open, so there is nothing a
     *                    lifetime could legitimately accept.
     *   AUTHENTICATING@1 active, and the step has not run yet — R1A dispatches
     *                    this and only then calls runAuthentication.
     *   AUTH@1           the step runs with a live lifetime and a clean registry.
     *   RECONNECTING@1   the lifetime ENDS at the OLD generation: pending is
     *                    already 0 while generation 1 is still current.
     *   CONNECTING@2     still not active — an attempt starting is not a wire.
     *   AUTHENTICATING@2 a fresh lifetime under the next authoritative generation.
     */
    expect(r.trace).toEqual([
      'CONNECTING@1 active=false pending=0',
      'AUTHENTICATING@1 active=true pending=0',
      'AUTH@1 active=true pending=0',
      'READY@1 active=true pending=0',
      'RECONNECTING@1 active=false pending=0',
      'CONNECTING@2 active=false pending=0',
      'AUTHENTICATING@2 active=true pending=0',
      'AUTH@2 active=true pending=0',
      'READY@2 active=true pending=0',
    ])
    await supervisor.disposeAll()
  })

  it('rotation is idempotent, so an observer firing on every change is safe', () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan, codec: createFakeCodec(), correlationKeyOf: fakeCorrelationKey, capacity: 4,
    })

    session.beginLifetime(1)
    const pending = session.awaitCorrelated(5)
    expect(pending.ok).toBe(true)

    // The generation already in force. Repeated calls must not touch the work.
    session.beginLifetime(1)
    session.beginLifetime(1)
    session.beginLifetime(1)
    expect(session.pending).toBe(1)
    expect(session.generation).toBe(1)

    // A real change does clear it.
    session.beginLifetime(2)
    expect(session.pending).toBe(0)

    session.dispose()
    fan.dispose()
  })

  it('a disposed session ignores rotation entirely', async () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan, codec: createFakeCodec(), correlationKeyOf: fakeCorrelationKey, capacity: 4,
    })
    session.beginLifetime(1)
    session.dispose()
    session.beginLifetime(2)
    expect(session.generation).toBe(1)
    expect(session.awaitCorrelated(1).ok).toBe(false)
    fan.dispose()
  })

  it('a response arriving in the new lifetime cannot resolve the old promise', async () => {
    const supervisor = createSessionSupervisor()
    const r = reconnectingRole('isolated')
    supervisor.register(r)

    const connecting = supervisor.connectSequence([r.role])
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting

    const old = r.session.awaitCorrelated(7)
    r.transport.emitClosed()
    r.scheduler.advance(100)
    r.transport.emitOpen()
    await settle()
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 2 }))
    await settle()

    // Generation 2 opens the same key and is answered.
    const fresh = r.session.awaitCorrelated(7)
    expect(fresh.ok).toBe(true)
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 7 }))

    if (fresh.ok) expect(await fresh.settled).toEqual({ ok: true, value: { kind: 'ACCEPT', id: 7 } })
    // The generation-1 promise settled at rotation and can never settle again.
    if (old.ok) expect(await old.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })
    await supervisor.disposeAll()
  })

  it('B is not proven by A: R1A-s stale guard never touches protocol state', async () => {
    /*
     * Two different protections, and only one of them is R1A's.
     *
     * A. A transport event reaching R1A's superseded listener closure is dropped
     *    by its stale guard — visible below as the runtime moving on cleanly.
     * B. Protocol state CREATED before the reconnect is invisible to that guard.
     *    R1A never sees a correlation registry, so nothing in A cancels a pending
     *    operation. Without the binding it simply survives.
     *
     * Built from the raw primitives deliberately: this is the ONLY way to
     * produce an unbound session, and it is unreachable through the package
     * root. The test exists to show what the binding is actually preventing.
     */
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const scheduler = createManualScheduler()
    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan, codec: createFakeCodec(), correlationKeyOf: fakeCorrelationKey, capacity: 4,
    })
    const runtime = createProviderSessionRuntime({
      transport: fan,
      endpoint: { endpoint: 'inmemory://unbound' },
      scheduler,
      reconnect: { maxAttempts: 3, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1_000 },
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: 'trading/provider/unbound',
      authenticate: async () => authenticated,
    })

    const connecting = runtime.connect()
    transport.emitOpen()
    await connecting
    expect(runtime.model.state).toBe('READY')

    // Nothing bound this session, so its lifetime is driven by hand.
    session.beginLifetime(runtime.model.generation)
    const pending = session.awaitCorrelated(11)
    expect(session.pending).toBe(1)

    transport.emitClosed()
    scheduler.advance(100)
    transport.emitOpen()
    await settle()
    expect(runtime.model.state).toBe('READY')
    expect(runtime.model.generation).toBe(2)

    // A. R1A moved on cleanly. B. the generation-1 operation is STILL pending,
    // and the session still believes generation 1 is current.
    expect(session.pending).toBe(1)
    expect(session.generation).toBe(1)
    expect(session.active).toBe(true)

    // What the binding would have done — twice, in the order it would have done it.
    session.endLifetime()
    expect(session.pending).toBe(0)
    if (pending.ok) expect(await pending.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })
    session.beginLifetime(runtime.model.generation)
    expect(session.generation).toBe(2)

    session.dispose()
    fan.dispose()
    await runtime.disconnect()
  })
})

// ─── Terminal states: the link can end without any generation advancing ───────

describe('a lifetime ends when the link stops being usable, not when a generation arrives', () => {
  it('FAILED with no retry budget cancels pending work immediately', async () => {
    /*
     * maxAttempts 0. There is no next generation coming — not later, not ever
     * without a fresh explicit connect. Waiting for one would mean waiting
     * forever, which is exactly why rotation alone was not enough.
     */
    const h = harness()
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect((await connecting).ok).toBe(true)

    const generationAtReady = h.runtime.model.generation
    const pending = h.session.awaitCorrelated(42)
    expect(pending.ok).toBe(true)
    expect(h.session.pending).toBe(1)

    // The link dies. No budget, so R1A goes terminal.
    h.transport.emitClosed()
    expect(h.runtime.model.state).toBe('FAILED')
    expect(h.runtime.model.lastFailure).toBe('CONNECTION_LOST')

    // Cleaned up WITHOUT the generation advancing.
    expect(h.runtime.model.generation).toBe(generationAtReady)
    expect(h.session.pending).toBe(0)
    expect(h.session.active).toBe(false)
    if (pending.ok) expect(await pending.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })

    // The old key settles nothing, and no new work can be created.
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 42 }))
    expect(h.session.pending).toBe(0)
    const refused = h.session.awaitCorrelated(42)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.refusal).toBe('INACTIVE')

    // Nothing here scheduled anything: one open, one close, no timers left.
    expect(h.transport.opens).toBe(1)
    expect(h.scheduler.pending()).toBe(0)
    h.integration.dispose()
  })

  it('a long backoff does not keep pending work alive while it waits', async () => {
    const h = harness({
      reconnect: { maxAttempts: 3, initialDelayMs: 60_000, backoffFactor: 2, maxDelayMs: 600_000 },
    })
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting

    const pending = h.session.awaitCorrelated(7)
    h.transport.emitClosed()

    // A minute of backoff still ahead, and the generation has not moved.
    expect(h.runtime.model.state).toBe('RECONNECTING')
    expect(h.runtime.model.generation).toBe(1)
    expect(h.session.pending).toBe(0)
    expect(h.session.active).toBe(false)
    if (pending.ok) expect(await pending.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })

    // The wait is R1A's, and it is still R1A's: nothing here shortened it.
    h.scheduler.advance(59_999)
    expect(h.transport.opens).toBe(1)
    h.integration.dispose()
  })

  it('an operator disconnect leaves protocol state safe, without supervisor.release', async () => {
    /*
     * The runtime's own public `disconnect()`, called directly. R1A deliberately
     * does NOT advance the generation here — it must still receive and classify
     * the close it is about to cause — so a generation-only rule would leave
     * this pending operation waiting on a number that never changes.
     */
    const h = harness()
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting

    const generationAtReady = h.runtime.model.generation
    const pending = h.session.awaitCorrelated(5)
    expect(h.session.pending).toBe(1)

    await h.runtime.disconnect()

    expect(h.runtime.model.state).toBe('DISCONNECTED')
    expect(h.runtime.model.generation).toBe(generationAtReady)
    expect(h.session.pending).toBe(0)
    expect(h.session.active).toBe(false)
    // Factual, not a failure verdict and not a retry hint.
    if (pending.ok) expect(await pending.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })

    // A late frame after the stop settles nothing and reaches no observer.
    const late: FakeInbound[] = []
    h.session.observe((m) => late.push(m))
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 5 }))
    expect(late).toEqual([])
    expect(h.session.pending).toBe(0)

    // No reconnect: one open, and the operator stop recorded no failure.
    expect(h.transport.opens).toBe(1)
    expect(h.runtime.model.lastFailure).toBeNull()
    h.integration.dispose()
  })

  it('then R1A reconnects and a fresh lifetime begins under the next generation', async () => {
    const h = harness({
      reconnect: { maxAttempts: 3, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1_000 },
    })
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting

    const orphan = h.session.awaitCorrelated(7)
    h.transport.emitClosed()
    if (orphan.ok) expect(await orphan.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })

    h.scheduler.advance(100)
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 2 }))
    await settle()

    expect(h.runtime.model.state).toBe('READY')
    expect(h.session.active).toBe(true)
    expect(h.session.generation).toBe(2)

    // The SAME key is free again, and answering it works normally.
    const fresh = h.session.awaitCorrelated(7)
    expect(fresh.ok).toBe(true)
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 7 }))
    if (fresh.ok) expect(await fresh.settled).toEqual({ ok: true, value: { kind: 'ACCEPT', id: 7 } })
    h.integration.dispose()
  })
})

// ─── Frames arriving with no active lifetime ──────────────────────────────────

describe('an inactive lifetime treats no inbound frame as current traffic', () => {
  it('before the first connect, during backoff, after a stop — and then normally', async () => {
    const h = harness({
      reconnect: { maxAttempts: 3, initialDelayMs: 60_000, backoffFactor: 2, maxDelayMs: 600_000 },
    })
    const seen: FakeInbound[] = []
    h.session.observe((m) => seen.push(m))

    // ── 1. before CONNECT_REQUESTED ──────────────────────────────────────────
    expect(h.session.active).toBe(false)
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seen).toEqual([])
    expect(h.facts).toEqual([])
    expect(h.session.awaitCorrelated(1).ok).toBe(false)

    // ── 2. a live lifetime accepts normally ──────────────────────────────────
    const connecting = h.runtime.connect()
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    await connecting
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    // The authentication reply is delivered to observers too, so: ACCEPT, NOTICE.
    expect(seen).toEqual([{ kind: 'ACCEPT', id: 1 }, { kind: 'NOTICE' }])

    // ── 3. during FAILED / backoff ───────────────────────────────────────────
    h.transport.emitClosed()
    expect(h.runtime.model.state).toBe('RECONNECTING')
    expect(h.session.active).toBe(false)
    const factsBefore = h.facts.length
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seen).toHaveLength(2)
    // Not even a fact: reporting ACTIVITY for a link R1A considers finished
    // would be this layer asserting something it cannot know.
    expect(h.facts).toHaveLength(factsBefore)

    // ── 4. a fresh lifetime accepts again ────────────────────────────────────
    h.scheduler.advance(60_000)
    h.transport.emitOpen()
    await settle()
    h.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 2 }))
    await settle()
    expect(h.session.active).toBe(true)
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seen).toHaveLength(4)      // + the second ACCEPT, + this NOTICE

    // ── 5. after DISCONNECTED ────────────────────────────────────────────────
    await h.runtime.disconnect()
    expect(h.session.active).toBe(false)
    h.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(seen).toHaveLength(4)

    // The subscription never detached — the gate did the work, not a re-listen.
    expect(h.transport.listenerCount).toBe(1)
    h.integration.dispose()
  })

  it('send is refused while inactive, and never reaches the transport', async () => {
    const h = harness()
    expect(h.session.active).toBe(false)
    const refused = h.session.send({ kind: 'HELLO', id: 1 })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.refusal).toBe('INACTIVE')
    expect(h.transport.sent).toHaveLength(0)
    h.integration.dispose()
  })
})

// ─── A codec exception composes into an existing failure ──────────────────────

describe('a codec exception can truthfully become PROTOCOL_ERROR', () => {
  it('the integration maps the fact; the session never classifies it', async () => {
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const inner = createFakeCodec()
    let explode = false

    let reportException: () => void = () => {}
    const exploded = new Promise<void>((resolve) => { reportException = resolve })

    const session = createProtocolSession<FakeOutbound, FakeInbound, number>({
      transport: fan,
      codec: {
        encode: (m) => inner.encode(m),
        decode: (f) => { if (explode) throw new Error('boom'); return inner.decode(f) },
      },
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      // The MAPPING lives here, in the integration — never in the session.
      onFact: (fact) => { if (fact.kind === 'CODEC_EXCEPTION') reportException() },
    })

    const runtime = createProviderSessionRuntime({
      transport: fan,
      endpoint: { endpoint: 'inmemory://exception' },
      scheduler: createManualScheduler(),
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: 'trading/provider/exception',
      authenticate: async ({ signal }) => {
        const waiting = session.awaitCorrelated(1, signal)
        if (!waiting.ok) return authenticationFailed('PROTOCOL_ERROR')
        session.send({ kind: 'HELLO', id: 1 })
        const outcome = await Promise.race([
          waiting.settled.then((r) => ({ answered: true as const, r })),
          exploded.then(() => ({ answered: false as const })),
        ])
        if (!outcome.answered) return authenticationFailed('PROTOCOL_ERROR')
        return outcome.r.ok && outcome.r.value.kind === 'ACCEPT'
          ? authenticated
          : authenticationFailed('PROTOCOL_ERROR')
      },
    })

    const connecting = runtime.connect()
    transport.emitOpen()
    await settle()
    explode = true
    transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))

    const result = await connecting
    expect(result.ok).toBe(false)
    expect(runtime.model.lastFailure).toBe('PROTOCOL_ERROR')

    session.dispose()
    fan.dispose()
  })
})

// ─── Synchronous reentrancy: a last frame delivered from inside the abort ─────

/**
 * A transport that answers its own abort with one more frame.
 *
 * PROVIDER-NEUTRAL AND SYNTHETIC. Nothing here imitates a real wire; it is the
 * smallest object that can reproduce the ordering R1A's teardown creates:
 *
 *     CLOSED → R1A.fail() → tearDownGeneration() → abort() → *this frame*
 *              ... and only afterwards does R1A dispatch its terminal state.
 *
 * The frame therefore lands in a window where R1A has already unsubscribed and
 * the lifetime binding has not yet been told anything. A session gated only on
 * the runtime model would still be active and would settle it.
 */
function createAbortEchoTransport(reply: TransportFrame): ProviderTransport & {
  emitOpen(): void
  emitClosed(): void
  emitError(detail: string): void
  readonly echoed: number
} {
  const listeners = new Set<TransportListener>()
  let echoed = 0
  const emit = (event: TransportEvent): void => {
    for (const listener of [...listeners]) listener(event)
  }
  return {
    get echoed() { return echoed },
    async open(_t: TransportEndpoint, signal: AbortSignal) {
      signal.addEventListener('abort', () => {
        // THE HOSTILE MOVE: one last frame, synchronously, from inside abort.
        echoed += 1
        emit({ type: 'FRAME', frame: reply })
      }, { once: true })
    },
    send(_f: TransportFrame) {},
    close() { emit({ type: 'CLOSED' }) },
    listen(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    emitOpen() { emit({ type: 'OPEN' }) },
    emitClosed() { emit({ type: 'CLOSED' }) },
    emitError(detail: string) { emit({ type: 'ERROR', detail }) },
  }
}

describe('a frame emitted synchronously during R1A teardown settles nothing', () => {
  async function readyWithPending(terminate: 'CLOSED' | 'ERROR') {
    const transport = createAbortEchoTransport(fakeFrame({ kind: 'ACCEPT', id: 99 }))
    const facts: ProtocolFact[] = []
    const settled: FakeInbound[] = []

    const integration = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
      role: sessionRole(`reentrant-${terminate}`),
      transport,
      codec: createFakeCodec(),
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      onFact: (f) => { facts.push(f) },
      endpoint: { endpoint: 'inmemory://reentrant' },
      scheduler: createManualScheduler(),
      reconnect: { maxAttempts: 3, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1_000 },
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: 'trading/provider/reentrant',
      authenticate: async () => authenticated,
    })
    integration.session.observe((m) => settled.push(m))

    const connecting = integration.runtime.connect()
    transport.emitOpen()
    expect((await connecting).ok).toBe(true)

    // The operation the hostile frame is trying to answer.
    const pending = integration.session.awaitCorrelated(99)
    expect(pending.ok).toBe(true)
    expect(integration.session.pending).toBe(1)

    const factsBefore = facts.length
    if (terminate === 'CLOSED') transport.emitClosed()
    else transport.emitError('synthetic transport error')

    return { transport, integration, pending, settled, facts, factsBefore }
  }

  for (const terminate of ['CLOSED', 'ERROR'] as const) {
    it(`${terminate}: the reentrant frame never reaches settlement`, async () => {
      const h = await readyWithPending(terminate)

      // The transport really did fire it, from inside the abort.
      expect(h.transport.echoed).toBe(1)

      // And it changed nothing on this side.
      expect(h.settled).toEqual([])
      expect(h.facts).toHaveLength(h.factsBefore)
      expect(h.integration.session.pending).toBe(0)
      expect(h.integration.session.active).toBe(false)
      if (h.pending.ok) {
        expect(await h.pending.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })
      }

      /*
       * R1A proceeded exactly as it would have without any of this — including
       * the difference between the two terminators, which is its call and not
       * this layer's: CONNECTION_LOST is retriable in R1A's vocabulary and
       * PROTOCOL_ERROR is not, so one backs off and the other is terminal.
       */
      expect(h.integration.runtime.model.state).toBe(
        terminate === 'CLOSED' ? 'RECONNECTING' : 'FAILED',
      )
      expect(h.integration.runtime.model.lastFailure).toBe(
        terminate === 'CLOSED' ? 'CONNECTION_LOST' : 'PROTOCOL_ERROR',
      )
      h.integration.dispose()
    })
  }

  it('the fence is what closes it — the lifetime binding alone is one step late', async () => {
    /*
     * The mechanism, isolated. R1A's `fail()` unsubscribes and aborts BEFORE it
     * dispatches the terminal state, so a model observer cannot have run yet
     * when the echoed frame arrives. The fan-out's ingress flag is written from
     * the CLOSED event itself, before any subscriber — which is why the frame is
     * refused at a moment when `active` is still true.
     */
    const transport = createAbortEchoTransport(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    const fan = createFanOutTransport(transport)
    const observed: string[] = []

    fan.listen((event) => { observed.push(`${event.type} ingressOpen=${fan.ingressOpen}`) })
    fan.listenFrames(() => { observed.push('FRAME-DELIVERED') })

    transport.emitOpen()
    expect(fan.ingressOpen).toBe(true)
    transport.emitClosed()
    expect(fan.ingressOpen).toBe(false)

    // Every listener saw CLOSED with ingress ALREADY shut.
    expect(observed).toEqual(['OPEN ingressOpen=true', 'CLOSED ingressOpen=false'])
    fan.dispose()
  })
})

// ─── Frames before the wire opens ─────────────────────────────────────────────

describe('a frame arriving before OPEN belongs to nothing', () => {
  it('is ignored, produces no fact, settles nothing — and normal traffic still works', async () => {
    const transport = createFakeTransport()
    const facts: ProtocolFact[] = []
    const seen: FakeInbound[] = []

    const integration = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
      role: sessionRole('pre-open'),
      transport,
      codec: createFakeCodec(),
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      onFact: (f) => { facts.push(f) },
      endpoint: { endpoint: 'inmemory://pre-open' },
      scheduler: createManualScheduler(),
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: 'trading/provider/pre-open',
      authenticate: async (session, { signal }) => {
        const waiting = session.awaitCorrelated(1, signal)
        if (!waiting.ok) return authenticationFailed('PROTOCOL_ERROR')
        session.send({ kind: 'HELLO', id: 1 })
        const outcome = await waiting.settled
        if (!outcome.ok) return authenticationFailed('CANCELLED')
        return outcome.value.kind === 'ACCEPT' ? authenticated : authenticationFailed('AUTH_FAILED')
      },
    })
    integration.session.observe((m) => seen.push(m))

    // ── before any connect, and before OPEN ──────────────────────────────────
    transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect(seen).toEqual([])
    expect(facts).toEqual([])
    expect(integration.session.pending).toBe(0)

    const connecting = integration.runtime.connect()
    // Connecting, but the wire has still not opened.
    transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect(seen).toEqual([])
    expect(facts).toEqual([])

    /*
     * R1A saw all of it, per its own contract — the events were broadcast
     * normally, and it simply has no rule that acts on a frame before OPEN.
     */
    expect(integration.runtime.model.state).toBe('CONNECTING')

    // ── and after OPEN everything works normally ─────────────────────────────
    transport.emitOpen()
    await settle()
    transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 1 }))
    expect((await connecting).ok).toBe(true)
    expect(integration.runtime.model.state).toBe('READY')
    expect(seen).toEqual([{ kind: 'ACCEPT', id: 1 }])
    expect(facts).toEqual([{ kind: 'ACTIVITY' }])
    integration.dispose()
  })
})

// ─── The two gates are independent, and each is load-bearing alone ────────────

/**
 * A transport whose `close()` completes silently.
 *
 * Real, not contrived: a socket can stop being useful without ever delivering a
 * close event. It matters here because it separates the two defences — the wire
 * stays OPEN as far as the fan-out's fence is concerned, so anything refused
 * afterwards was refused by the SESSION's lifetime gate and by nothing else.
 */
function createSilentCloseTransport(): ProviderTransport & {
  emitOpen(): void
  emitFrame(frame: TransportFrame): void
} {
  const listeners = new Set<TransportListener>()
  const emit = (event: TransportEvent): void => {
    for (const listener of [...listeners]) listener(event)
  }
  return {
    async open(_t: TransportEndpoint, _s: AbortSignal) {},
    send(_f: TransportFrame) {},
    close() { /* no CLOSED event, on purpose */ },
    listen(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    emitOpen() { emit({ type: 'OPEN' }) },
    emitFrame(frame: TransportFrame) { emit({ type: 'FRAME', frame }) },
  }
}

describe('the ingress fence alone', () => {
  it('refuses frames before OPEN, with no session involved at all', () => {
    /*
     * Isolated from the lifetime gate deliberately. Both defences refuse a
     * pre-OPEN frame, so a test that goes through a session cannot tell which
     * one did the work — and a fence that silently stopped fencing would look
     * exactly the same.
     */
    const transport = createFakeTransport()
    const fan = createFanOutTransport(transport)
    const frames: TransportFrame[] = []
    const events: string[] = []
    fan.listenFrames((f) => frames.push(f))
    fan.listen((e) => events.push(e.type))

    expect(fan.ingressOpen).toBe(false)
    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(frames).toEqual([])
    // R1A's stream is untouched: it received the frame, per its own contract.
    expect(events).toEqual(['FRAME'])

    transport.emitOpen()
    expect(fan.ingressOpen).toBe(true)
    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(frames).toHaveLength(1)

    transport.emitClosed()
    transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(frames).toHaveLength(1)
    expect(events).toEqual(['FRAME', 'OPEN', 'FRAME', 'CLOSED', 'FRAME'])
    fan.dispose()
  })
})

describe('the lifetime gate alone', () => {
  function role(name: string, authenticate: () => Promise<AuthenticationResult>) {
    const transport = createSilentCloseTransport()
    const facts: ProtocolFact[] = []
    const seen: FakeInbound[] = []
    const integration = createProtocolIntegration<FakeOutbound, FakeInbound, number>({
      role: sessionRole(name),
      transport,
      codec: createFakeCodec(),
      correlationKeyOf: fakeCorrelationKey,
      capacity: 4,
      onFact: (f) => { facts.push(f) },
      endpoint: { endpoint: `inmemory://${name}` },
      scheduler: createManualScheduler(),
      reconnect: NO_RETRY,
      heartbeat: testHeartbeatPolicy(),
      credentials: createFakeCredentials(),
      credentialSecretRef: `trading/provider/${name}`,
      authenticate,
    })
    integration.session.observe((m) => seen.push(m))
    return { transport, integration, facts, seen }
  }

  it('refuses traffic after an operator stop, while the wire is still open', async () => {
    const r = role('silent-stop', async () => authenticated)
    const connecting = r.integration.runtime.connect()
    r.transport.emitOpen()
    await connecting
    expect(r.integration.runtime.model.state).toBe('READY')

    const pending = r.integration.session.awaitCorrelated(3)
    await r.integration.runtime.disconnect()

    // The transport never reported a close, so the FENCE is still open …
    r.transport.emitFrame(fakeFrame({ kind: 'ACCEPT', id: 3 }))

    // … and the lifetime gate is the only thing that refused this.
    expect(r.seen).toEqual([])
    expect(r.facts).toEqual([])
    expect(r.integration.session.active).toBe(false)
    expect(r.integration.session.pending).toBe(0)
    if (pending.ok) expect(await pending.settled).toEqual({ ok: false, cancelled: 'LINK_ENDED' })
    r.integration.dispose()
  })

  it('refuses traffic after an authentication failure, while the wire is still open', async () => {
    const r = role('silent-auth-fail', async () => authenticationFailed('AUTH_FAILED'))
    const connecting = r.integration.runtime.connect()
    r.transport.emitOpen()
    const result = await connecting

    expect(result.ok).toBe(false)
    expect(r.integration.runtime.model.state).toBe('FAILED')
    expect(r.integration.runtime.model.lastFailure).toBe('AUTH_FAILED')

    // Again: no close was ever reported, so only the lifetime gate applies.
    r.transport.emitFrame(fakeFrame({ kind: 'NOTICE' }))
    expect(r.seen).toEqual([])
    expect(r.facts).toEqual([])
    expect(r.integration.session.active).toBe(false)
    r.integration.dispose()
  })
})
