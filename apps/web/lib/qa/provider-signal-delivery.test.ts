/**
 * G3C-3C-A — B-series: the composed governance signal REACHES the SDK.
 *
 * Phase 1 shipped 7397 green tests and 18/18 mutation kills while the production
 * call sites never passed the signal at all. Every proof there stopped at the
 * helper, so a `signal` field that nothing read looked identical to one that
 * worked.
 *
 * These do not. Each drives the real governed adapter and asserts on the signal
 * the FAKE SDK METHOD actually received — that it is the composed governance
 * signal, and that losing authority aborts it.
 *
 * No live provider. No credits. No mail.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

const PROJ = '11111111-1111-1111-1111-111111111111'
const RUN = 'run-b-1'
const CLAIM = 'claim-b-1'

/** What the fake SDK saw, per physical call. */
const seen: { signal?: AbortSignal }[] = []

const state = {
  run: {} as Record<string, unknown>,
  globalPaused: false,
  projectPaused: false,
  stopReadFails: false,
  /** Resolves when a fake physical request has started and is holding. */
  started: null as null | (() => void),
}

/** A fake request that blocks until aborted, so abort is observable. */
function hold(signal: AbortSignal | undefined): Promise<never> {
  seen.push({ signal })
  state.started?.()
  return new Promise((_, reject) => {
    if (!signal) return                       // never settles: a dropped signal hangs
    if (signal.aborted) return reject(signal.reason ?? new Error('aborted'))
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
  })
}

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: (_p: unknown, o?: { signal?: AbortSignal }) => hold(o?.signal) } }
    images = {
      generate: (_p: unknown, o?: { signal?: AbortSignal }) => hold(o?.signal),
      edit:     (_p: unknown, o?: { signal?: AbortSignal }) => hold(o?.signal),
    }
    audio = { speech: { create: (_p: unknown, o?: { signal?: AbortSignal }) => hold(o?.signal) } }
  },
  toFile: async () => ({}),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: (_p: unknown, o?: { signal?: AbortSignal }) => hold(o?.signal),
      stream: (_p: unknown, o?: { signal?: AbortSignal }) => {
        seen.push({ signal: o?.signal })
        state.started?.()
        let rejectDone: (e: unknown) => void = () => {}
        const done = new Promise<void>((_, rej) => { rejectDone = rej })
        o?.signal?.addEventListener('abort',
          () => rejectDone(o.signal!.reason ?? new Error('aborted')), { once: true })
        return {
          done: () => done,
          finalMessage: () => done.then(() => ({ usage: {} })),
          controller: new AbortController(),
        }
      },
    }
  },
}))

// Spend is not the subject here: pass the callback through so the physical
// request is reached, and keep the resolver honest.
vi.mock('@/lib/cost/governed-spend', () => ({
  withGovernedSpend: (_i: unknown, run: () => Promise<unknown>) => run(),
  resolveGovernedProjectId: async () => ({ ok: true, projectId: PROJ }),
  SpendRefusedError: class extends Error {},
  ProviderNotDispatchedError: class extends Error {},
}))
vi.mock('@/lib/cost/track', () => ({ logLlmCost: () => {}, logImageCost: () => {} }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10 }) }))
vi.mock('@/lib/cost/budget-gate', () => ({ estimateImageSek: async () => 1 }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.run, error: null }) }) }) }),
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
  state.started = null
  vi.resetModules()
})
afterEach(() => { vi.useRealTimers() })

/** Starts a governed call, flips authority once it is genuinely in flight. */
async function raceAgainst(
  call: () => Promise<unknown>,
  flip: () => void,
): Promise<{ error: unknown; signal?: AbortSignal }> {
  vi.useFakeTimers()
  const inFlight = new Promise<void>(res => { state.started = res })
  const p = call().then(() => ({ ok: true }), e => ({ error: e }))
  await inFlight
  flip()
  await vi.advanceTimersByTimeAsync(2_500)
  const r = await p as { error?: unknown }
  return { error: r.error, signal: seen[seen.length - 1]?.signal }
}

// ═══════════════════════════════════════════════════════════════════════════
describe('B1–B5 · RUN_BOUND: the SDK receives a signal that governance can abort', () => {
  it('B1 — Anthropic create: cancellation aborts the real SDK request', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const { error, signal } = await raceAgainst(
      () => getAnthropic({ project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND } as never)
        .messages.create({ model: 'claude', max_tokens: 10, messages: [] } as never),
      () => { state.run.cancel_requested = true },
    )
    expect(signal, 'the SDK was handed a signal at all').toBeDefined()
    expect(signal!.aborted, 'and governance aborted it').toBe(true)
    expect(String((error as Error)?.message)).toContain('RUN_CANCELLED')
  })

  it('B2 — Anthropic stream: cancellation after handle creation aborts it', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    vi.useFakeTimers()
    let settled: Promise<unknown> | undefined
    const stream = await getAnthropic({
      project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND,
      onStreamSettled: (s: Promise<unknown>) => { settled = s },
    } as never).messages.stream({ model: 'claude', max_tokens: 10, messages: [] } as never)

    const signal = seen[0]?.signal
    expect(signal, 'the stream call received a signal').toBeDefined()
    expect(signal!.aborted, 'not aborted merely by returning the handle').toBe(false)

    state.run.cancel_requested = true
    await vi.advanceTimersByTimeAsync(2_500)
    expect(signal!.aborted, 'the watcher outlived the handle and aborted the stream').toBe(true)
    expect(stream).toBeDefined()
    expect(settled).toBeDefined()
  })

  it('B3 — OpenAI chat: a global stop aborts with GLOBAL_STOPPED', async () => {
    const { openAIChatCompletion } = await import('@/lib/ai/openai-client')
    const { error, signal } = await raceAgainst(
      () => openAIChatCompletion(
        { project: { projectId: PROJ }, execution: EXEC_PROJECT, operation: 'chat', authority: RUN_BOUND } as never,
        { model: 'gpt-4', messages: [] } as never),
      () => { state.globalPaused = true },
    )
    expect(signal!.aborted).toBe(true)
    expect(String((error as Error)?.message), 'the GLOBAL switch, named correctly')
      .toContain('GLOBAL_STOPPED')
  })

  it('B4 — OpenAI image generate observes the abort', async () => {
    const { openAIImageGenerate } = await import('@/lib/ai/openai-client')
    const { signal } = await raceAgainst(
      () => openAIImageGenerate(
        { project: { projectId: PROJ }, execution: EXEC_PROJECT, operation: 'img', authority: RUN_BOUND } as never,
        { model: 'gpt-image-1', prompt: 'x', n: 1 } as never),
      () => { state.run.cancel_requested = true },
    )
    expect(signal).toBeDefined()
    expect(signal!.aborted).toBe(true)
  })

  it('B5 — OpenAI image EDIT observes the abort', async () => {
    const { openAIImageEdit } = await import('@/lib/ai/openai-client')
    const { signal } = await raceAgainst(
      () => openAIImageEdit(
        { project: { projectId: PROJ }, execution: EXEC_PROJECT, operation: 'edit', authority: RUN_BOUND } as never,
        { model: 'gpt-image-1', image: {}, prompt: 'x', n: 1 } as never),
      () => { state.run.cancel_requested = true },
    )
    expect(signal).toBeDefined()
    expect(signal!.aborted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('B6–B8 · CONTRACT_ONLY is watched too', () => {
  it('B6 — a call with NO claim still aborts on a global stop', async () => {
    // The Phase 1 gap: absence of RUN_BOUND left these entirely unwatched.
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const { error, signal } = await raceAgainst(
      () => getAnthropic({ project: { projectId: PROJ }, execution: EXEC_GLOBAL } as never)
        .messages.create({ model: 'claude', max_tokens: 10, messages: [] } as never),
      () => { state.globalPaused = true },
    )
    expect(signal!.aborted, 'contract-only work is stop-observable').toBe(true)
    expect(String((error as Error)?.message)).toContain('GLOBAL_STOPPED')
  })

  it('B7 — PROJECT scope aborts on a project stop, named PROJECT_STOPPED', async () => {
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const { error, signal } = await raceAgainst(
      () => getAnthropic({ project: { projectId: PROJ }, execution: EXEC_PROJECT } as never)
        .messages.create({ model: 'claude', max_tokens: 10, messages: [] } as never),
      () => { state.projectPaused = true },
    )
    expect(signal!.aborted).toBe(true)
    expect(String((error as Error)?.message)).toContain('PROJECT_STOPPED')
  })

  it('B8 — a cancelled/fenced RUN cannot abort a CONTRACT_ONLY call', async () => {
    // It owns no run, so run-level facts are not its to observe. Only a stop is.
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = getAnthropic({ project: { projectId: PROJ }, execution: EXEC_PROJECT } as never)
      .messages.create({ model: 'claude', max_tokens: 10, messages: [] } as never)
      .then(() => 'ok', e => e)
    await inFlight
    state.run.cancel_requested = true
    state.run.claim_id = 'someone-else'
    state.run.status = 'cancelled'
    await vi.advanceTimersByTimeAsync(3_000)
    expect(seen[0].signal!.aborted, 'no run authority, no run-level abort').toBe(false)
    void p
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('B9–B11 · stop-state truth', () => {
  it('B9 — a stop_state read failure does NOT abort the in-flight request', async () => {
    // It means authority could not be READ. Tearing down a socket a successful
    // boundary already permitted would manufacture remote ambiguity.
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    vi.useFakeTimers()
    const inFlight = new Promise<void>(res => { state.started = res })
    const p = getAnthropic({
      project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND,
    } as never).messages.create({ model: 'claude', max_tokens: 10, messages: [] } as never)
      .then(() => 'ok', e => e)
    await inFlight
    state.stopReadFails = true
    await vi.advanceTimersByTimeAsync(6_000)
    expect(seen[0].signal!.aborted, 'the socket stays alive').toBe(false)
    void p
  })

  it('B10 — RUN_BOUND under a GLOBAL pause reports GLOBAL_STOPPED', async () => {
    const { evaluateAuthority } = await import('@/lib/governance/execution-signal')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    state.globalPaused = true
    const r = await evaluateAuthority(createAdminClient() as never, RUN_BOUND as never)
    expect(r.tick).toBe('STOPPED')
    expect(r.abortReason, 'the decision names the switch, not the authority shape')
      .toBe('GLOBAL_STOPPED')
  })

  it('B11 — RUN_BOUND under a PROJECT pause reports PROJECT_STOPPED', async () => {
    const { evaluateAuthority } = await import('@/lib/governance/execution-signal')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    state.projectPaused = true
    const r = await evaluateAuthority(createAdminClient() as never, RUN_BOUND as never)
    expect(r.tick).toBe('STOPPED')
    expect(r.abortReason).toBe('PROJECT_STOPPED')
  })

  it('B9b — an unreadable stop_state is AUTHORITY_UNAVAILABLE, never STOPPED', async () => {
    const { evaluateAuthority } = await import('@/lib/governance/execution-signal')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    state.stopReadFails = true
    const r = await evaluateAuthority(createAdminClient() as never, RUN_BOUND as never)
    expect(r.tick).toBe('AUTHORITY_UNAVAILABLE')
    expect(r.abortReason, 'and it carries no abort reason at all').toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('B13 · the latch survives a stream', () => {
  it('authority lost AFTER handle return is still visible once the stream settles', async () => {
    // A boolean snapshotted at handle return would answer for a flight that had
    // barely begun. `onFlight` exposes LIVE state.
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    vi.useFakeTimers()
    let flight: { authorityUnavailable: boolean } | undefined
    await getAnthropic({
      project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND,
      onFlight: (f: unknown) => { flight = f as never },
    } as never).messages.stream({ model: 'claude', max_tokens: 10, messages: [] } as never)

    expect(flight, 'live flight state handed to the owner').toBeDefined()
    expect(flight!.authorityUnavailable, 'clean at handle return').toBe(false)

    state.stopReadFails = true
    await vi.advanceTimersByTimeAsync(6_000)
    expect(flight!.authorityUnavailable, 'and it becomes visible mid-stream').toBe(true)
    expect(seen[0].signal!.aborted, 'without aborting the stream').toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('B14/B16 · retries each get their own physical scope', () => {
  it('B14 — the unified validation retry preserves RUN_BOUND authority', async () => {
    const src = (await import('node:fs')).readFileSync(
      (await import('node:path')).join(process.cwd(), 'lib/ai/workflow-executor.ts'), 'utf8')
    const retry = src.slice(src.indexOf('userMessage: correctedMessage'))
    expect(retry, 'the retry carries the same run and claim')
      .toMatch(/RUN_BOUND' as const, runId, claimId/)
    expect(src, 'and it re-establishes authority before firing')
      .toMatch(/validation-retry/)
  })

  it('B16 — each governed call opens its OWN watch, never one around a batch', async () => {
    // Two sequential physical requests must produce two distinct signals. One
    // watcher spanning both would hand the same signal to each.
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    const client = getAnthropic({
      project: { projectId: PROJ }, execution: EXEC_PROJECT, authority: RUN_BOUND,
    } as never)
    vi.useFakeTimers()
    // Wait for BOTH physical requests to actually reach the fake SDK — a single
    // microtask tick is not enough, the adapter awaits several things first.
    let startedCount = 0
    const bothStarted = new Promise<void>(res => {
      state.started = () => { if (++startedCount === 2) res() }
    })
    const a = client.messages.create({ model: 'c', max_tokens: 1, messages: [] } as never).catch(() => {})
    const b = client.messages.create({ model: 'c', max_tokens: 1, messages: [] } as never).catch(() => {})
    await bothStarted
    expect(seen.length).toBe(2)
    expect(seen[0].signal, 'distinct physical scopes').not.toBe(seen[1].signal)
    state.run.cancel_requested = true
    await vi.advanceTimersByTimeAsync(2_500)
    await Promise.all([a, b])
  })
})
