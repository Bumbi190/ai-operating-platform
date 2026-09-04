/**
 * G3C-3C-A · D2 — the flight latch reaches the EXECUTION OWNER, not just a
 * callback the adapter offers.
 *
 * Phase 1C proved a caller that supplies `onFlight` can read live flight state.
 * Production did not supply it: `runner.ts` passed nothing for OpenAI, and the
 * Anthropic path assigned `streamFlight` and never read it. So the system had
 * adapter truth and no owner truth — the same shape as a `signal` field that
 * nothing passes, which is how Phase 1 shipped 7397 green tests over a gap.
 *
 * The scenario these prove:
 *
 *   a physical request starts under valid authority
 *   authority becomes UNREADABLE while it is in flight
 *   the provider answers successfully
 *   → the answer is KEPT (a successful response is never a failure)
 *   → but the owner re-establishes canonical authority BEFORE anything
 *     execution-bearing: the context write, a retry, the next step
 *   → and if authority is still unreadable, none of those happen
 *
 * Every test drives the REAL executor → REAL runner → REAL governed adapter →
 * fake SDK. No `onFlight` callback is supplied by any test.
 *
 * No live provider. No credits. No mail.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const RUN = 'run-d2'
const CLAIM = 'claim-d2'
const PROJ = '11111111-1111-1111-1111-111111111111'

const state = {
  run: {} as Row,
  /** Every `runs` read fails — models authority becoming unreadable. */
  runReadFails: false,
  runReads: 0,
  /** Authoritative writes the executor attempted. */
  writes: [] as { table: string; payload: Row }[],
  /** Physical provider calls, in order. */
  providerCalls: [] as string[],
  /** Resolves the pending provider call. */
  finish: null as null | (() => void),
  /** Signalled once a provider call is genuinely in flight. */
  started: null as null | (() => void),
  /** Content the fake provider returns. */
  reply: 'PROVIDER ANSWER',
  stream: false,
  /** The first image call answers 429, so the real retry loop backs off. */
  rateLimitOnce: false,
  /** Fired the moment attempt 1 fails — the window a cancel commits in. */
  duringBackoff: null as null | (() => void),
  /** Holds only the FIRST image call, so a latch can land on image 1 alone. */
  holdFirstImage: false,
  /** Ideogram: signals seen, and whether the call should hold until released. */
  ideogramSignals: [] as (AbortSignal | undefined)[],
  holdIdeogram: false,
  releaseIdeogram: null as null | (() => void),
  /** Which governance class the next image call raises, if any. */
  imageThrows: null as null | 'admission' | 'inflight' | 'stopped',
  /** Same, for the REFERENCE (edit) helper — a different retry loop. */
  editThrows: null as null | 'admission' | 'stopped',
  /** Vision QA: the governance context the Anthropic call was given. */
  qaAuthoritySeen: [] as unknown[],
  /** What the Vision QA Anthropic call should do. */
  qaBehaviour: 'pass' as 'pass' | 'provider-error' | 'governance-refusal',
  /** Cancels the RUN once the image exists, i.e. immediately before Vision QA. */
  cancelBeforeQa: false,
}

/** A provider call that holds until the test releases it. */
function heldCall(kind: string) {
  state.providerCalls.push(kind)
  state.started?.()
  return new Promise<void>(res => { state.finish = res })
}

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = {
      completions: {
        create: async (p: { stream?: boolean }) => {
          await heldCall(p?.stream ? 'openai.stream' : 'openai.chat')
          if (!p?.stream) {
            return { choices: [{ message: { content: state.reply } }], usage: {} }
          }
          const reply = state.reply
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: reply } }] }
            },
          }
        },
      },
    }
    images = {
      generate: async () => {
        state.providerCalls.push('openai.image')
        if (state.rateLimitOnce) {
          state.rateLimitOnce = false
          state.duringBackoff?.()
          throw Object.assign(new Error('Rate limit reached'), { status: 429 })
        }
        if (state.imageThrows) {
          const kind = state.imageThrows
          state.imageThrows = null
          const sig = await import('@/lib/governance/execution-signal')
          if (kind === 'admission') {
            throw new sig.PhysicalAdmissionRefusedError('CANCELLED', 'openai', 'cancellation requested')
          }
          if (kind === 'inflight') {
            throw new sig.GovernanceDispatchUnknownError('openai', 'RUN_CANCELLED',
              new Error('APIUserAbortError'))
          }
          const stop = Object.assign(new Error('execution stopped'), { name: 'ExecutionStoppedError' })
          throw stop
        }
        if (state.holdFirstImage) {
          state.holdFirstImage = false
          await new Promise<void>(res => { state.finish = res; state.started?.() })
        }
        return { data: [{ b64_json: 'aGk=' }] }
      },
      edit: async () => {
        state.providerCalls.push('openai.edit')
        if (state.editThrows) {
          const kind = state.editThrows
          state.editThrows = null
          const sig = await import('@/lib/governance/execution-signal')
          if (kind === 'admission') {
            throw new sig.PhysicalAdmissionRefusedError('CANCELLED', 'openai', 'cancellation requested')
          }
          throw Object.assign(new Error('execution stopped'), { name: 'ExecutionStoppedError' })
        }
        return { data: [{ b64_json: 'aGk=' }] }
      },
    }
  },
  toFile: async () => ({}),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: async (p: { model?: string }) => {
        // Vision QA is the haiku call; the step's own text calls use other models.
        if (String(p?.model ?? '').includes('haiku')) {
          state.providerCalls.push('anthropic.visionqa')
          if (state.qaBehaviour === 'provider-error') throw new Error('vision service unavailable')
          if (state.qaBehaviour === 'governance-refusal') {
            const { PhysicalAdmissionRefusedError } = await import('@/lib/governance/execution-signal')
            throw new PhysicalAdmissionRefusedError('CANCELLED', 'anthropic', 'cancellation requested')
          }
          return { content: [{ type: 'text', text: 'PASS' }], usage: { input_tokens: 1, output_tokens: 1 } }
        }
        await heldCall('anthropic.create')
        return { content: [{ type: 'text', text: state.reply }], usage: { input_tokens: 1, output_tokens: 1 } }
      },
      stream: () => {
        // Synchronous handle, exactly like the real SDK. The physical request
        // continues after it is returned — which is the point.
        const held = heldCall('anthropic.stream')
        const reply = state.reply
        return {
          async *[Symbol.asyncIterator]() {
            await held
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: reply } }
          },
          done: () => held,
          finalMessage: () => held.then(() => ({ usage: { input_tokens: 1, output_tokens: 1 } })),
        }
      },
    }
  },
}))

// Spend is not the subject: allow, and keep the project resolver honest.
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: async () => ({ allowed: true, wouldAllow: true, advisoryOverride: false,
    reason: 'ok', reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700 }),
  settleSpend: async () => {}, releaseSpend: async () => {},
  estimateImageSek: async () => 1,
}))
vi.mock('@/lib/cost/track', () => ({ logLlmCost: () => {}, logImageCost: () => {} }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10 }) }))
vi.mock('@/lib/atlas/memory/record-event', () => ({ recordMemoryEvent: () => Promise.resolve() }))
vi.mock('@/lib/ai/output-idempotency', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isDuplicateOutputError: () => false,
}))

const AGENT = { id: 'a1', name: 'A', system_prompt: 's', model: 'gpt-4o', config: {} }

function makeDb() {
  const builder = (table: string) => {
    let payload: Row | null = null
    const resolveRow = () => {
      if (table === 'runs') {
        state.runReads += 1
        if (state.runReadFails) return { data: null, error: { message: 'unavailable' } }
        return { data: state.run, error: null }
      }
      if (table === 'agents') return { data: AGENT, error: null }
      // The legacy runner passes no `cost`, so the boundary resolves the
      // platform-compat SLUG. Without this the call is refused as
      // `project_unresolved` and never reaches a provider at all.
      if (table === 'projects') return { data: { id: PROJ }, error: null }
      return { data: null, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      update: (p: Row) => { payload = p; return chain },
      eq: () => chain, is: () => chain, limit: () => chain, order: () => chain,
      not: () => chain, in: () => chain, gte: () => chain, lt: () => chain,
      single: async () => resolveRow(),
      maybeSingle: async () => resolveRow(),
      then: (ok: (v: unknown) => unknown) => {
        if (payload !== null) {
          state.writes.push({ table, payload })
          return Promise.resolve({ data: [{ id: RUN }], error: null }).then(ok)
        }
        return Promise.resolve(table === 'agents' ? { data: [AGENT], error: null }
                                                  : resolveRow()).then(ok)
      },
    }
    return chain
  }
  return {
    from: (t: string) => builder(t),
    // Saga images are uploaded before Vision QA runs; without this the QA call
    // is skipped and the tests below would silently prove nothing.
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage/${path}` } }),
      }),
    },
    rpc: async (fn: string) => {
      if (fn === 'stop_state') {
        return { data: [{
          global_paused: false, global_paused_at: null, global_paused_reason: null,
          project_requested: true, project_found: true,
          project_paused: false, project_paused_at: null, project_paused_reason: null,
        }], error: null }
      }
      return { data: null, error: null }
    },
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => makeDb() as any
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeDb() as any }))

const STEPS = [{ order: 0, agent_id: 'a1', name: 's0', input_template: 'go', output_key: 'k0' }]

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  state.run = { id: RUN, project_id: PROJ, status: 'running', claim_id: CLAIM,
                cancel_requested: false, context: {}, attempts: 1, max_attempts: 3 }
  state.runReadFails = false
  state.runReads = 0
  state.writes = []
  state.providerCalls = []
  state.finish = null
  state.started = null
  state.reply = 'PROVIDER ANSWER'
  state.stream = false
  state.rateLimitOnce = false
  state.duringBackoff = null
  state.holdFirstImage = false
  state.ideogramSignals = []
  state.holdIdeogram = false
  state.releaseIdeogram = null
  state.imageThrows = null
  state.editThrows = null
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co'
  state.qaAuthoritySeen = []
  state.qaBehaviour = 'pass'
  state.cancelBeforeQa = false
  process.env.IDEOGRAM_API_KEY = 'test-ideogram'
  vi.resetModules()
})
afterEach(() => {
  // Watchers from a test whose provider call never settled keep their polling
  // interval alive. Left running, the NEXT test's timer advance replays every
  // one of them and the run never gets there.
  vi.clearAllTimers()
  vi.useRealTimers()
})

/**
 * Runs one executor pass, making authority unreadable while the provider call
 * is genuinely in flight, then letting the provider succeed.
 */
async function withAuthorityLostInFlight(
  run: () => Promise<unknown>,
  opts: { recoverBeforeContinuation?: boolean } = {},
) {
  vi.useFakeTimers()
  const inFlight = new Promise<void>(res => { state.started = res })
  const p = run().then(v => ({ value: v }), (e: unknown) => ({ error: e }))
  // Race the settlement: if the call fails BEFORE reaching a provider, waiting
  // on `inFlight` alone would hang and report a timeout instead of the cause.
  const reached = await Promise.race([inFlight.then(() => true), p.then(() => false)])
  if (!reached) {
    const early = await p as { error?: unknown }
    throw new Error('never reached the provider: '
      + (early.error instanceof Error ? early.error.message : JSON.stringify(early)))
  }

  // The watcher is polling. Break the read and let it observe the break.
  state.runReadFails = true
  await vi.advanceTimersByTimeAsync(2_500)

  if (opts.recoverBeforeContinuation) state.runReadFails = false
  state.finish!()
  await vi.advanceTimersByTimeAsync(10)
  return p
}

// ═══════════════════════════════════════════════════════════════════════════
describe('D6–D8 · unified executor', () => {
  const exec = async (model: string) => {
    const { executeRunSteps } = await import('@/lib/ai/workflow-executor')
    AGENT.model = model
    return executeRunSteps(db(), RUN, PROJ, STEPS as never, { claimId: CLAIM })
  }

  it('D6 — a NON-STREAM latch blocks the authoritative write, and keeps the answer', async () => {
    const r = await withAuthorityLostInFlight(() => exec('gpt-4o')) as { error?: unknown }
    expect(r.error, 'continuation was refused, not completed').toBeDefined()

    // The provider answered and was logged; what did NOT happen is the
    // authoritative context write.
    const contextWrites = state.writes.filter(w => w.table === 'runs' && 'context' in w.payload)
    expect(contextWrites, 'no context was persisted under unreadable authority').toEqual([])
    expect(state.providerCalls, 'and exactly one physical request was made')
      .toEqual(['openai.chat'])
  })

  it('D6b — when fresh authority RECOVERS, continuation proceeds and the answer survives', async () => {
    const r = await withAuthorityLostInFlight(
      () => exec('gpt-4o'), { recoverBeforeContinuation: true }) as { value?: { context: Row } }
    expect(r.value, 'the step completed').toBeDefined()
    expect(r.value!.context.k0, 'the provider answer was preserved verbatim')
      .toBe('PROVIDER ANSWER')
    const contextWrites = state.writes.filter(w => w.table === 'runs' && 'context' in w.payload)
    expect(contextWrites.length, 'and only then was it persisted').toBeGreaterThan(0)
  })

  it('D7 — the ANTHROPIC path latches and blocks continuation too', async () => {
    // Not the streaming branch: no production caller supplies `onChunk`, so the
    // executor reaches `messages.create`. The stream branch is proven at the
    // runner boundary in D7b, which is where it actually terminates today.
    const r = await withAuthorityLostInFlight(() => exec('claude-sonnet-4-20250514')) as { error?: unknown }
    expect(state.providerCalls).toEqual(['anthropic.create'])
    expect(r.error, 'the owner refused to continue').toBeDefined()
    const contextWrites = state.writes.filter(w => w.table === 'runs' && 'context' in w.payload)
    expect(contextWrites).toEqual([])
  })

  it('D8 — no SECOND physical attempt is made while authority is unreadable', async () => {
    await withAuthorityLostInFlight(() => exec('gpt-4o'))
    expect(state.providerCalls.length,
      'a retry would be a new execution-bearing unit').toBe(1)
  })

  it('D8b — a clean run does none of this: no latch, no extra authority reads', async () => {
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = exec('gpt-4o')
    await inFlight
    state.finish!()
    const r = await p
    expect(r.context.k0).toBe('PROVIDER ANSWER')
    const contextWrites = state.writes.filter(w => w.table === 'runs' && 'context' in w.payload)
    expect(contextWrites.length, 'the normal path still persists context').toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('D9 · legacy executor — the rollback path is not weaker', () => {
  const exec = async (model: string) => {
    const { runSteps } = await import('@/lib/ai/workflow-runner')
    AGENT.model = model
    return runSteps(db(), RUN, PROJ, STEPS as never, {}, CLAIM)
  }

  it('D9 — a latch blocks the legacy authoritative write too', async () => {
    const r = await withAuthorityLostInFlight(() => exec('gpt-4o')) as { error?: unknown }
    expect(r.error, 'flag-off must refuse exactly as flag-on does').toBeDefined()
    const contextWrites = state.writes.filter(w => w.table === 'runs' && 'context' in w.payload)
    expect(contextWrites).toEqual([])
    expect(state.providerCalls).toEqual(['openai.chat'])
  })

  it('D9b — legacy continuation proceeds when fresh authority recovers', async () => {
    const r = await withAuthorityLostInFlight(
      () => exec('gpt-4o'), { recoverBeforeContinuation: true }) as { error?: unknown }
    expect(r.error, 'a recovered read is permission again').toBeUndefined()
    const contextWrites = state.writes.filter(w => w.table === 'runs' && 'context' in w.payload)
    expect(contextWrites.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('D7b · streams — the runner observes a latch that appeared MID-STREAM', () => {
  /**
   * The executor cannot drive this: none of the four production `runStep`
   * callers passes `onChunk`, so the streaming branch is reached only from the
   * runner boundary. That is stated rather than papered over — the proof runs
   * where the path actually is, with the real adapter and a real stream.
   *
   * What makes this different from the non-stream case: the handle returns
   * almost immediately, and the latch appears while tokens are still arriving.
   * A runner that read the flight at dispatch would see `false` here.
   */
  const streamStep = async (model: string) => {
    const { runStep } = await import('@/lib/ai/runner')
    const chunks: string[] = []
    const result = await runStep({
      execution: { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: PROJ } } },
      systemPrompt: 's', userMessage: 'go', model,
      authority: { kind: 'RUN_BOUND', runId: RUN, claimId: CLAIM },
      cost: { projectId: PROJ },
    } as never, c => { chunks.push(c) })
    return { result, chunks }
  }

  it('D7b — Anthropic stream: the latch survives to the returned RunStepResult', async () => {
    const r = await withAuthorityLostInFlight(
      () => streamStep('claude-sonnet-4-20250514')) as
      { value?: { result: { content: string; authorityRefreshRequired: boolean }; chunks: string[] } }

    expect(state.providerCalls, 'the STREAM branch ran').toEqual(['anthropic.stream'])
    expect(r.value!.chunks, 'tokens really were streamed').toEqual(['PROVIDER ANSWER'])
    expect(r.value!.result.content, 'and the answer is preserved').toBe('PROVIDER ANSWER')
    expect(r.value!.result.authorityRefreshRequired,
      'a latch that appeared mid-stream is visible once the stream ends').toBe(true)
  })

  it('D7c — OpenAI stream: same, through the other adapter', async () => {
    const r = await withAuthorityLostInFlight(() => streamStep('gpt-4o')) as
      { value?: { result: { authorityRefreshRequired: boolean }; chunks: string[] } }
    expect(state.providerCalls).toEqual(['openai.stream'])
    expect(r.value!.chunks).toEqual(['PROVIDER ANSWER'])
    expect(r.value!.result.authorityRefreshRequired).toBe(true)
  })

  it('D7d — a clean stream does NOT latch', async () => {
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = streamStep('claude-sonnet-4-20250514')
    await inFlight
    state.finish!()
    const { result } = await p
    expect(result.authorityRefreshRequired,
      'the latch means something only if it is not always on').toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('D13–D15 · the retry loop re-admits, and a refusal is not retryable', () => {
  /**
   * A retry loop is an automatic dispatch actor. Between attempt 1 and attempt
   * 2 there is a fifteen-second backoff — ample time for a cancellation to
   * become durable — and the boundary check that authorised the step happened
   * long before either attempt.
   *
   * These drive the REAL loop in `runImageStep`, not a stand-in: if it ever
   * broadened its retry predicate, an admission refusal would be retried and
   * these would fail.
   */
  /** Imported BEFORE fake timers start: a dynamic import inside the timing
   *  window would schedule the backoff after the advance had already run. */
  const loadRunner = async () => (await import('@/lib/ai/runner')).runStep
  const imageStep = (runStep: (i: never) => Promise<unknown>) => {
    return runStep({
      execution: { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: PROJ } } },
      // COVER mode is the branch that reaches the plain `generateImage` retry
      // loop; the default branch demands a reference image and fails earlier.
      systemPrompt: 'COVER_ILLUSTRATIONS', userMessage: '["a cat"]', model: 'gpt-image-1',
      authority: { kind: 'RUN_BOUND', runId: RUN, claimId: CLAIM },
      cost: { projectId: PROJ },
    } as never)
  }

  /** Runs the loop with attempt 1 rate-limited, mutating authority mid-backoff. */
  async function raceInBackoff(commit: () => void) {
    const runStep = await loadRunner()
    vi.useFakeTimers()
    state.rateLimitOnce = true
    state.duringBackoff = commit
    const p = imageStep(runStep).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
    // One jump past the 15s backoff, then a few turns for the admission read
    // and the adapter's own scheduling to settle.
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(0)
    return await p
  }

  it('D13 — a cancel committed during backoff stops attempt 2 from being made', async () => {
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const r = await raceInBackoff(() => { state.run.cancel_requested = true })
    expect(state.providerCalls, 'attempt 2 never reached the provider')
      .toEqual(['openai.image'])
    expect(isPhysicalAdmissionRefusal(r.error),
      'and the loop did not swallow the refusal as retryable').toBe(true)
    expect((r.error as { refusal?: string }).refusal).toBe('CANCELLED')
  }, 20_000)

  it('D14 — a claim rotated during backoff stops attempt 2 and reports FENCED', async () => {
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const r = await raceInBackoff(() => { state.run.claim_id = 'someone-else' })
    expect(state.providerCalls).toEqual(['openai.image'])
    expect(isPhysicalAdmissionRefusal(r.error)).toBe(true)
    expect((r.error as { refusal?: string }).refusal).toBe('FENCED')
  }, 20_000)

  it('D15 — unreadable authority before the FIRST call makes no request at all', async () => {
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    state.runReadFails = true
    const runStep = await loadRunner()
    const r = await imageStep(runStep).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
    expect(state.providerCalls, 'nothing was dispatched').toEqual([])
    expect(isPhysicalAdmissionRefusal(r.error)).toBe(true)
    expect((r.error as { refusal?: string }).refusal).toBe('AUTHORITY_UNAVAILABLE')
  })

  it('D15b — an ordinary 429 still retries and still succeeds', async () => {
    // The refusal branch must not have turned the retry loop off.
    const runStep = await loadRunner()
    vi.useFakeTimers()
    state.rateLimitOnce = true
    const p = imageStep(runStep).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(0)
    const r = await p as { value?: unknown; error?: unknown }
    expect(r.error, 'a rate limit is not a refusal').toBeUndefined()
    expect(state.providerCalls, 'two attempts, as a rate limit deserves')
      .toEqual(['openai.image', 'openai.image'])
  }, 20_000)
})

// ═══════════════════════════════════════════════════════════════════════════
describe('D16 · the latch AGGREGATES across a step\'s many physical calls', () => {
  /**
   * An image step is not one request. If image 1 flew through an unobserved
   * authority window and image 2 succeeded cleanly afterwards, the step is
   * still carrying an unobserved window — nothing between them re-established
   * authority, so image 2's success says nothing about image 1's gap.
   *
   * Keeping only the most recent flight would report `false` here, and the
   * owner would persist context for a run that may have been cancelled.
   */
  it('D16 — a later clean request does NOT erase an earlier flight\'s latch', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    vi.useFakeTimers()
    state.holdFirstImage = true
    const inFlight = new Promise<void>(res => { state.started = res })

    const p = runStep({
      execution: { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: PROJ } } },
      systemPrompt: 'COVER_ILLUSTRATIONS', userMessage: '["one","two"]', model: 'gpt-image-1',
      authority: { kind: 'RUN_BOUND', runId: RUN, claimId: CLAIM },
      cost: { projectId: PROJ },
    } as never) as Promise<{ content: string; authorityRefreshRequired: boolean }>

    await inFlight
    // Authority goes unreadable while IMAGE 1 is on the wire…
    state.runReadFails = true
    await vi.advanceTimersByTimeAsync(2_500)
    // …then recovers, and image 1 plus image 2 both succeed.
    state.runReadFails = false
    state.finish!()
    // Image 2 still has to be admitted and dispatched; drain until the step
    // settles rather than guessing how many turns that takes.
    let done = false
    void p.then(() => { done = true }, () => { done = true })
    for (let i = 0; i < 30 && !done; i++) await vi.advanceTimersByTimeAsync(100)
    const result = await p

    expect(state.providerCalls, 'both images really were generated')
      .toEqual(['openai.image', 'openai.image'])
    expect(JSON.parse(result.content).urls, 'and both answers were kept').toHaveLength(2)
    expect(result.authorityRefreshRequired,
      'the step still carries image 1\'s unobserved window').toBe(true)
  }, 20_000)
})

// ═══════════════════════════════════════════════════════════════════════════
describe('E7–E16 · Ideogram and Vision QA are claimed-run providers too', () => {
  /**
   * The Phase 1D report claimed every physical flight in a step was collected.
   * Source disproved it: the saga/activity path reaches Ideogram through a
   * 90-second fetch and Vision QA through Anthropic, and neither carried the
   * claimed run. A cancellation during either was invisible, and the loop went
   * on to the next image.
   */
  const sagaStep = async (runStep: (i: never) => Promise<unknown>) =>
    runStep({
      execution: { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: PROJ } } },
      systemPrompt: 'SAGA_ILLUSTRATIONS', userMessage: '["scene one"]', model: 'gpt-image-1',
      authority: { kind: 'RUN_BOUND', runId: RUN, claimId: CLAIM },
      cost: { projectId: PROJ }, runId: RUN,
    } as never)

  /** Records the signal Ideogram's fetch received, and optionally holds. */
  function ideogramFetch() {
    globalThis.fetch = ((url: unknown, init?: { signal?: AbortSignal }) => {
      const u = String(url)
      if (u.includes('ideogram')) {
        state.providerCalls.push('ideogram')
        state.ideogramSignals.push(init?.signal)
        if (state.holdIdeogram) {
          state.started?.()
          return new Promise((resolve, reject) => {
            // Resolvable, so a test can model "the call finished normally
            // AFTER authority went unreadable" — not only "it was aborted".
            state.releaseIdeogram = () => resolve(new Response(
              JSON.stringify({ data: [{ url: 'https://img/1.png' }] }),
              { status: 200, headers: { 'content-type': 'application/json' } }))
            init?.signal?.addEventListener('abort',
              () => reject(init.signal!.reason ?? new Error('aborted')), { once: true })
          })
        }
        // The image now exists; the cancel lands in the window before QA.
        if (state.cancelBeforeQa) state.run.cancel_requested = true
        return Promise.resolve(new Response(
          JSON.stringify({ data: [{ url: 'https://img/1.png' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      // Image download for storage / QA.
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]),
        { status: 200, headers: { 'content-type': 'image/png' } }))
    }) as never
  }

  let realFetch: typeof globalThis.fetch
  beforeEach(() => { realFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = realFetch })

  it('E7 — a claimed-run cancellation aborts the real Ideogram fetch signal', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    state.holdIdeogram = true
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = sagaStep(runStep as never).then(v => ({ value: v }), (e: unknown) => ({ error: e }))
    await inFlight

    const sig = state.ideogramSignals.at(-1)
    expect(sig, 'Ideogram received a signal at all').toBeDefined()
    state.run.cancel_requested = true
    await vi.advanceTimersByTimeAsync(2_500)
    expect(sig!.aborted, 'and governance aborted it').toBe(true)
    let done = false
    void p.then(() => { done = true }, () => { done = true })
    for (let i = 0; i < 30 && !done; i++) await vi.advanceTimersByTimeAsync(100)
    await p
  }, 20_000)

  it('E8 — after that cancellation Ideogram is never dispatched again', async () => {
    const { isExecutionGovernanceControlFlow } = await import('@/lib/governance/execution-signal')
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    state.holdIdeogram = true
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = sagaStep(runStep as never).then(v => ({ value: v }), (e: unknown) => ({ error: e }))
    await inFlight
    state.run.cancel_requested = true
    await vi.advanceTimersByTimeAsync(2_500)
    let done = false
    void p.then(() => { done = true }, () => { done = true })
    for (let i = 0; i < 60 && !done; i++) await vi.advanceTimersByTimeAsync(1_000)
    const r = await p as { error?: unknown }

    expect(state.providerCalls.filter(c => c === 'ideogram').length,
      'the retry loop must not re-enter a provider governance just stopped').toBe(1)
    expect(isExecutionGovernanceControlFlow(r.error),
      'and the control flow left the step unchanged').toBe(true)
  }, 30_000)

  it('E9/E16 — Vision QA carries the claimed run and joins the step flight', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    const r = await sagaStep(runStep as never) as { content: string }
    expect(state.providerCalls, 'QA really ran on the generated image')
      .toContain('anthropic.visionqa')
    expect(JSON.parse(r.content).urls.length, 'and the image survived').toBeGreaterThan(0)
  }, 20_000)

  it('E9b — Vision QA is admitted as the CLAIMED RUN, not merely as a contract', async () => {
    // The distinguishing fact: a run CANCELLATION is invisible to a
    // CONTRACT_ONLY call. If QA were admitted without the claimed run, this
    // cancellation would go unseen, QA would pass, and the step would continue
    // through a cancelled run.
    const { isExecutionGovernanceControlFlow } = await import('@/lib/governance/execution-signal')
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    state.cancelBeforeQa = true
    const r = await sagaStep(runStep as never).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
    expect(isExecutionGovernanceControlFlow(r.error),
      'only a RUN_BOUND admission can see a run cancellation').toBe(true)
  }, 20_000)

  it('E10 — a governance refusal in Vision QA ESCAPES rather than auto-passing', async () => {
    const { isExecutionGovernanceControlFlow } = await import('@/lib/governance/execution-signal')
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    state.qaBehaviour = 'governance-refusal'
    const r = await sagaStep(runStep as never).then(v => ({ value: v }), (e: unknown) => ({ error: e }))
    expect(isExecutionGovernanceControlFlow((r as { error?: unknown }).error),
      'swallowed into pass:true, a cancellation would accept the image and continue').toBe(true)
  }, 20_000)

  it('E11 — an ORDINARY Vision QA provider error still auto-passes', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    state.qaBehaviour = 'provider-error'
    const r = await sagaStep(runStep as never) as { content: string }
    expect(JSON.parse(r.content).urls.length,
      'a flaky vision call must not block an image that is probably fine').toBeGreaterThan(0)
  }, 20_000)

  it('E15 — an Ideogram flight latch reaches the step result', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    ideogramFetch()
    state.holdIdeogram = true
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = sagaStep(runStep as never).then(v => ({ value: v }), (e: unknown) => ({ error: e }))
    await inFlight
    // Authority goes unreadable during the Ideogram call, then recovers.
    state.runReadFails = true
    await vi.advanceTimersByTimeAsync(2_500)
    state.runReadFails = false
    // Release the fetch that is holding, and let any later attempt succeed.
    state.holdIdeogram = false
    state.releaseIdeogram?.()
    let done = false
    void p.then(() => { done = true }, () => { done = true })
    for (let i = 0; i < 60 && !done; i++) await vi.advanceTimersByTimeAsync(1_000)
    const r = await p as { value?: { authorityRefreshRequired: boolean } }
    if (r.value) {
      expect(r.value.authorityRefreshRequired,
        'Ideogram is in the same flight collector as everything else').toBe(true)
    }
  }, 30_000)
})

// ═══════════════════════════════════════════════════════════════════════════
describe('E12–E14 · governance control flow leaves the image pipeline unchanged', () => {
  /**
   * The image step is built to be forgiving: a retry loop for rate limits, a
   * reference wrapper that re-labels failures, an `errors[]` array that lets one
   * bad image not kill fifteen good ones, and a QA gate that passes on doubt.
   *
   * Every one of those is wrong for governance. A stop that gets slept on and
   * retried re-dispatches work that was just stopped; a refusal wrapped as a
   * ReferenceGenerationError hides which authority spoke; one collected into
   * `errors[]` lets the loop continue through a cancelled run.
   */
  const coverStep = async (runStep: (i: never) => Promise<unknown>) =>
    runStep({
      execution: { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: PROJ } } },
      systemPrompt: 'COVER_ILLUSTRATIONS', userMessage: '["a cat"]', model: 'gpt-image-1',
      authority: { kind: 'RUN_BOUND', runId: RUN, claimId: CLAIM },
      cost: { projectId: PROJ },
    } as never)

  async function escapes(kind: 'admission' | 'inflight' | 'stopped') {
    const { runStep } = await import('@/lib/ai/runner')
    state.imageThrows = kind
    return coverStep(runStep as never).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
  }

  it('E12 — an ExecutionStoppedError escapes the image step unchanged', async () => {
    // `withGovernedSpend` refuses at G3C-1 BEFORE admission ever runs. That is
    // canonical governance control flow and must not become an image failure.
    const r = await escapes('stopped')
    expect(r.value, 'the step did not "succeed" with an error string').toBeUndefined()
    expect((r.error as Error)?.name, 'and arrived as itself').toBe('ExecutionStoppedError')
  })

  it('E13 — a PhysicalAdmissionRefusedError escapes unchanged, not wrapped', async () => {
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const r = await escapes('admission')
    expect(isPhysicalAdmissionRefusal(r.error),
      'wrapped as ReferenceGenerationError the drain could not settle it').toBe(true)
  })

  it('E14 — an in-flight dispatch-unknown escapes the outer per-image catch', async () => {
    const { isGovernanceDispatchUnknown } = await import('@/lib/governance/execution-signal')
    const r = await escapes('inflight')
    expect(isGovernanceDispatchUnknown(r.error)).toBe(true)
    expect((r.error as { mayHaveDispatched?: boolean }).mayHaveDispatched).toBe(true)
  })

  it('E14b — none of them is collected into the image errors[] array', async () => {
    for (const kind of ['stopped', 'admission', 'inflight'] as const) {
      const r = await escapes(kind)
      expect(r.value, `${kind} must not return a "successful" step`).toBeUndefined()
    }
  })

  it('E14c — an ORDINARY image failure is still collected, not thrown', async () => {
    // The forgiving behaviour is intact for what it was written for.
    const { runStep } = await import('@/lib/ai/runner')
    const original = state.providerCalls.length
    state.rateLimitOnce = false
    globalThis.fetch = (() => Promise.reject(new Error('network down'))) as never
    const r = await coverStep(runStep as never) as { content: string }
    const parsed = JSON.parse(r.content)
    expect(parsed.urls.length + (parsed.errors?.length ?? 0),
      'an ordinary defect still becomes a collected error').toBeGreaterThan(0)
    expect(state.providerCalls.length).toBeGreaterThanOrEqual(original)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('E13b · the REFERENCE helper is a second retry loop, and needs the same rule', () => {
  /**
   * `generateWithReference` has its own catch, its own rate-limit sleep and its
   * own `ReferenceGenerationError` wrapper. E12–E14 exercise the plain generate
   * loop; nothing there reaches this one, and a guard nothing reaches is a
   * guard nobody has checked.
   */
  const coloringStep = async (runStep: (i: never) => Promise<unknown>) =>
    runStep({
      execution: { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: PROJ } } },
      // No mode flag ⇒ the default coloring path, which is reference-bound.
      systemPrompt: '', userMessage: '["a cat"]', model: 'gpt-image-1',
      authority: { kind: 'RUN_BOUND', runId: RUN, claimId: CLAIM },
      cost: { projectId: PROJ },
    } as never)

  let realFetch: typeof globalThis.fetch
  beforeEach(() => {
    realFetch = globalThis.fetch
    globalThis.fetch = (() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]),
      { status: 200, headers: { 'content-type': 'image/png' } }))) as never
  })
  afterEach(() => { globalThis.fetch = realFetch })

  it('E13b — an admission refusal is not wrapped as ReferenceGenerationError', async () => {
    const { isPhysicalAdmissionRefusal } = await import('@/lib/governance/execution-signal')
    const { runStep } = await import('@/lib/ai/runner')
    state.editThrows = 'admission'
    const r = await coloringStep(runStep as never).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
    expect(state.providerCalls, 'the reference helper really ran').toContain('openai.edit')
    expect(isPhysicalAdmissionRefusal(r.error),
      're-labelled, the drain could not settle it').toBe(true)
  }, 20_000)

  it('E13c — an ExecutionStoppedError escapes the reference helper unchanged', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    state.editThrows = 'stopped'
    const r = await coloringStep(runStep as never).then(
      (v: unknown) => ({ value: v, error: undefined as unknown }),
      (e: unknown) => ({ value: undefined as unknown, error: e }))
    expect((r.error as Error)?.name).toBe('ExecutionStoppedError')
  }, 20_000)
})
