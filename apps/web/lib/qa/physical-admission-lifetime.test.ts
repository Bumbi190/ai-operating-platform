/**
 * G3C-3C-A — C-series: PHYSICAL ADMISSION and PHYSICAL LIFETIME.
 *
 * The B-series proved a composed signal reaches the SDK. It could not prove two
 * further things, and Phase 1B shipped without either:
 *
 *   1. That the watch OUTLIVES the call that starts it. A streaming request
 *      returns its handle almost immediately and then stays on the wire for
 *      minutes. A watcher released at handle return is a watcher that covers
 *      the one part of the request that was never at risk.
 *
 *   2. That a physical attempt is ADMITTED before it is made. In-flight abort
 *      is a second line: it fires after the request exists, after the provider
 *      may have started billable work. A retry loop that re-enters the provider
 *      while a cancellation is already durable has already lost.
 *
 * Every test here drives the REAL governed adapter against a fake SDK and
 * asserts on effect — the signal the fake received, whether the fake was called
 * at all, and whether a later authority change can still abort it.
 *
 * No live provider. No credits. No mail.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

const PROJ = '11111111-1111-1111-1111-111111111111'
const RUN = 'run-c-1'
const CLAIM = 'claim-c-1'

/** Every physical call the fake SDK layer saw, in order. */
const seen: { kind: string; signal?: AbortSignal }[] = []

const state = {
  run: {} as Record<string, unknown>,
  globalPaused: false,
  projectPaused: false,
  stopReadFails: false,
  runReadFails: false,
  runReads: 0,
  spendReleased: 0,
  started: null as null | (() => void),
  /** Pushes one chunk into the open OpenAI stream fake. */
  emit: null as null | ((v: unknown) => void),
  /** Ends the open OpenAI stream fake. */
  endStream: null as null | (() => void),
}

function record(kind: string, signal: AbortSignal | undefined) {
  seen.push({ kind, signal })
  state.started?.()
}

/** Blocks until aborted, so abort is observable as an effect. */
function hold(kind: string, signal: AbortSignal | undefined): Promise<never> {
  record(kind, signal)
  return new Promise((_, reject) => {
    if (!signal) return                        // never settles: a dropped signal hangs
    if (signal.aborted) return reject(signal.reason ?? new Error('aborted'))
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
  })
}

/** An async-iterable the test drives chunk by chunk — a real stream's shape. */
function openStream(kind: string, signal: AbortSignal | undefined) {
  record(kind, signal)
  const queue: unknown[] = []
  let wake: (() => void) | null = null
  let ended = false
  let failure: unknown = null
  const bump = () => { const w = wake; wake = null; w?.() }
  state.emit = v => { queue.push(v); bump() }
  state.endStream = () => { ended = true; bump() }
  signal?.addEventListener('abort',
    () => { failure = signal.reason ?? new Error('aborted'); bump() }, { once: true })
  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (failure) throw failure
        if (queue.length) { yield queue.shift() as { choices: unknown[] }; continue }
        if (ended) return
        await new Promise<void>(res => { wake = res })
      }
    },
  }
}

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = {
      completions: {
        create: (p: { stream?: boolean }, o?: { signal?: AbortSignal }) =>
          p?.stream
            ? Promise.resolve(openStream('openai.stream', o?.signal))
            : hold('openai.chat', o?.signal),
      },
    }
    images = {
      generate: (_p: unknown, o?: { signal?: AbortSignal }) => hold('openai.image', o?.signal),
      edit:     (_p: unknown, o?: { signal?: AbortSignal }) => hold('openai.edit', o?.signal),
    }
  },
  toFile: async () => ({}),
}))

/** Anthropic stream fake whose termination seam is chosen per test. */
const anthropicStreamSeam = { mode: 'done' as 'done' | 'finalMessage' | 'iterable' | 'none' }

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: (_p: unknown, o?: { signal?: AbortSignal }) => hold('anthropic.create', o?.signal),
      stream: (_p: unknown, o?: { signal?: AbortSignal }) => {
        record('anthropic.stream', o?.signal)
        let rejectDone: (e: unknown) => void = () => {}
        const done = new Promise<void>((_, rej) => { rejectDone = rej })
        // The seam modes below deliberately do not expose `done`; without this
        // its abort rejection has no consumer and surfaces as an unhandled
        // rejection from the FAKE, which would be mistaken for a real one.
        void done.catch(() => {})
        o?.signal?.addEventListener('abort',
          () => rejectDone(o.signal!.reason ?? new Error('aborted')), { once: true })
        const base: Record<string | symbol, unknown> = { controller: new AbortController() }
        // Each mode omits the seams it claims to omit. A fake that always
        // kept `finalMessage` would silently take that tier every time and
        // prove nothing about the ones below it.
        if (anthropicStreamSeam.mode === 'done') base.done = () => done
        if (anthropicStreamSeam.mode === 'done' || anthropicStreamSeam.mode === 'finalMessage') {
          base.finalMessage = () => done.then(() => ({ usage: {} }))
        }
        if (anthropicStreamSeam.mode === 'iterable') {
          // Endable on purpose: a stream that can never finish cannot tell a
          // watcher released AT termination apart from one never released.
          base[Symbol.asyncIterator] = async function* () {
            await new Promise<void>(res => { state.endStream = res })
          }
        }
        return base as never
      },
    }
  },
}))

vi.mock('@/lib/cost/governed-spend', () => ({
  // Real enough to prove the reservation is FREED on an admission refusal:
  // the callback is run, and a throw from it is observed here.
  withGovernedSpend: async (_i: unknown, run: () => Promise<unknown>) => {
    try { return await run() } catch (e) { state.spendReleased += 1; throw e }
  },
  resolveGovernedProjectId: async () => ({ ok: true, projectId: PROJ }),
  SpendRefusedError: class extends Error {},
  ProviderNotDispatchedError: class extends Error {},
  PLATFORM_COMPAT_PROJECT: { projectId: PROJ },
}))
vi.mock('@/lib/cost/track', () => ({ logLlmCost: () => {}, logImageCost: () => {} }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10 }) }))
vi.mock('@/lib/cost/budget-gate', () => ({ estimateImageSek: async () => 1 }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      state.runReads += 1
      return state.runReadFails
        ? { data: null, error: { message: 'unavailable' } }
        : { data: state.run, error: null }
    } }) }) }),
    rpc: async (fn: string) => {
      if (fn !== 'stop_state') return { data: null, error: null }
      if (state.stopReadFails) return { data: null, error: { message: 'unavailable' } }
      return {
        data: [{
          global_paused: state.globalPaused, global_paused_at: null, global_paused_reason: null,
          project_requested: true, project_found: true,
          project_paused: state.projectPaused, project_paused_at: null, project_paused_reason: null,
        }],
        error: null,
      }
    },
  }),
}))

const RUN_BOUND = { kind: 'RUN_BOUND' as const, runId: RUN, claimId: CLAIM }
const EXEC_PROJECT = { context: 'AUTONOMOUS' as const, scope: { kind: 'PROJECT' as const, project: { projectId: PROJ } } }
const EXEC_GLOBAL  = { context: 'AUTONOMOUS' as const, scope: { kind: 'GLOBAL_ONLY' as const } }

beforeEach(() => {
  seen.length = 0
  state.run = { id: RUN, status: 'running', claim_id: CLAIM, cancel_requested: false, project_id: PROJ }
  state.globalPaused = false
  state.projectPaused = false
  state.stopReadFails = false
  state.runReadFails = false
  state.runReads = 0
  state.spendReleased = 0
  state.started = null
  state.emit = null
  state.endStream = null
  anthropicStreamSeam.mode = 'done'
  vi.resetModules()
})
afterEach(() => { vi.useRealTimers() })

/** Runs the poller far enough that any live watch would observe the flip. */
async function tick() { await vi.advanceTimersByTimeAsync(2_500) }

// ═══════════════════════════════════════════════════════════════════════════
describe('C1–C4 · a stream is watched for its whole life, not until the handle returns', () => {
  it('C1 — cancellation AFTER the handle returned still aborts the OpenAI stream', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const inFlight = new Promise<void>(res => { state.started = res })

    const stream = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [], stream: true } as never,
    )
    await inFlight
    const sig = seen.at(-1)!.signal
    expect(sig, 'the SDK was handed a signal').toBeDefined()

    // Consume like production does — the handle has ALREADY been returned.
    const drained = (async () => { for await (const _ of stream as AsyncIterable<unknown>) { /* … */ } })()
      .then(() => 'completed', e => e)

    state.run.cancel_requested = true
    await tick()
    expect(sig!.aborted, 'the still-open stream was aborted').toBe(true)
    await expect(drained).resolves.not.toBe('completed')
  })

  it('C2 — iterator exhaustion releases the watch: a later flip cannot abort', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const stream = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [], stream: true } as never,
    )
    const sig = seen.at(-1)!.signal!
    const drained = (async () => { for await (const _ of stream as AsyncIterable<unknown>) { /* … */ } })()
    state.endStream!()
    await drained

    state.run.cancel_requested = true
    await tick()
    expect(sig.aborted, 'a completed stream is not aborted afterwards').toBe(false)
  })

  it('C3 — a consumer `break` releases the watch', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const stream = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [], stream: true } as never,
    )
    const sig = seen.at(-1)!.signal!
    const drained = (async () => {
      for await (const _ of stream as AsyncIterable<unknown>) break
    })()
    state.emit!({ choices: [{ delta: { content: 'hi' } }] })
    await drained

    state.run.cancel_requested = true
    await tick()
    expect(sig.aborted, 'an abandoned stream released its watcher').toBe(false)
  })

  it('C4 — the watch is alive DURING iteration, not merely created', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const stream = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [], stream: true } as never,
    )
    void (async () => { for await (const _ of stream as AsyncIterable<unknown>) { /* … */ } })().catch(() => {})
    const before = state.runReads
    await tick()
    expect(state.runReads, 'authority is re-read while the stream is open').toBeGreaterThan(before)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C5–C8 · admission: a refused attempt is never made', () => {
  async function admit(flip: () => void, call: () => Promise<unknown>) {
    flip()
    const err = await call().then(() => null, e => e)
    return { err, calls: seen.length }
  }

  it('C5 — a durable cancellation refuses admission; the SDK is never called', async () => {
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const { err, calls } = await admit(
      () => { state.run.cancel_requested = true },
      () => openAIChatCompletion(
        { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
        { model: 'gpt', messages: [] } as never),
    )
    expect(isPhysicalAdmissionRefusal(err), 'refused as an admission failure').toBe(true)
    expect(calls, 'no physical call was made').toBe(0)
  })

  it('C6 — a rotated claim refuses admission; the SDK is never called', async () => {
    const { openAIImageGenerate } = await import('@/lib/ai/openai-client')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const { err, calls } = await admit(
      () => { state.run.claim_id = 'someone-else' },
      () => openAIImageGenerate(
        { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
        { model: 'gpt-image-1', prompt: 'x', n: 1 } as never),
    )
    expect(isPhysicalAdmissionRefusal(err)).toBe(true)
    expect(calls, 'no physical call was made').toBe(0)
  })

  it('C7 — unreadable authority refuses admission (pre-dispatch is fail-CLOSED)', async () => {
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const { err, calls } = await admit(
      () => { state.runReadFails = true },
      () => openAIChatCompletion(
        { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
        { model: 'gpt', messages: [] } as never),
    )
    expect(isPhysicalAdmissionRefusal(err),
      'unprovable authority must not become permission').toBe(true)
    expect(calls).toBe(0)
  })

  it('C8 — the refusal escapes the spend boundary so the reservation can be freed', async () => {
    // What this CAN prove here: the refusal propagates OUT of the governed
    // callback rather than being swallowed inside the adapter. That the real
    // `withGovernedSpend` then RELEASES is proven where the real spend module
    // actually runs — `governance-provider-boundary.test.ts`, C8 there. A
    // pass-through spend fake cannot testify about code it replaces.
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    state.run.cancel_requested = true
    const err = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [] } as never).then(() => null, e => e)
    expect(state.spendReleased, 'it reached the spend boundary as a throw').toBe(1)
    expect(isPhysicalAdmissionRefusal(err), 'and kept its identity on the way out').toBe(true)
  })

  it('C8b — CONTRACT_ONLY is NOT re-gated at admission; the canonical gate owns it', async () => {
    // The contract stop is decided pre-dispatch by `withGovernedSpend`, which
    // fails closed and releases the reservation. Deciding it a second time here
    // would put availability policy for every interactive feature in a rival
    // truth table. Admission adds only what that gate cannot see — run
    // ownership and durable cancellation — so it is a RUN_BOUND gate.
    //
    // A stopped CONTRACT_ONLY call is still stopped; it is stopped THERE. In
    // flight it is still watched — C12 proves a pause aborts a live request.
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const { err } = await admit(
      () => { state.globalPaused = true },
      () => openAIChatCompletion(
        { project: { projectId: PROJ }, execution: EXEC_GLOBAL } as never,
        { model: 'gpt', messages: [] } as never),
    )
    expect(isPhysicalAdmissionRefusal(err),
      'admission did not claim authority the contract gate already holds').toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C22–C24 · ANTHROPIC admits too — not only the provider I wired first', () => {
  /**
   * C5–C8 all drove OpenAI. That is how a second provider stays ungated while
   * the suite reports full coverage of "admission": every assertion was true,
   * and none of them was about Anthropic.
   */
  it('C22 — a cancelled run never reaches Anthropic messages.create', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    state.run.cancel_requested = true
    const err = await getAnthropic(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.create({ model: 'c', max_tokens: 1, messages: [] } as never)
      .then(() => null, (e: unknown) => e)
    expect(isPhysicalAdmissionRefusal(err)).toBe(true)
    expect(seen.length, 'no physical call was made').toBe(0)
  })

  it('C23 — a rotated claim never reaches Anthropic messages.stream', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    state.run.claim_id = 'someone-else'
    const err = await getAnthropic(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.stream({ model: 'c', max_tokens: 1, messages: [] } as never)
      .then(() => null, (e: unknown) => e)
    expect(isPhysicalAdmissionRefusal(err)).toBe(true)
    expect(seen.length, 'no physical call was made').toBe(0)
  })

  it('C24 — the refusal keeps its identity through the provider-error mapping', async () => {
    // `provablyNotBilled` inspects a status code, so a refusal falls through it
    // today. This pins that: re-wrapped as ProviderNotDispatchedError it would
    // still release, but the spend layer would no longer be able to tell the
    // two apart, and neither would a reviewer.
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    state.run.status = 'cancelled'
    const err = await getAnthropic(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.create({ model: 'c', max_tokens: 1, messages: [] } as never)
      .then(() => null, (e: unknown) => e)
    expect(isPhysicalAdmissionRefusal(err), 'not re-labelled as a provider verdict').toBe(true)
    expect((err as { refusal?: string }).refusal, 'and it says which authority refused').toBe('FENCED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C9–C11 · in-flight authority loss reaches the owner without killing the call', () => {
  it('C9 — an authority read failure MID-FLIGHT does not abort the request', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [] } as never).then(() => 'ok', e => e)
    await inFlight
    const sig = seen.at(-1)!.signal!
    state.runReadFails = true
    await tick()
    expect(sig.aborted, 'a database blip is not a stop').toBe(false)
    state.endStream = null
    void p
  })

  it('C10 — the owner is handed LIVE flight state, not a value copied at return', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    let flight: { authorityUnavailable: boolean } | undefined
    const stream = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND,
        onFlight: (f: never) => { flight = f } } as never,
      { model: 'gpt', messages: [], stream: true } as never,
    )
    void (async () => { for await (const _ of stream as AsyncIterable<unknown>) { /* … */ } })().catch(() => {})
    expect(flight, 'the owner received a flight handle').toBeDefined()
    expect(flight!.authorityUnavailable, 'nothing has gone wrong yet').toBe(false)

    state.runReadFails = true
    await tick()
    expect(flight!.authorityUnavailable,
      'the SAME handle now reports the later failure').toBe(true)
  })

  it('C11 — an unreadable authority latches: it does not clear itself on the next poll', async () => {
    vi.useFakeTimers()
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    let flight: { authorityUnavailable: boolean } | undefined
    const stream = await openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND,
        onFlight: (f: never) => { flight = f } } as never,
      { model: 'gpt', messages: [], stream: true } as never,
    )
    void (async () => { for await (const _ of stream as AsyncIterable<unknown>) { /* … */ } })().catch(() => {})
    state.runReadFails = true
    await tick()
    state.runReadFails = false
    await tick()
    expect(flight!.authorityUnavailable,
      'a recovered read does not un-say that a window went unobserved').toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C12–C14 · speech: the raw fetch is governed like every other physical call', () => {
  let realFetch: typeof globalThis.fetch
  beforeEach(() => {
    realFetch = globalThis.fetch
    process.env.OPENAI_API_KEY = 'test-key'
  })
  afterEach(() => { globalThis.fetch = realFetch })

  /** A fetch that holds until aborted. */
  function holdingFetch() {
    globalThis.fetch = ((_u: unknown, init?: { signal?: AbortSignal }) =>
      hold('openai.speech', init?.signal)) as never
  }

  it('C12 — CONTRACT_ONLY: a global pause aborts an in-flight speech request', async () => {
    vi.useFakeTimers()
    holdingFetch()
    const { openAISpeech } = await import('@/lib/ai/openai-client')
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = openAISpeech(
      { project: { projectId: PROJ }, execution: EXEC_GLOBAL } as never,
      { model: 'tts', input: 'hej' }).then(() => 'ok', e => e)
    await inFlight
    const sig = seen.at(-1)!.signal
    expect(sig, 'speech received a governance signal').toBeDefined()
    state.globalPaused = true
    await tick()
    expect(sig!.aborted, 'the pause reached the raw fetch').toBe(true)
    await p
  })

  it('C13 — RUN_BOUND: cancellation aborts an in-flight speech request', async () => {
    vi.useFakeTimers()
    holdingFetch()
    const { openAISpeech } = await import('@/lib/ai/openai-client')
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = openAISpeech(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'tts', input: 'hej' }).then(() => 'ok', e => e)
    await inFlight
    const sig = seen.at(-1)!.signal!
    state.run.cancel_requested = true
    await tick()
    expect(sig.aborted).toBe(true)
    await p
  })

  it('C14 — speech is ADMITTED: a cancelled run never reaches fetch', async () => {
    let called = 0
    globalThis.fetch = (() => { called += 1; return Promise.resolve(new Response('x')) }) as never
    const { openAISpeech } = await import('@/lib/ai/openai-client')
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    state.run.cancel_requested = true
    const err = await openAISpeech(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'tts', input: 'hej' }).then(() => null, e => e)
    expect(isPhysicalAdmissionRefusal(err)).toBe(true)
    expect(called, 'no HTTP request was made').toBe(0)
  })

  it('C14b — the watch survives until the BODY is consumed, not until headers', async () => {
    vi.useFakeTimers()
    let push!: (v: Uint8Array) => void
    let close!: () => void
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        push = v => c.enqueue(v)
        close = () => c.close()
      },
    })
    globalThis.fetch = (() => Promise.resolve(new Response(body, { status: 200 }))) as never
    const { openAISpeech } = await import('@/lib/ai/openai-client')
    const res = await openAISpeech(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'tts', input: 'hej' })

    // Headers have arrived; the audio has not.
    const reads = state.runReads
    await tick()
    expect(state.runReads,
      'authority is still being watched while the body downloads').toBeGreaterThan(reads)

    const drained = res.arrayBuffer()
    push(new Uint8Array([1, 2, 3]))
    close()
    await drained
    const after = state.runReads
    await tick()
    expect(state.runReads, 'and the watch stops once the body is complete').toBe(after)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C15–C17 · the caller keeps its own abort', () => {
  it('C15 — Anthropic create: a caller `options.signal` is composed, not discarded', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const caller = new AbortController()
    const p = getAnthropic({ project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.create({ model: 'c', max_tokens: 1, messages: [] } as never,
                       { signal: caller.signal } as never).then(() => 'ok', e => e)
    await new Promise(r => setTimeout(r, 0))
    const sig = seen.at(-1)!.signal!
    caller.abort(new Error('caller changed its mind'))
    await p
    expect(sig.aborted, 'the caller could still abort its own request').toBe(true)
  })

  it('C16 — Anthropic stream: a caller `options.signal` is composed, not discarded', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const caller = new AbortController()
    getAnthropic({ project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.stream({ model: 'c', max_tokens: 1, messages: [] } as never,
                       { signal: caller.signal } as never)
    await new Promise(r => setTimeout(r, 0))
    const sig = seen.at(-1)!.signal!
    caller.abort(new Error('caller changed its mind'))
    expect(sig.aborted).toBe(true)
  })

  it('C17 — OpenAI: a caller `init.signal` reaches the SDK alongside governance', async () => {
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const caller = new AbortController()
    const p = openAIChatCompletion(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never,
      { model: 'gpt', messages: [] } as never,
      { signal: caller.signal }).then(() => 'ok', e => e)
    await new Promise(r => setTimeout(r, 0))
    const sig = seen.at(-1)!.signal!
    caller.abort(new Error('caller changed its mind'))
    await p
    expect(sig.aborted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C18 · an unobservable stream end is never treated as an end', () => {
  it('C18 — with no termination seam the watch is NOT released at handle return', async () => {
    vi.useFakeTimers()
    anthropicStreamSeam.mode = 'none'
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    getAnthropic({ project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.stream({ model: 'c', max_tokens: 1, messages: [] } as never)
    await vi.advanceTimersByTimeAsync(0)
    const sig = seen.at(-1)!.signal!

    state.run.cancel_requested = true
    await tick()
    expect(sig.aborted,
      'a stream whose end we cannot see is still watched').toBe(true)
  })

  it('C18b — an ITERABLE-only stream is watched until iteration ENDS, then released', async () => {
    vi.useFakeTimers()
    anthropicStreamSeam.mode = 'iterable'
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    // The governed wrapper is async (it runs inside the spend boundary), so the
    // handle arrives as a promise — iterating the promise itself would silently
    // never start the stream.
    const stream = await getAnthropic(
      { project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
      .messages.stream({ model: 'c', max_tokens: 1, messages: [] } as never)
    await vi.advanceTimersByTimeAsync(0)
    const sig = seen.at(-1)!.signal!
    const drained = (async () => {
      for await (const _ of stream as unknown as AsyncIterable<unknown>) { /* … */ }
    })().catch(() => {})

    // Still open: authority is being polled.
    const during = state.runReads
    await tick()
    expect(state.runReads, 'watched while iterating').toBeGreaterThan(during)

    state.endStream!()
    await drained
    state.run.cancel_requested = true
    await tick()
    // The discriminating assertion. A never-released watcher would ALSO have
    // aborted here, so asserting `aborted === true` would prove nothing about
    // which seam ran; only release-at-termination produces this.
    expect(sig.aborted, 'iteration termination released the watch').toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('C19–C21 · the RUNNER call sites, not just the adapters', () => {
  /**
   * The adapters are proven above. That is exactly what Phase 1 proved before a
   * review found no production call site passed anything — a helper can be
   * flawless and unreachable. These drive `runStep` itself.
   */
  it('C19 — runStep threads authority: a cancellation aborts the OpenAI request it makes', async () => {
    vi.useFakeTimers()
    const { runStep } = await import('@/lib/ai/runner')
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = runStep({
      model: 'gpt-4o', systemPrompt: 's', userMessage: 'u',
      execution: EXEC_PROJECT, authority: RUN_BOUND,
    } as never).then(() => 'ok', e => e)
    await inFlight
    const sig = seen.at(-1)!.signal
    expect(sig, 'the runner reached a governed adapter').toBeDefined()
    state.run.cancel_requested = true
    await tick()
    expect(sig!.aborted, 'and the descriptor survived the whole way down').toBe(true)
    await p
  })

  it('C20 — runStep threads the CALLER signal into the OpenAI request', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    const caller = new AbortController()
    const p = runStep({
      model: 'gpt-4o', systemPrompt: 's', userMessage: 'u',
      execution: EXEC_PROJECT, authority: RUN_BOUND, signal: caller.signal,
    } as never).then(() => 'ok', e => e)
    await new Promise(r => setTimeout(r, 0))
    const sig = seen.at(-1)!.signal!
    caller.abort(new Error('caller changed its mind'))
    await p
    expect(sig.aborted, 'input.signal is not a field nothing reads').toBe(true)
  })

  it('C21 — runStep threads authority into the ANTHROPIC request it makes', async () => {
    vi.useFakeTimers()
    const { runStep } = await import('@/lib/ai/runner')
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = runStep({
      model: 'claude-sonnet-4-20250514', systemPrompt: 's', userMessage: 'u',
      execution: EXEC_PROJECT, authority: RUN_BOUND,
    } as never).then(() => 'ok', e => e)
    await inFlight
    const sig = seen.at(-1)!.signal!
    state.run.cancel_requested = true
    await tick()
    expect(sig.aborted).toBe(true)
    await p
  })
})
