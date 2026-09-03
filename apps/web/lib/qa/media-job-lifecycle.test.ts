/**
 * lib/qa/media-job-lifecycle.test.ts — Media Runtime Phase 3.
 *
 * Proves the asynchronous provider lifecycle, and above all proves the one
 * property the whole phase exists for: **an ambiguous dispatch never becomes a
 * second paid generation.**
 *
 * NO NETWORK, NO SUPABASE, NO PROVIDER. Dispatch is a counted fake, so "how many
 * times did Omnira try to create something" is a number this file can assert
 * rather than a property it has to trust. A test for a duplicate-spend guard
 * must not be able to spend.
 *
 * Polling uses an injected clock and an injected sleep, so every timing rule —
 * backoff growth, deadline arithmetic, read-failure budget — is asserted in
 * microseconds instead of waited for.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── Capture surfaces ─────────────────────────────────────────────────────────

/** Every attempted CREATION. The number that must never grow unexpectedly. */
let dispatchCalls = 0
/** Every status READ. Free, and expected to be plural. */
let observeCalls = 0
let admitCalls: any[] = []
let admitShouldThrow: Error | null = null

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'
const ADMITTED_ASSET_ID = 'asset-0000-0000-0000-00000000000a'
const REMOTE_ID = 'muapi-req-7f3c9a'

vi.mock('@/lib/media/asset/admission', () => ({
  admitAssetFromUrl: async (input: any) => {
    admitCalls.push(input)
    if (admitShouldThrow) throw admitShouldThrow
    return {
      asset: {
        id: ADMITTED_ASSET_ID,
        projectId: input.projectId,
        kind: input.kind,
        visibility: input.visibility ?? 'internal',
        storage: {
          // Derived from visibility by Phase 1 — never from anything the
          // provider said. Mirrored here so the assertion below is meaningful.
          bucket: input.visibility === 'public' ? 'media-assets' : 'media-assets-private',
          path: `${input.storage.path}.png`,
        },
      },
      provenance: { ...input.provenance, assetId: ADMITTED_ASSET_ID },
    }
  },
}))

// ── Modules under test ───────────────────────────────────────────────────────

const lifecycle = await import('@/lib/media/job/lifecycle')
const identity = await import('@/lib/media/job/identity')
const dispatchMod = await import('@/lib/media/job/dispatch')
const pollMod = await import('@/lib/media/job/poll')
const qc = await import('@/lib/media/job/qc')
const storeMod = await import('@/lib/media/job/store')
const reconcileMod = await import('@/lib/media/job/reconcile')
const { runMediaJob, MediaJobError, MEDIA_JOB_FAILURES } = await import('@/lib/media/job/run')
const { MuapiProvider, MUAPI_LIFECYCLE } = await import('@/lib/media/providers/muapi')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OUTPUT_URL = 'https://cdn.muapi.example/out/abc.png'

function jobResult(over: Partial<any> = {}): any {
  return {
    ref: { provider: 'muapi', requestId: REMOTE_ID, model: 'flux-dev', submittedAt: '2026-09-03T00:00:00.000Z', mode: 'test' },
    status: 'completed',
    assets: [{ kind: 'image', url: OUTPUT_URL, mimeType: 'image/png', width: 1024, height: 1024, durationSeconds: null }],
    simulated: true,
    error: null,
    ...over,
  }
}

const ACCEPTED = (): any => ({
  kind: 'accepted',
  remoteOperationId: REMOTE_ID as any,
  acceptedAt: '2026-09-03T00:00:00.000Z',
})

function baseInput(store: any, over: Partial<any> = {}): any {
  return {
    store,
    projectId: PROJECT_A,
    provider: 'muapi',
    model: 'flux-dev',
    kind: 'image',
    briefHash: 'b'.repeat(64),
    simulated: true,
    dispatch: async () => { dispatchCalls += 1; return ACCEPTED() },
    observe: async () => { observeCalls += 1; return jobResult() },
    storagePath: `projects/${PROJECT_A}/hero/2026-09`,
    provenance: { brief: { instruction: 'a lighthouse' } },
    // Deterministic: no real waiting anywhere in this file.
    now: () => Date.now(),
    schedule: { initialDelayMs: 0, intervalMs: 1, maxIntervalMs: 1, deadlineMs: 10_000 },
    ...over,
  }
}

/** A poll harness with a fake clock — never sleeps, always deterministic. */
function fakeTimers(startMs = 0) {
  let t = startMs
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms },
    advance: (ms: number) => { t += ms },
    get time() { return t },
  }
}

beforeEach(() => {
  dispatchCalls = 0
  observeCalls = 0
  admitCalls = []
  admitShouldThrow = null
})

// ═════════════════════════════════════════════════════════════════════════════
//  1 · IDENTITY
// ═════════════════════════════════════════════════════════════════════════════

describe('operation identity', () => {
  it('a canonical local job identity is minted and stored', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const result = await runMediaJob(baseInput(store))

    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/)
    const persisted = await store.read(result.jobId)
    expect(persisted?.id).toBe(result.jobId)
  })

  it('the local identity exists BEFORE the network is touched', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    let stateAtDispatch: string | null = null

    await runMediaJob(baseInput(store, {
      dispatch: async () => {
        dispatchCalls += 1
        // The row must already exist, and must already say we are dispatching.
        // This is what makes a lost response survivable.
        stateAtDispatch = store.all()[0]?.state ?? null
        return ACCEPTED()
      },
    }))

    expect(stateAtDispatch).toBe('DISPATCHING')
  })

  it('the remote operation id is separate from the asset id', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const result = await runMediaJob(baseInput(store))

    expect(result.remoteOperationId).toBe(REMOTE_ID)
    expect(result.assetId).toBe(ADMITTED_ASSET_ID)
    expect(result.remoteOperationId).not.toBe(result.assetId)
    expect(result.jobId).not.toBe(result.assetId)
    expect(result.jobId).not.toBe(result.remoteOperationId)
  })

  it('a remote id with unsafe characters is refused, not escaped', () => {
    for (const bad of ['../../etc/passwd', 'a/b', 'id\nX', 'id with space', '']) {
      expect(identity.acceptRemoteOperationId(bad).ok).toBe(false)
    }
    expect(identity.acceptRemoteOperationId('req_9f-3.a:1').ok).toBe(true)
  })

  it('an over-long remote id is refused', () => {
    const long = 'a'.repeat(identity.MAX_REMOTE_OPERATION_ID_LENGTH + 1)
    const r = identity.acceptRemoteOperationId(long)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusal).toBe('too_long')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  2 · THE STATE MACHINE
// ═════════════════════════════════════════════════════════════════════════════

describe('state machine', () => {
  it('queued → running → succeeded is observed and persisted in order', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const statuses = ['pending', 'running', 'completed']
    const seen: string[] = []

    const result = await runMediaJob(baseInput(store, {
      observe: async () => {
        const s = statuses[Math.min(observeCalls, statuses.length - 1)]
        observeCalls += 1
        return jobResult({ status: s })
      },
    }))

    const record = await store.read(result.jobId)
    expect(record?.state).toBe('SUCCEEDED')
    expect(observeCalls).toBe(3)
    // The mapping itself, asserted directly rather than inferred.
    for (const s of ['pending', 'running', 'completed', 'failed'] as const) {
      seen.push(lifecycle.mediaStateForRemoteStatus(s))
    }
    expect(seen).toEqual(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'])
  })

  it('a remote failure maps to FAILED and is not an admission', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const err = await runMediaJob(baseInput(store, {
      observe: async () => {
        observeCalls += 1
        return jobResult({ status: 'failed', assets: [], error: { code: 'MEDIA_JOB_FAILED', message: 'nsfw filter', provider: 'muapi', httpStatus: null, retryable: false, dispatchObservation: null } })
      },
    })).catch(e => e)

    expect(err).toBeInstanceOf(MediaJobError)
    expect(err.failure).toBe('remote_failed')
    expect(admitCalls).toHaveLength(0)
    expect(dispatchCalls).toBe(1)
  })

  it('every dispatch observation maps to a state, and only two are FAILED', () => {
    const map = Object.fromEntries((
      ['not_dispatched', 'remote_rejected', 'response_lost', 'remote_confirmed', 'partially_applied', 'confirmed_evidence_failed'] as const
    ).map(o => [o, lifecycle.mediaStateForDispatch(o)]))

    expect(map).toEqual({
      not_dispatched: 'FAILED',
      remote_rejected: 'FAILED',
      response_lost: 'UNKNOWN',
      remote_confirmed: 'QUEUED',
      partially_applied: 'UNKNOWN',
      confirmed_evidence_failed: 'UNKNOWN',
    })
  })

  it('a terminal state is absorbing, and UNKNOWN opens only for a reconciliation', () => {
    expect(lifecycle.isLegalMediaJobTransition('SUCCEEDED', 'FAILED').ok).toBe(false)
    expect(lifecycle.isLegalMediaJobTransition('FAILED', 'SUCCEEDED').ok).toBe(false)

    const withoutEvidence = lifecycle.isLegalMediaJobTransition('UNKNOWN', 'SUCCEEDED')
    expect(withoutEvidence.ok).toBe(false)
    if (!withoutEvidence.ok) expect(withoutEvidence.refusal).toBe('requires_reconciliation')

    expect(lifecycle.isLegalMediaJobTransition('UNKNOWN', 'SUCCEEDED',
      { hasConfirmedReconciliation: true }).ok).toBe(true)
  })

  it('nothing rewinds across the ambiguity boundary', () => {
    const r = lifecycle.isLegalMediaJobTransition('DISPATCHING', 'PENDING_DISPATCH')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusal).toBe('cannot_rewind_before_dispatch')
    expect(lifecycle.hasEnteredAmbiguityWindow('PENDING_DISPATCH')).toBe(false)
    expect(lifecycle.hasEnteredAmbiguityWindow('DISPATCHING')).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  3 · DISPATCH CLASSIFICATION — the money question
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatch classification', () => {
  it('only connect-stage failures prove the request was never sent', () => {
    const proves = ['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'EHOSTUNREACH', 'CERT_HAS_EXPIRED']
    for (const code of proves) {
      const err = Object.assign(new TypeError('fetch failed'), { cause: { code } })
      expect(dispatchMod.classifyTransportFailure(err)).toEqual({ sent: false, code })
    }
  })

  it('a reset or a timeout is AMBIGUOUS, never "not sent"', () => {
    // ECONNRESET can happen during a handshake or after the body was written,
    // and nothing in the error distinguishes them. Guessing safe here is the
    // duplicate charge this whole phase exists to prevent.
    const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
    expect(dispatchMod.classifyTransportFailure(reset).sent).toBe('unknown')

    const timedOut = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } })
    expect(dispatchMod.classifyTransportFailure(timedOut).sent).toBe('unknown')

    const abort = new DOMException('aborted', 'AbortError')
    expect(dispatchMod.classifyTransportFailure(abort).sent).toBe('unknown')
  })

  it('4xx proves nothing was created; 5xx proves nothing at all', () => {
    for (const s of [400, 401, 403, 404, 422, 429, 499]) {
      expect(dispatchMod.statusProvesNotCreated(s)).toBe(true)
    }
    for (const s of [500, 502, 503, 504]) {
      expect(dispatchMod.statusProvesNotCreated(s)).toBe(false)
    }
  })

  it('an unrecognised error defaults to ambiguous', () => {
    expect(dispatchMod.classifyTransportFailure(new Error('something')).sent).toBe('unknown')
    expect(dispatchMod.classifyTransportFailure(null).sent).toBe('unknown')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  4 · UNKNOWN — never a second generation
// ═════════════════════════════════════════════════════════════════════════════

describe('UNKNOWN', () => {
  const unknownDispatch = (): any => ({
    kind: 'unknown',
    observation: 'response_lost',
    error: { code: 'MEDIA_DISPATCH_UNKNOWN', message: 'reset', provider: 'muapi', httpStatus: null, retryable: false, dispatchObservation: 'response_lost' },
    detail: 'socket reset after the request body was written',
  })

  it('an ambiguous dispatch becomes UNKNOWN, durably, and requires a human', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const err = await runMediaJob(baseInput(store, {
      dispatch: async () => { dispatchCalls += 1; return unknownDispatch() },
    })).catch(e => e)

    expect(err).toBeInstanceOf(MediaJobError)
    expect(err.failure).toBe('dispatch_unknown')
    expect(err.reconciliationRequired).toBe(true)
    expect(err.dispatched).toBe(true)

    const record = store.all()[0]
    expect(record.state).toBe('UNKNOWN')
    expect(record.reconciliationRequired).toBe(true)
    // The evidence a human reconciles against, present even though the vendor
    // never named the operation.
    expect(record.remoteOperationId).toBeNull()
    expect(record.projectId).toBe(PROJECT_A)
    expect(record.model).toBe('flux-dev')
    expect(record.briefHash).toBe('b'.repeat(64))
    expect(record.dispatchStartedAt).not.toBeNull()
  })

  it('UNKNOWN does not trigger a second generation — the dispatch count stays 1', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    await runMediaJob(baseInput(store, {
      dispatch: async () => { dispatchCalls += 1; return unknownDispatch() },
    })).catch(() => {})

    expect(dispatchCalls).toBe(1)
    expect(admitCalls).toHaveLength(0)
  })

  it('no automatic actor may dispatch from an ambiguous state', () => {
    expect(lifecycle.mayAutomaticallyDispatch('UNKNOWN')).toBe(false)
    expect(lifecycle.mayAutomaticallyDispatch('DISPATCHING')).toBe(false)
    expect(lifecycle.mayAutomaticallyDispatch('SUCCEEDED')).toBe(false)
    expect(lifecycle.mayAutomaticallyDispatch('QUEUED')).toBe(false)
    expect(lifecycle.mayAutomaticallyDispatch('RUNNING')).toBe(false)
    // Even a definite failure is a DECISION, not an automatic recovery.
    expect(lifecycle.mayAutomaticallyDispatch('FAILED')).toBe(false)
    // The only free state.
    expect(lifecycle.mayAutomaticallyDispatch('PENDING_DISPATCH')).toBe(true)
  })

  it('the retry classes say the right thing about each state', () => {
    expect(lifecycle.classifyMediaRetry('UNKNOWN').retryClass).toBe('RECONCILE')
    expect(lifecycle.classifyMediaRetry('QUEUED').retryClass).toBe('STATUS_RETRY')
    expect(lifecycle.classifyMediaRetry('RUNNING').retryClass).toBe('STATUS_RETRY')
    expect(lifecycle.classifyMediaRetry('SUCCEEDED').retryClass).toBe('UNSAFE_REDISPATCH')
    expect(lifecycle.classifyMediaRetry('DISPATCHING').retryClass).toBe('UNSAFE_REDISPATCH')
    expect(lifecycle.classifyMediaRetry('PENDING_DISPATCH').retryClass).toBe('SAFE_REDISPATCH')
  })

  it('a definite pre-send failure is the only FAILED that was never billed', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const err = await runMediaJob(baseInput(store, {
      dispatch: async () => {
        dispatchCalls += 1
        return {
          kind: 'definitely_failed', observation: 'not_dispatched',
          error: { code: 'MEDIA_PROVIDER_REQUEST_FAILED', message: 'ENOTFOUND', provider: 'muapi', httpStatus: null, retryable: true, dispatchObservation: 'not_dispatched' },
        }
      },
    })).catch(e => e)

    expect(err.failure).toBe('dispatch_definite_failure')
    expect(err.dispatched).toBe(false)
    expect(err.reconciliationRequired).toBe(false)
    expect(store.all()[0].state).toBe('FAILED')
  })

  it('a vendor rejection is FAILED and dispatched — it answered, it did no work', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const err = await runMediaJob(baseInput(store, {
      dispatch: async () => {
        dispatchCalls += 1
        return {
          kind: 'definitely_failed', observation: 'remote_rejected',
          error: { code: 'MEDIA_PROVIDER_REQUEST_FAILED', message: '400 bad prompt', provider: 'muapi', httpStatus: 400, retryable: false, dispatchObservation: 'remote_rejected' },
        }
      },
    })).catch(e => e)

    expect(err.failure).toBe('dispatch_definite_failure')
    expect(err.dispatched).toBe(true)
    expect(err.reconciliationRequired).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  5 · RECONCILIATION
// ═════════════════════════════════════════════════════════════════════════════

describe('reconciliation', () => {
  async function unknownJobWith(remoteId: string | null) {
    const store = storeMod.createInMemoryMediaJobStore()
    const id = identity.newMediaJobId()
    await store.create({ id, projectId: PROJECT_A, provider: 'muapi', model: 'flux-dev', briefHash: 'c'.repeat(64), simulated: true })
    let rec = (await store.transition({ id, expectedVersion: 1, to: 'DISPATCHING', at: 'T0' }) as any).record
    rec = (await store.transition({
      id, expectedVersion: rec.version, to: 'UNKNOWN',
      remoteOperationId: remoteId as any, at: 'T1',
    }) as any).record
    return { store, job: rec }
  }

  it('recovers UNKNOWN to SUCCEEDED when the vendor answers', async () => {
    const { store, job } = await unknownJobWith(REMOTE_ID)
    const provider: any = { getStatus: async () => jobResult({ status: 'completed' }) }

    const out = await reconcileMod.reconcileMediaJob({
      store, provider, capability: reconcileMod.MUAPI_RECONCILIATION, job, now: () => 'T2',
    })

    expect(out.record.result).toBe('CONFIRMED_SUCCEEDED')
    expect(out.applied?.ok).toBe(true)
    expect((await store.read(job.id))?.state).toBe('SUCCEEDED')
  })

  it('recovers UNKNOWN to FAILED, and to RUNNING for a job still in flight', async () => {
    for (const [status, expected] of [['failed', 'FAILED'], ['running', 'RUNNING']] as const) {
      const { store, job } = await unknownJobWith(REMOTE_ID)
      const provider: any = { getStatus: async () => jobResult({ status, assets: [] }) }
      await reconcileMod.reconcileMediaJob({ store, provider, capability: reconcileMod.MUAPI_RECONCILIATION, job, now: () => 'T2' })
      expect((await store.read(job.id))?.state).toBe(expected)
    }
  })

  it('THE UNRECOVERABLE CASE — no remote id, and MuAPI offers no other lookup', async () => {
    const { store, job } = await unknownJobWith(null)
    let getStatusCalls = 0
    const provider: any = { getStatus: async () => { getStatusCalls += 1; return jobResult() } }

    const out = await reconcileMod.reconcileMediaJob({
      store, provider, capability: reconcileMod.MUAPI_RECONCILIATION, job, now: () => 'T2',
    })

    expect(out.record.result).toBe('STILL_UNKNOWN')
    expect(out.record.blocker).toBe('no_remote_identity')
    // It does not even ASK — there is no question that could be asked.
    expect(getStatusCalls).toBe(0)
    // And the job does not move. Not knowing leaves it exactly where it was.
    expect((await store.read(job.id))?.state).toBe('UNKNOWN')
    expect(dispatchCalls).toBe(0)
    // But the unanswerable attempt IS durable evidence, with its blocker.
    expect(store.ledgerRows()).toEqual([expect.objectContaining({
      result: 'STILL_UNKNOWN', blocker: 'no_remote_identity',
    })])
  })

  it('a failed lookup is not an answer — the job stays UNKNOWN', async () => {
    const { store, job } = await unknownJobWith(REMOTE_ID)
    const provider: any = { getStatus: async () => { throw new Error('503') } }

    const out = await reconcileMod.reconcileMediaJob({
      store, provider, capability: reconcileMod.MUAPI_RECONCILIATION, job, now: () => 'T2',
    })

    expect(out.record.result).toBe('STILL_UNKNOWN')
    expect(out.record.blocker).toBe('lookup_failed')
    // The ATTEMPT is recorded — "we asked and could not tell" is a fact — but
    // the job does not move. Not knowing must leave it exactly where it was.
    expect(out.applied?.ok).toBe(true)
    expect(store.ledgerRows().map(r => r.result)).toEqual(['STILL_UNKNOWN'])
    expect((await store.read(job.id))?.state).toBe('UNKNOWN')
    expect((await store.read(job.id))?.reconciliationRequired).toBe(true)
  })

  it('only a confirmed non-creation permits a fresh dispatch', () => {
    expect(reconcileMod.permitsFreshDispatch('CONFIRMED_NOT_CREATED')).toBe(true)
    for (const r of ['CONFIRMED_SUCCEEDED', 'CONFIRMED_FAILED', 'CONFIRMED_RUNNING', 'STILL_UNKNOWN'] as const) {
      expect(reconcileMod.permitsFreshDispatch(r)).toBe(false)
    }
  })

  it('unresolved jobs are listable, project-scoped, oldest first', async () => {
    const { store, job } = await unknownJobWith(null)
    expect((await store.listUnresolved([PROJECT_A])).map((r: any) => r.id)).toEqual([job.id])
    // Cross-project read returns nothing. Project Isolation applies to jobs.
    expect(await store.listUnresolved([PROJECT_B])).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  6 · POLLING
// ═════════════════════════════════════════════════════════════════════════════

describe('polling', () => {
  it('a transient read failure does not fail the job and does not redispatch', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    let reads = 0
    const result = await runMediaJob(baseInput(store, {
      observe: async () => {
        reads += 1
        observeCalls += 1
        if (reads <= 2) throw new Error('503 from the status endpoint')
        return jobResult()
      },
    }))

    expect(result.assetId).toBe(ADMITTED_ASSET_ID)
    expect(dispatchCalls).toBe(1)          // ← the number that matters
    expect(reads).toBe(3)
  })

  it('exhausted read failures are "unobservable", not "failed", and are resumable', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const err = await runMediaJob(baseInput(store, {
      schedule: { initialDelayMs: 0, intervalMs: 1, maxIntervalMs: 1, deadlineMs: 10_000, maxConsecutiveReadFailures: 3 },
      observe: async () => { observeCalls += 1; throw new Error('gateway down') },
    })).catch(e => e)

    expect(err.failure).toBe('status_temporarily_unavailable')
    expect(err.resumable).toBe(true)
    expect(dispatchCalls).toBe(1)
    // The job is still QUEUED at the provider — not FAILED.
    expect(store.all()[0].state).toBe('QUEUED')
  })

  it('a deadline is Omnira giving up waiting, not the job failing', async () => {
    const clock = fakeTimers()
    const out = await pollMod.pollMediaJob({
      observe: async () => jobResult({ status: 'running' }),
      initialState: 'QUEUED',
      schedule: { deadlineMs: 100, initialDelayMs: 0, intervalMs: 40, maxIntervalMs: 40, backoffFactor: 1 },
      now: clock.now, sleep: clock.sleep,
    })

    expect(out.outcome).toBe('deadline_exceeded')
    if (out.outcome === 'deadline_exceeded') expect(out.lastState).toBe('RUNNING')
  })

  it('backoff grows and is capped', async () => {
    const clock = fakeTimers()
    const slept: number[] = []
    await pollMod.pollMediaJob({
      observe: async () => jobResult({ status: 'running' }),
      initialState: 'QUEUED',
      schedule: { deadlineMs: 10_000, initialDelayMs: 0, intervalMs: 100, maxIntervalMs: 400, backoffFactor: 2 },
      now: clock.now,
      sleep: async (ms) => { slept.push(ms); await clock.sleep(ms) },
    })

    // 100, 200, 400, then capped at 400 forever. No busy loop, no unbounded growth.
    expect(slept.slice(0, 5)).toEqual([0, 100, 200, 400, 400])
    expect(Math.max(...slept)).toBe(400)
  })

  it('an abort ends the WAIT and never touches the remote operation', async () => {
    const controller = new AbortController()
    controller.abort()
    const out = await pollMod.pollMediaJob({
      observe: async () => { throw new Error('must not be called') },
      initialState: 'RUNNING',
      signal: controller.signal,
      now: () => 0, sleep: async () => {},
    })
    expect(out.outcome).toBe('aborted')
    if (out.outcome === 'aborted') expect(out.lastState).toBe('RUNNING')
  })

  it('polling reaches a terminal answer and stops', async () => {
    const clock = fakeTimers()
    let n = 0
    const out = await pollMod.pollMediaJob({
      observe: async () => { n += 1; return jobResult({ status: n < 3 ? 'running' : 'completed' }) },
      initialState: 'QUEUED',
      schedule: { deadlineMs: 10_000, initialDelayMs: 0, intervalMs: 1, maxIntervalMs: 1, backoffFactor: 1 },
      now: clock.now, sleep: clock.sleep,
    })
    expect(out.outcome).toBe('terminal')
    if (out.outcome === 'terminal') expect(out.state).toBe('SUCCEEDED')
    expect(n).toBe(3)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  7 · QC BOUNDARY AND ADMISSION
// ═════════════════════════════════════════════════════════════════════════════

describe('QC boundary', () => {
  it('"completed" with no output is not a success', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const err = await runMediaJob(baseInput(store, {
      observe: async () => { observeCalls += 1; return jobResult({ assets: [] }) },
    })).catch(e => e)

    expect(err.failure).toBe('invalid_remote_result')
    expect(admitCalls).toHaveLength(0)
    expect(dispatchCalls).toBe(1)
  })

  it('the wrong media kind is refused', () => {
    const r = qc.checkTerminalResult(jobResult({ assets: [{ kind: 'video', url: OUTPUT_URL }] }), { kind: 'image' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rejection).toBe('wrong_kind')
  })

  it('a non-https output URL is refused before admission is asked', () => {
    for (const url of ['data:image/png;base64,AAAA', 'http://cdn.example/x.png', '/relative.png', 'file:///etc/passwd']) {
      const r = qc.checkTerminalResult(jobResult({ assets: [{ kind: 'image', url }] }), { kind: 'image' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.rejection).toBe('unretrievable_url')
    }
  })

  it('more outputs than requested is refused, never trimmed', () => {
    const r = qc.checkTerminalResult(
      jobResult({ assets: [{ kind: 'image', url: OUTPUT_URL }, { kind: 'image', url: `${OUTPUT_URL}2` }] }),
      { kind: 'image' },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rejection).toBe('unexpected_output_count')
  })

  it('semantic QC is declared, unimplemented, and cannot fail a job', () => {
    expect(qc.assessSemanticQuality()).toEqual({ assessed: false, reason: 'not_implemented_in_phase_3' })
  })
})

describe('asset admission', () => {
  it('provider success + admission failure is NOT a success, and is not regenerated', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    admitShouldThrow = Object.assign(new Error('checksum mismatch'), { name: 'AssetRejectedError', code: 'ASSET_INTEGRITY_FAILED' })

    const err = await runMediaJob(baseInput(store)).catch(e => e)

    expect(err.failure).toBe('asset_admission_failed')
    expect(err.dispatched).toBe(true)
    expect(dispatchCalls).toBe(1)
    // The vendor's success is a fact and stays recorded. Only Omnira's ownership failed.
    expect(store.all()[0].state).toBe('SUCCEEDED')
    expect(store.all()[0].assetId).toBeNull()
  })

  it('the provider cannot choose the asset id, the bucket, or the path', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    await runMediaJob(baseInput(store, {
      // A hostile provider answering with fields that look authoritative.
      observe: async () => {
        observeCalls += 1
        return jobResult({
          assets: [{
            kind: 'image', url: OUTPUT_URL,
            ...( { id: 'attacker-chosen-asset-id', bucket: 'media-assets', path: '../../public/evil' } as any),
          }],
        })
      },
    }))

    const admitted = admitCalls[0]
    // Admission is handed a URL and Omnira's own decisions. Nothing else.
    expect(Object.keys(admitted)).toEqual(
      expect.arrayContaining(['projectId', 'kind', 'visibility', 'storage', 'sourceUrl', 'provenance']),
    )
    expect(admitted.storage).toEqual({ path: `projects/${PROJECT_A}/hero/2026-09` })
    expect(admitted.storage.bucket).toBeUndefined()
    expect((admitted as any).id).toBeUndefined()
    expect((admitted as any).assetId).toBeUndefined()
    expect(admitted.projectId).toBe(PROJECT_A)
    expect(admitted.sourceUrl).toBe(OUTPUT_URL)
  })

  it('an unpublished asset defaults to internal — visibility is never inferred', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    await runMediaJob(baseInput(store))
    expect(admitCalls[0].visibility).toBe('internal')
  })

  it('the remote operation id is recorded in provenance and routed on nowhere', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const r = await runMediaJob(baseInput(store))
    expect(admitCalls[0].provenance.providerRequestId).toBe(REMOTE_ID)
    expect(admitCalls[0].provenance.mediaJobId).toBeUndefined()
    expect(admitCalls[0].provenance.providerMetadata.mediaJobId).toBe(r.jobId)
    // The storage path was built by the caller and contains no vendor string.
    expect(admitCalls[0].storage.path).not.toContain(REMOTE_ID)
  })

  it('the brief PAYLOAD never reaches the durable job record', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    await runMediaJob(baseInput(store, { provenance: { brief: { instruction: 'secret editorial text' } } }))
    const serialised = JSON.stringify(store.all())
    expect(serialised).not.toContain('secret editorial text')
    expect(serialised).toContain('b'.repeat(64))   // the hash, and only the hash
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  8 · CONCURRENCY
// ═════════════════════════════════════════════════════════════════════════════

describe('concurrency', () => {
  it('two observers cannot both make a terminal transition', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const id = identity.newMediaJobId()
    await store.create({ id, projectId: PROJECT_A, provider: 'muapi', model: 'flux-dev', briefHash: 'd'.repeat(64), simulated: true })
    const dispatching = await store.transition({ id, expectedVersion: 1, to: 'DISPATCHING', at: 'T0' })
    const queued = await store.transition({ id, expectedVersion: (dispatching as any).record.version, to: 'QUEUED', at: 'T1' })
    const v = (queued as any).record.version

    // Both read the same version, both try to finish the job.
    const [a, b] = await Promise.all([
      store.transition({ id, expectedVersion: v, to: 'SUCCEEDED', at: 'T2' }),
      store.transition({ id, expectedVersion: v, to: 'FAILED', at: 'T2' }),
    ])

    const winners = [a, b].filter(r => r.ok)
    expect(winners).toHaveLength(1)
    const loser = [a, b].find(r => !r.ok) as any
    expect(loser.refusal).toBe('version_conflict')
  })

  it('a duplicate observation cannot admit the asset twice', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const id = identity.newMediaJobId()
    await store.create({ id, projectId: PROJECT_A, provider: 'muapi', model: 'flux-dev', briefHash: 'e'.repeat(64), simulated: true })
    let rec = (await store.transition({ id, expectedVersion: 1, to: 'DISPATCHING', at: 'T0' }) as any).record
    rec = (await store.transition({ id, expectedVersion: rec.version, to: 'SUCCEEDED', at: 'T1' }) as any).record

    const first = await store.recordAdmission({ id, expectedVersion: rec.version, assetId: 'asset-A' as any, at: 'T2' })
    expect(first.ok).toBe(true)

    // A second, DIFFERENT asset — the shape a duplicate delivery would take.
    const second = await store.recordAdmission({
      id, expectedVersion: (first as any).record.version, assetId: 'asset-B' as any, at: 'T3',
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.refusal).toBe('already_admitted')
    expect((await store.read(id))?.assetId).toBe('asset-A')
  })

  it('a remote operation id is written once and never rebound', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const id = identity.newMediaJobId()
    await store.create({ id, projectId: PROJECT_A, provider: 'muapi', model: 'flux-dev', briefHash: 'f'.repeat(64), simulated: true })
    let rec = (await store.transition({ id, expectedVersion: 1, to: 'DISPATCHING', at: 'T0' }) as any).record
    rec = (await store.transition({ id, expectedVersion: rec.version, to: 'QUEUED', remoteOperationId: 'first' as any, at: 'T1' }) as any).record
    rec = (await store.transition({ id, expectedVersion: rec.version, to: 'RUNNING', remoteOperationId: 'second' as any, at: 'T2' }) as any).record

    expect(rec.remoteOperationId).toBe('first')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  9 · PROJECT ISOLATION
// ═════════════════════════════════════════════════════════════════════════════

describe('project isolation', () => {
  it('a job is owned by exactly one project and is not visible to another', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    const a = await runMediaJob(baseInput(store))
    const record = await store.read(a.jobId)
    expect(record?.projectId).toBe(PROJECT_A)
    expect(await store.listUnresolved([PROJECT_B])).toEqual([])
  })

  it('admission is told the job\'s project, never the provider\'s idea of one', async () => {
    const store = storeMod.createInMemoryMediaJobStore()
    await runMediaJob(baseInput(store, {
      observe: async () => {
        observeCalls += 1
        return jobResult({ ...( { projectId: PROJECT_B } as any) })
      },
    }))
    expect(admitCalls[0].projectId).toBe(PROJECT_A)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  10 · MUAPI ADAPTER — dispatch classification, with a fake transport
// ═════════════════════════════════════════════════════════════════════════════

describe('MuAPI adapter dispatch classification', () => {
  const ENV = {
    MUAPI_ENABLED: '1',
    MUAPI_MODE: 'test',
    MUAPI_TEST_API_KEY: 'sk-test-not-a-real-key',
  }

  function provider(fetchImpl: any) {
    return new MuapiProvider({ env: ENV as any, fetchImpl })
  }

  it('declares its real lifecycle — and that it cannot reconcile a lost creation', () => {
    expect(MUAPI_LIFECYCLE).toEqual({
      observation: 'poll',
      clientIdempotency: false,
      lookupByRemoteId: true,
      lookupByCorrelationId: false,
      lookupByHistory: false,
      cancellable: false,
    })
  })

  it('a connect-stage failure on CREATE is definite, and never ambiguous', async () => {
    const p = provider(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) })
    const err = await p.generateImage({ model: 'flux-dev', prompt: 'x' }).catch(e => e)
    expect(err.code).toBe('MEDIA_PROVIDER_REQUEST_FAILED')
    expect(err.dispatchObservation).toBe('not_dispatched')
  })

  it('a reset on CREATE is MEDIA_DISPATCH_UNKNOWN and is NOT retryable', async () => {
    const p = provider(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) })
    const err = await p.generateImage({ model: 'flux-dev', prompt: 'x' }).catch(e => e)
    expect(err.code).toBe('MEDIA_DISPATCH_UNKNOWN')
    expect(err.dispatchObservation).toBe('response_lost')
    // The property the constructor forces: an ambiguous creation is never
    // marked retryable, whatever a status might otherwise imply.
    expect(err.retryable).toBe(false)
  })

  it('a 4xx on CREATE is a vendor rejection; a 5xx is ambiguous', async () => {
    const p4 = provider(async () => new Response('bad prompt', { status: 400 }))
    const e4 = await p4.generateImage({ model: 'flux-dev', prompt: 'x' }).catch(e => e)
    expect(e4.dispatchObservation).toBe('remote_rejected')
    expect(e4.code).not.toBe('MEDIA_DISPATCH_UNKNOWN')

    const p5 = provider(async () => new Response('bad gateway', { status: 502 }))
    const e5 = await p5.generateImage({ model: 'flux-dev', prompt: 'x' }).catch(e => e)
    expect(e5.code).toBe('MEDIA_DISPATCH_UNKNOWN')
    expect(e5.dispatchObservation).toBe('response_lost')
    expect(e5.retryable).toBe(false)
  })

  it('a 2xx with no usable id is UNKNOWN, not "invalid response"', async () => {
    for (const body of [{}, { request_id: 42 }, { request_id: '' }, { request_id: '../evil' }]) {
      const p = provider(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
      const err = await p.generateImage({ model: 'flux-dev', prompt: 'x' }).catch(e => e)
      expect(err.code).toBe('MEDIA_DISPATCH_UNKNOWN')
      expect(err.dispatchObservation).toBe('confirmed_evidence_failed')
    }
  })

  it('a successful CREATE yields a usable, sanitised operation id', async () => {
    const p = provider(async () => new Response(JSON.stringify({ request_id: 'req_abc-123' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const ref = await p.generateImage({ model: 'flux-dev', prompt: 'x' })
    expect(ref.requestId).toBe('req_abc-123')
    expect(ref.mode).toBe('test')
  })

  it('a READ failure carries no dispatch observation — the question does not arise', async () => {
    const p = provider(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) })
    const err = await p.getStatus({ provider: 'muapi', requestId: 'r1', model: 'm', submittedAt: 'T', mode: 'test' }).catch(e => e)
    expect(err.dispatchObservation).toBeNull()
    expect(err.code).not.toBe('MEDIA_DISPATCH_UNKNOWN')
  })

  it('the gate still refuses every call when disabled — reads included', async () => {
    let fetched = 0
    const p = new MuapiProvider({ env: {} as any, fetchImpl: async () => { fetched += 1; return new Response('{}') } })
    await p.generateImage({ model: 'flux-dev', prompt: 'x' }).catch(() => {})
    await p.getStatus({ provider: 'muapi', requestId: 'r', model: 'm', submittedAt: 'T', mode: 'test' }).catch(() => {})
    expect(fetched).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  11 · BOUNDARY GUARDS — asserted against the real source
// ═════════════════════════════════════════════════════════════════════════════

describe('boundary guards', () => {
  const ROOT = process.cwd()
  const JOB_DIR = 'lib/media/job'

  function jobSources(): { file: string; src: string }[] {
    return readdirSync(join(ROOT, JOB_DIR))
      .filter(f => f.endsWith('.ts'))
      .map(f => ({ file: `${JOB_DIR}/${f}`, src: readFileSync(join(ROOT, JOB_DIR, f), 'utf8') }))
  }

  /** Strip comments — prose about a rule must not read as a violation of it. */
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  /**
   * The guard patterns, named once and used BOTH by the guards below and by the
   * regressions at the end. A regression that re-typed the pattern would prove
   * only that the copy works — the point is to prove that THESE detect an escape.
   */
  const FORBIDDEN_IN_LIFECYCLE: { label: string; re: RegExp }[] = [
    { label: 'spend boundary', re: /withGovernedSpend|reserveSpend|settleSpend|releaseSpend|budget-gate/ },
    { label: 'blind retry wrapper', re: /lib\/media\/retry|withRetry\s*\(/ },
    { label: 'provider construction or hostname', re: /new MuapiProvider|getMediaProvider|resolveProviderFor|api\.muapi\.ai|https?:\/\/api\./ },
  ]

  it('scans a non-trivial amount of source', () => {
    expect(jobSources().length).toBeGreaterThanOrEqual(6)
  })

  for (const { label, re } of FORBIDDEN_IN_LIFECYCLE) {
    it(`no lifecycle module reaches a ${label}`, () => {
      const offenders = jobSources().filter(({ src }) => re.test(code(src))).map(f => f.file)
      expect(offenders).toEqual([])
    })
  }

  it('NO SECOND ASSET SYSTEM — admission is the only way bytes become an asset', () => {
    const offenders = jobSources()
      .filter(({ file, src }) => file !== `${JOB_DIR}/run.ts` && /admitAsset|putAssetBytes|insertAsset/.test(code(src)))
      .map(f => f.file)
    expect(offenders).toEqual([])

    const run = jobSources().find(f => f.file === `${JOB_DIR}/run.ts`)!
    expect(code(run.src)).toContain('admitAssetFromUrl')
    // No bucket, no storage client, no path assembly of its own.
    expect(code(run.src)).not.toMatch(/media-assets|storage_bucket|BUCKET_FOR_VISIBILITY/)
  })

  it('THE POLL PATH CANNOT DISPATCH — poll.ts imports nothing that could create', () => {
    const poll = jobSources().find(f => f.file === `${JOB_DIR}/poll.ts`)!
    expect(code(poll.src)).not.toMatch(/dispatch|generateImage|withGovernedSpend|MuapiProvider/)
  })

  it('RECONCILIATION IS READ-ONLY — it can observe and it cannot generate', () => {
    const rec = jobSources().find(f => f.file === `${JOB_DIR}/reconcile.ts`)!
    expect(code(rec.src)).toContain('getStatus')
    expect(code(rec.src)).not.toMatch(/generateImage|generateVideo|editImage|imageToVideo|runMediaJob/)
  })

  it('REGRESSION — every guard actually detects a planted escape', () => {
    // If this ever fails, the guards above are proving nothing. Each planted
    // line is run against the SAME regex the guard uses, not a copy of it.
    const planted = code(`
      import { withGovernedSpend } from '@/lib/cost/governed-spend'
      import { withRetry } from '@/lib/media/retry'
      const p = new MuapiProvider()
      await fetch('https://api.muapi.ai/api/v1/flux-dev')
    `)
    expect(FORBIDDEN_IN_LIFECYCLE.filter(f => f.re.test(planted)).map(f => f.label))
      .toEqual(['spend boundary', 'blind retry wrapper', 'provider construction or hostname'])
  })

  it('REGRESSION — commented-out mentions are not false positives', () => {
    const prose = code(`
      // withGovernedSpend is deliberately not called here
      // withRetry() must never wrap a dispatch
      /* api.muapi.ai is reached only by the adapter */
    `)
    expect(FORBIDDEN_IN_LIFECYCLE.filter(f => f.re.test(prose))).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  12 · ELIGIBILITY — the lifecycle's own conclusion about itself
// ═════════════════════════════════════════════════════════════════════════════

describe('eligibility', () => {
  it('provider-layer candidates stay undispatchable, and say WHY precisely', async () => {
    const { describeMediaCandidates } = await import('@/lib/media/orchestrator/candidates')
    const candidates = describeMediaCandidates({ IDEOGRAM_API_KEY: 'k', OPENAI_API_KEY: 'k' } as any)
    const providerLayer = candidates.filter(c => c.family === 'provider-layer')

    expect(storeMod.DURABLE_MEDIA_JOB_STORE_AVAILABLE).toBe(false)
    for (const c of providerLayer) {
      expect(c.dispatch.supported).toBe(false)
      if (!c.dispatch.supported) {
        // The reason has MOVED ON from Phase 2: the lifecycle exists; the store
        // does not. An operator must be able to tell those apart.
        expect(c.dispatch.reason).toBe(storeMod.DURABLE_MEDIA_JOB_STORE_BLOCKER)
        expect(c.dispatch.reason).not.toMatch(/not implemented in Phase 2/)
      }
    }
  })

  it('the bridge candidates are untouched — Phase 2 keeps working', async () => {
    const { describeMediaCandidates } = await import('@/lib/media/orchestrator/candidates')
    const candidates = describeMediaCandidates({ IDEOGRAM_API_KEY: 'k', OPENAI_API_KEY: 'k' } as any)
    const bridge = candidates.filter(c => c.family === 'bridge')

    expect(bridge.map(c => c.id).sort()).toEqual(['ideogram', 'openai'])
    for (const c of bridge) expect(c.dispatch.supported).toBe(true)
  })

  it('a required reference still fails closed against a provider-layer candidate', async () => {
    const { filterEligible } = await import('@/lib/media/orchestrator/eligibility')
    const { describeMediaCandidates } = await import('@/lib/media/orchestrator/candidates')
    const candidates = describeMediaCandidates({} as any)
      .filter(c => c.family === 'provider-layer')

    const { eligible, rejected } = filterEligible(candidates, {
      projectId: PROJECT_A, mediaType: 'image', referenceRequirement: 'required',
      invocation: { kind: 'internal-application', caller: 'article-hero' },
      brief: { instruction: 'x' }, storagePath: 'p', operation: 'op', agent: 'a',
      execution: { context: 'AUTONOMOUS', scope: { kind: 'GLOBAL_ONLY' } },
    } as any)

    expect(eligible).toEqual([])
    // PR #164's contract, one layer up and still intact.
    expect(rejected.some(r => r.rule === 'reference_unsupported' || r.rule === 'not_configured')).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  13 · VOCABULARY
// ═════════════════════════════════════════════════════════════════════════════

describe('vocabulary', () => {
  it('the failure taxonomy is closed and is not one generic code', () => {
    expect(MEDIA_JOB_FAILURES.length).toBeGreaterThanOrEqual(9)
    expect(MEDIA_JOB_FAILURES).not.toContain('MEDIA_JOB_FAILED')
    expect(new Set(MEDIA_JOB_FAILURES).size).toBe(MEDIA_JOB_FAILURES.length)
  })

  it('the states are exactly seven, and three are terminal', () => {
    expect([...lifecycle.MEDIA_JOB_STATES]).toEqual([
      'PENDING_DISPATCH', 'DISPATCHING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN',
    ])
    expect([...lifecycle.TERMINAL_MEDIA_JOB_STATES]).toEqual(['SUCCEEDED', 'FAILED', 'UNKNOWN'])
    expect(lifecycle.MEDIA_JOB_STATES.filter(lifecycle.isAmbiguousMediaJobState)).toEqual(['UNKNOWN'])
  })

  it('MEDIA_DISPATCH_UNKNOWN joined the closed provider error list', async () => {
    const { MEDIA_PROVIDER_ERROR_CODES } = await import('@/lib/media/providers/types')
    expect(MEDIA_PROVIDER_ERROR_CODES).toContain('MEDIA_DISPATCH_UNKNOWN')
  })
})
