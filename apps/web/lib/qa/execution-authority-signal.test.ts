/**
 * G3C-3C-A — hidden retry elimination and in-flight abort authority.
 *
 * Two things had no observer before this slice:
 *
 *   1. The SDKs retried INTERNALLY (`maxRetries = 2`, implemented as recursion),
 *      so a fresh governance check protected attempt 1 and nothing else.
 *   2. Nothing watched authority while a request was in flight — an OpenAI or
 *      Anthropic call can hold a socket for ten minutes, and for that entire
 *      window a cancel, a stop and a rotated claim were invisible.
 *
 * Everything here drives real production code against provider fakes. No live
 * provider, no credits, no mail.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

type Row = Record<string, unknown>

const RUN = 'run-sig-1'
const CLAIM = 'claim-sig-1'
const PROJ = '11111111-1111-1111-1111-111111111111'

const state = {
  run: {} as Row | null,
  readFails: false,
  globalPaused: false,
  projectPaused: false,
  stopReadFails: false,
  reads: 0,
}

function db() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.reads += 1
            if (state.readFails) return { data: null, error: { message: 'connection lost' } }
            return { data: state.run, error: null }
          },
        }),
      }),
    }),
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
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const anyDb = () => db() as any

beforeEach(() => {
  state.run = { id: RUN, status: 'running', claim_id: CLAIM, cancel_requested: false, project_id: PROJ }
  state.readFails = false
  state.globalPaused = false
  state.projectPaused = false
  state.stopReadFails = false
  state.reads = 0
  vi.resetModules()
})
afterEach(() => { vi.useRealTimers() })

const runBound = () => ({ kind: 'RUN_BOUND' as const, runId: RUN, claimId: CLAIM })
const contractOnly = (scope: 'GLOBAL_ONLY' | 'PROJECT' = 'PROJECT') => ({
  kind: 'CONTRACT_ONLY' as const,
  contract: {
    context: 'AUTONOMOUS' as const,
    scope: scope === 'GLOBAL_ONLY'
      ? { kind: 'GLOBAL_ONLY' as const }
      : { kind: 'PROJECT' as const, project: { projectId: PROJ } },
  },
  resolveProjectId: async () => PROJ,
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A1/A2 · hidden SDK retries are disabled', () => {
  it('A1 — the OpenAI client is constructed with maxRetries: 0', () => {
    // Source pin AND the reason: the SDK default is 2 and its retry is internal
    // recursion, so those attempts are unreachable by any governance boundary.
    const src = code('lib/ai/openai-client.ts')
    expect(src).toMatch(/new OpenAI\(\{[\s\S]*?maxRetries:\s*0/)
    expect(src, 'no default-retry construction may return').not.toMatch(/new OpenAI\(\{\s*apiKey:[^,}]*\}\)/)
  })

  it('A2 — the Anthropic client is constructed with maxRetries: 0', () => {
    const src = code('lib/ai/anthropic.ts')
    expect(src).toMatch(/new Anthropic\(\{[\s\S]*?maxRetries:\s*0/)
    expect(src).not.toMatch(/new Anthropic\(\{\s*apiKey:[^,}]*\}\)/)
  })

  // A1b's behavioural half moved to `provider-signal-delivery.test.ts`, where the
  // full adapter stack is faked. After the Phase-1B restructure the watcher lives
  // INSIDE the adapter, so counting physical attempts requires that stack —
  // proving it here would have meant re-mocking it a second time.
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A3–A8 · RUN_BOUND authority', () => {
  const evaluate = async (auth: unknown) => {
    const { evaluateAuthority } = await import('@/lib/governance/execution-signal')
    return (await evaluateAuthority(anyDb(), auth as never)).tick
  }

  it('A3 — same claim, running, uncancelled, clear stop → ALLOWED', async () => {
    expect(await evaluate(runBound())).toBe('ALLOWED')
  })

  it('A4 — same claim but status is not running → FENCED', async () => {
    // The run left the state this worker owns. Continuing would act on a
    // lifecycle someone else already concluded — claim equality is not enough.
    state.run = { ...state.run, status: 'cancelled' }
    expect(await evaluate(runBound())).toBe('FENCED')
  })

  it('A5 — rotated claim → FENCED', async () => {
    state.run = { ...state.run, claim_id: 'someone-else' }
    expect(await evaluate(runBound())).toBe('FENCED')
  })

  it('A6 — cancel_requested → CANCELLED', async () => {
    state.run = { ...state.run, cancel_requested: true }
    expect(await evaluate(runBound())).toBe('CANCELLED')
  })

  it('A7 — global stop → STOPPED', async () => {
    state.globalPaused = true
    expect(await evaluate(runBound())).toBe('STOPPED')
  })

  it('A8 — project stop → STOPPED', async () => {
    state.projectPaused = true
    expect(await evaluate(runBound())).toBe('STOPPED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A9/A10 · CONTRACT_ONLY authority', () => {
  const evaluate = async (auth: unknown) => {
    const { evaluateAuthority } = await import('@/lib/governance/execution-signal')
    return (await evaluateAuthority(anyDb(), auth as never)).tick
  }

  it('A9 — CONTRACT_ONLY observes a global stop', async () => {
    state.globalPaused = true
    expect(await evaluate(contractOnly('GLOBAL_ONLY'))).toBe('STOPPED')
  })

  it('A9b — CONTRACT_ONLY observes a project stop when the scope is PROJECT', async () => {
    state.projectPaused = true
    expect(await evaluate(contractOnly('PROJECT'))).toBe('STOPPED')
  })

  it('A10 — CONTRACT_ONLY can NEVER produce CANCELLED or FENCED', async () => {
    // It owns no run, so it has nothing to be cancelled or fenced from.
    // Inventing either would be a fabricated lifecycle claim. Even with a run
    // row that IS cancelled and fenced, a contract-only authority sees a clear
    // stop and says ALLOWED — it never reads the run at all.
    state.run = { id: RUN, status: 'cancelled', claim_id: 'other', cancel_requested: true, project_id: PROJ }
    const tick = await evaluate(contractOnly('PROJECT'))
    expect(tick).toBe('ALLOWED')
    expect(tick).not.toBe('CANCELLED')
    expect(tick).not.toBe('FENCED')
    expect(state.reads, 'and it performed no ownership read whatsoever').toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A11/A12 · authority read failure is not a durable fact', () => {
  const classify = async (read: unknown, claim: string | null) => {
    const { classifyRunAuthority } = await import('@/lib/governance/run-authority')
    return classifyRunAuthority(read as never, claim).klass
  }

  it('A11 — a failed read is AUTHORITY_UNAVAILABLE, and the watcher LATCHES it', async () => {
    vi.useFakeTimers()
    const { watchExecutionAuthority } = await import('@/lib/governance/execution-signal')
    state.readFails = true
    const w = watchExecutionAuthority(anyDb(), runBound() as never, { pollMs: 10 })
    await vi.advanceTimersByTimeAsync(35)
    expect(w.authorityUnavailable, 'latched').toBe(true)
    expect(w.signal.aborted, 'but the in-flight request is NOT torn down').toBe(false)
    expect(w.abortReason).toBeNull()
    w.dispose()
  })

  it('A11b — the latch does NOT clear when a later read succeeds', async () => {
    vi.useFakeTimers()
    const { watchExecutionAuthority } = await import('@/lib/governance/execution-signal')
    state.readFails = true
    const w = watchExecutionAuthority(anyDb(), runBound() as never, { pollMs: 10 })
    await vi.advanceTimersByTimeAsync(15)
    expect(w.authorityUnavailable).toBe(true)
    state.readFails = false
    await vi.advanceTimersByTimeAsync(40)
    expect(w.authorityUnavailable, 'a latch that clears is not a latch').toBe(true)
    w.dispose()
  })

  it('A12 — a read failure is neither CANCELLED nor FENCED', async () => {
    expect(await classify({ kind: 'READ_ERROR' }, CLAIM)).toBe('AUTHORITY_UNAVAILABLE')
  })

  it('A12b — a SUCCESSFUL read returning NO ROW is FENCED, not unavailable', async () => {
    // The load-bearing distinction. "I could not read" and "I read, and the run
    // is gone" are different facts; only the second proves ownership loss.
    expect(await classify({ kind: 'MISSING_ROW' }, CLAIM)).toBe('FENCED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A17/A18/A20 · signal composition', () => {
  it('A17 — caller abort and governance signal compose; first wins', async () => {
    const { composeAbortSignals } = await import('@/lib/governance/execution-signal')
    const caller = new AbortController()
    const gov = new AbortController()
    const c = composeAbortSignals([gov.signal, caller.signal])
    expect(c.signal.aborted).toBe(false)
    caller.abort(new Error('caller went away'))
    expect(c.signal.aborted).toBe(true)
    gov.abort(new Error('too late'))
    expect(String((c.signal.reason as Error).message), 'first abort wins').toContain('caller went away')
    c.dispose()
  })

  it('A18 — a timeout signal composes without replacing governance', async () => {
    const { composeAbortSignals } = await import('@/lib/governance/execution-signal')
    const gov = new AbortController()
    const timeout = AbortSignal.timeout(5)
    const c = composeAbortSignals([gov.signal, timeout])
    gov.abort(new Error('GLOBAL_STOPPED'))
    expect(c.signal.aborted).toBe(true)
    expect(String((c.signal.reason as Error).message)).toContain('GLOBAL_STOPPED')
    c.dispose()
  })

  it('A17b — withExecutionAuthority COMPOSES the caller signal, never replaces it', async () => {
    // The unit test above proves the primitive composes. This proves the helper
    // actually passes the caller's signal INTO it — dropping `extraSignals`
    // would leave the primitive perfect and the request unstoppable.
    vi.useFakeTimers()
    const { withExecutionAuthority } = await import('@/lib/governance/execution-signal')
    const caller = new AbortController()
    let seen: AbortSignal | null = null
    let settle: () => void = () => {}
    const settled = new Promise<void>(r => { settle = r })

    await withExecutionAuthority({
      db: anyDb(), authority: runBound() as never, pollMs: 10,
      extraSignals: [caller.signal],
      run: async (signal) => { seen = signal; return { value: 'h', settled } },
    })
    expect(seen).not.toBeNull()
    expect(seen!.aborted).toBe(false)
    caller.abort(new Error('caller disconnected'))
    expect(seen!.aborted, 'the caller signal must reach the physical request').toBe(true)
    settle()
  })

  it('an already-aborted input aborts the composed signal immediately', async () => {
    const { composeAbortSignals } = await import('@/lib/governance/execution-signal')
    const dead = new AbortController()
    dead.abort(new Error('already gone'))
    const c = composeAbortSignals([dead.signal])
    expect(c.signal.aborted, 'a request that should never be made must not look permitted').toBe(true)
    c.dispose()
  })

  it('A20 — dispose really DETACHES, proven by effect not by a counter', async () => {
    // A `listenerCount` derived from a flag would read 0 while the listener was
    // still attached. The observable fact is what matters: after dispose, a
    // source abort must no longer reach the composed signal.
    const { composeAbortSignals } = await import('@/lib/governance/execution-signal')
    const a = new AbortController(); const b = new AbortController()
    const c = composeAbortSignals([a.signal, b.signal])
    expect(c.listenerCount).toBe(2)

    c.dispose()
    a.abort(new Error('after dispose'))
    b.abort(new Error('after dispose'))
    expect(c.signal.aborted, 'a detached source cannot abort the composed signal').toBe(false)
    expect(c.listenerCount).toBe(0)
    c.dispose()   // idempotent
    expect(c.signal.aborted).toBe(false)
  })

  it('A20b — dispose CLEARS the interval, not merely the tick body', async () => {
    // Guarding the tick with a flag makes reads stop while the timer keeps
    // firing forever. Count the timers themselves.
    vi.useFakeTimers()
    const { watchExecutionAuthority } = await import('@/lib/governance/execution-signal')
    const before = vi.getTimerCount()
    const w = watchExecutionAuthority(anyDb(), runBound() as never, { pollMs: 10 })
    expect(vi.getTimerCount(), 'the watcher registered a timer').toBe(before + 1)
    await vi.advanceTimersByTimeAsync(25)
    const during = state.reads
    expect(during).toBeGreaterThan(0)

    w.dispose()
    expect(vi.getTimerCount(), 'no interval survives disposal').toBe(before)
    await vi.advanceTimersByTimeAsync(100)
    expect(state.reads).toBe(during)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A6–A8 · the watcher actually aborts on lost authority', () => {
  const abortReasonAfter = async (mutate: () => void) => {
    vi.useFakeTimers()
    const { watchExecutionAuthority } = await import('@/lib/governance/execution-signal')
    const w = watchExecutionAuthority(anyDb(), runBound() as never, { pollMs: 10 })
    mutate()
    await vi.advanceTimersByTimeAsync(25)
    const r = { aborted: w.signal.aborted, reason: w.abortReason }
    w.dispose()
    return r
  }

  it('cancellation aborts the in-flight request as RUN_CANCELLED', async () => {
    expect(await abortReasonAfter(() => { state.run = { ...state.run, cancel_requested: true } }))
      .toEqual({ aborted: true, reason: 'RUN_CANCELLED' })
  })

  it('a rotated claim aborts as RUN_FENCED', async () => {
    expect(await abortReasonAfter(() => { state.run = { ...state.run, claim_id: 'other' } }))
      .toEqual({ aborted: true, reason: 'RUN_FENCED' })
  })

  it('a GLOBAL pause aborts as GLOBAL_STOPPED, even for a project-scoped run', async () => {
    // The reason comes from the DECISION, not the authority's shape. This test
    // previously asserted PROJECT_STOPPED and was wrong: inferring the reason
    // from "this authority has a project" misreports which switch fired.
    expect(await abortReasonAfter(() => { state.globalPaused = true }))
      .toEqual({ aborted: true, reason: 'GLOBAL_STOPPED' })
  })

  it('a PROJECT pause aborts as PROJECT_STOPPED', async () => {
    expect(await abortReasonAfter(() => { state.projectPaused = true }))
      .toEqual({ aborted: true, reason: 'PROJECT_STOPPED' })
  })

  it('nothing aborts while authority stays clear', async () => {
    expect(await abortReasonAfter(() => {})).toEqual({ aborted: false, reason: null })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A13–A16 · stream lifetime', () => {
  it('A13/A15 — the watcher survives handle return and is disposed on completion', async () => {
    vi.useFakeTimers()
    const { withExecutionAuthority } = await import('@/lib/governance/execution-signal')
    let settle: () => void = () => {}
    const settled = new Promise<void>(r => { settle = r })

    const res = await withExecutionAuthority({
      db: anyDb(), authority: runBound() as never, pollMs: 10,
      run: async () => ({ value: 'handle', settled }),
    })
    expect(res.value).toBe('handle')

    // The handle is back — the socket is NOT closed. Polling must continue.
    await vi.advanceTimersByTimeAsync(25)
    const during = state.reads
    expect(during, 'watcher must outlive the handle').toBeGreaterThan(0)

    settle()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(50)
    expect(state.reads, 'and stop exactly when the stream terminates').toBe(during)
  })

  it('A16 — the watcher is disposed when the stream ERRORS, not only on success', async () => {
    // `.then` instead of `.finally` would leak on every failed stream.
    vi.useFakeTimers()
    const { withExecutionAuthority } = await import('@/lib/governance/execution-signal')
    let boom: (e: Error) => void = () => {}
    const settled = new Promise<void>((_, rej) => { boom = rej })

    await withExecutionAuthority({
      db: anyDb(), authority: runBound() as never, pollMs: 10,
      run: async () => ({ value: 'handle', settled }),
    })
    await vi.advanceTimersByTimeAsync(25)
    const during = state.reads

    boom(new Error('stream died'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(50)
    expect(state.reads, 'an errored stream releases the watcher too').toBe(during)
  })

  it('a non-stream request disposes as soon as it resolves', async () => {
    vi.useFakeTimers()
    const { withExecutionAuthority } = await import('@/lib/governance/execution-signal')
    await withExecutionAuthority({
      db: anyDb(), authority: runBound() as never, pollMs: 10,
      run: async () => ({ value: 'done' }),
    })
    const after = state.reads
    await vi.advanceTimersByTimeAsync(100)
    expect(state.reads).toBe(after)
  })

  it('A14 — the Anthropic wrapper anchors to stream termination, preferring done()', () => {
    // The installed SDK's completion primitive is `done()`, and it is tried
    // FIRST; `finalMessage()` covers event-driven consumers and iteration
    // covers the rest. Failure to OBSERVE termination must never become failure
    // to MAKE the request.
    //
    // This asserts the SEAM and the PREFERENCE ORDER only. It used to also pin
    // the exact `.finally(...)` expression, and that pin broke on three
    // successive legitimate changes without once catching a defect — it was
    // proving the shape of a line, not that an errored stream releases its
    // watcher. That behaviour is proven where it can actually fail: C2 and
    // C18b (release at termination, not before or never) and B2/B13 end to end.
    const src = code('lib/ai/anthropic.ts')
    expect(src, 'termination hook present').toMatch(/onStreamSettled\?\.\(/)
    expect(src, 'done() is preferred').toMatch(/done\?: unknown \}\)\.done === 'function'/)
    expect(src, 'and iteration is the fallback, never an immediate resolve')
      .toMatch(/followAsyncIterable\(stream, mapError\)/)
    expect(src, 'and termination is classified BEFORE any hygiene catch')
      .toMatch(/const classified = rawTermination\.catch/)
  })

  it('a throwing request still releases the watcher', async () => {
    vi.useFakeTimers()
    const { withExecutionAuthority } = await import('@/lib/governance/execution-signal')
    await expect(withExecutionAuthority({
      db: anyDb(), authority: runBound() as never, pollMs: 10,
      run: async () => { throw new Error('provider exploded') },
    })).rejects.toThrow('provider exploded')
    const after = state.reads
    await vi.advanceTimersByTimeAsync(100)
    expect(state.reads).toBe(after)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('A19 + continuation · abort is not remote cancellation', () => {
  it('A19 — an AbortError after possible dispatch stays transport-ambiguous', async () => {
    // The canonical classifier must keep answering `sent: 'unknown'`. A local
    // signal firing says nothing about what the provider did with bytes it
    // already received — reporting NOT_DISPATCHED here would be a lie with
    // consequences, since it would license a retry.
    const { classifyTransportFailure } = await import('@/lib/media/job/dispatch')
    const abort = new Error('The operation was aborted'); abort.name = 'AbortError'
    expect(classifyTransportFailure(abort).sent).toBe('unknown')
    const timeout = new Error('timed out'); timeout.name = 'TimeoutError'
    expect(classifyTransportFailure(timeout).sent).toBe('unknown')
  })

  it('CONTINUATION — a latched unavailable survives a successful provider return', async () => {
    // The request was already permitted and it completed. Its evidence is
    // preserved. What must NOT happen is the latch evaporating because the
    // remote answered 200 — the next unit still needs a fresh canonical read.
    vi.useFakeTimers()
    const { withExecutionAuthority } = await import('@/lib/governance/execution-signal')
    let finish: (v: string) => void = () => {}
    const inflight = new Promise<string>(r => { finish = r })

    state.readFails = true
    const p = withExecutionAuthority({
      db: anyDb(), authority: runBound() as never, pollMs: 10,
      run: async () => ({ value: await inflight }),
    })
    await vi.advanceTimersByTimeAsync(25)
    finish('provider result')
    const res = await p

    expect(res.value, 'evidence preserved').toBe('provider result')
    expect(res.authorityUnavailable, 'and the latch reaches the caller').toBe(true)
    expect(res.abortReason, 'a read failure is not an abort').toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('PROPAGATION · a claimed run reaches the provider boundary as RUN_BOUND', () => {
  it('the unified executor hands runStep a RUN_BOUND authority when it holds a claim', () => {
    // Source pin with a reason: this is the ONE place that holds both the run
    // and its claim. The behavioural halves live above (the watcher) and below
    // (runStep's opt-in); this pins that the two are actually connected.
    const src = code('lib/ai/workflow-executor.ts')
    expect(src).toMatch(/authority:\s*\{\s*kind:\s*'RUN_BOUND'\s*as const,\s*runId,\s*claimId\s*\}/)
    expect(src, 'and only when a claim exists — a runId alone is not ownership')
      .toMatch(/claimId\s*\?\s*\{[^}]*RUN_BOUND/)
  })

  it('the legacy runner does the same', () => {
    const src = code('lib/ai/workflow-runner.ts')
    expect(src).toMatch(/claimId\s*\?\s*\{[^}]*RUN_BOUND/)
  })

  it('runStep holds NO watcher — the lifetime belongs to one physical request', async () => {
    // Phase 1 wrapped runStep, which is not one physical request: an image step
    // alone can contain several generations, a retry loop, a reference edit and
    // a Vision QA call. The watcher moved into the adapters; runStep must not
    // grow one back.
    const src = code('lib/ai/runner.ts')
    expect(src, 'no watcher at step scope').not.toMatch(/withExecutionAuthority</)
    expect(src, 'authority is threaded down to the adapters instead')
      .toMatch(/authority: input\.authority/)
  })

  it('the stream path anchors the watcher to termination, not the handle', () => {
    // F2 removed the `StepDispatch.settled` hand-back this used to pin:
    // `runStep` discarded it, so it was authority metadata production threw
    // away. Termination is now observed by the code that actually runs — the
    // adapter classifies inside the stream's own iterator, the runner iterates
    // it to exhaustion and then awaits `finalMessage()`. That is what this
    // asserts; F2.2 and F6 prove the behaviour end to end.
    const src = code('lib/ai/runner.ts')
    expect(src, 'the stream is iterated to exhaustion').toMatch(/for await \(const event of stream\)/)
    expect(src, 'and real termination is awaited before the step completes')
      .toMatch(/await stream\.finalMessage\(\)/)
    expect(src, 'and no discarded settled contract remains').not.toMatch(/streamSettled/)
  })
})
