/**
 * lib/qa/media-job-store-durable.test.ts — the DURABLE store adapter.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
 * Three suites cover the durable path, and each proves something the others
 * structurally cannot:
 *
 *   media-job-lifecycle.test.ts      the LIFECYCLE, against an in-memory store
 *   media-job-lifecycle-sql.test.ts  the DATABASE, by running the real
 *                                    migrations against a real postgres
 *   this file                        the ADAPTER: that it issues exactly the
 *                                    right operations, and no others
 *
 * The adapter speaks PostgREST, which has no local equivalent, so it is driven
 * against a recording fake. That is the honest boundary: the database's
 * enforcement is proven in SQL, and what is proven HERE is the shape of every
 * request — that the CAS predicate is sent to the database rather than
 * evaluated in this process, and that reconciliation is ONE round trip.
 *
 * The single most important assertion in this file is negative:
 * `recordReconciliation` must never issue an INSERT followed by an UPDATE.
 */

import { describe, it, expect, beforeEach } from 'vitest'

const { createSupabaseMediaJobStore } = await import('@/lib/media/job/store-supabase')
const { newMediaJobId } = await import('@/lib/media/job/identity')

// ── A recording PostgREST-shaped fake ────────────────────────────────────────

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'

function fakeDb(opts: {
  row?: Record<string, unknown> | null
  updateReturns?: Record<string, unknown> | null
  rpcReturns?: unknown
  rpcError?: { code?: string; message: string }
  updateError?: { code?: string; message: string }
} = {}) {
  const calls: Call[] = []

  const builder = (table: string, op: string, payload?: unknown) => {
    const call: Call = { table, op, payload, filters: [] }
    calls.push(call)
    const chain: any = {
      eq(col: string, val: unknown) { call.filters.push([col, val]); return chain },
      in(col: string, val: unknown) { call.filters.push([col, val]); return chain },
      order() { return chain },
      select() { return chain },
      maybeSingle() {
        if (op === 'update') {
          return Promise.resolve(opts.updateError
            ? { data: null, error: opts.updateError }
            : { data: opts.updateReturns ?? null, error: null })
        }
        if (op === 'insert') return Promise.resolve({ data: opts.row ?? null, error: null })
        return Promise.resolve({ data: opts.row ?? null, error: null })
      },
      then(res: (v: unknown) => unknown) {
        return Promise.resolve({ data: opts.row ? [opts.row] : [], error: null }).then(res)
      },
    }
    return chain
  }

  return {
    calls,
    from(table: string) {
      return {
        select: () => builder(table, 'select'),
        insert: (payload: unknown) => builder(table, 'insert', payload),
        update: (payload: unknown) => builder(table, 'update', payload),
      }
    },
    rpc(fn: string, payload: unknown) {
      calls.push({ table: `rpc:${fn}`, op: 'rpc', payload, filters: [] })
      return Promise.resolve(opts.rpcError
        ? { data: null, error: opts.rpcError }
        : { data: opts.rpcReturns ?? null, error: null })
    },
  }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  project_id: PROJECT_A,
  provider: 'muapi',
  model: 'flux-dev',
  state: 'UNKNOWN',
  remote_operation_id: null,
  dispatch_observation: 'response_lost',
  simulated: true,
  brief_hash: 'b'.repeat(64),
  asset_id: null,
  last_failure_code: 'MEDIA_DISPATCH_UNKNOWN',
  last_failure_detail: 'socket reset',
  reconciliation_required: true,
  created_at: '2026-09-03T00:00:00.000Z',
  dispatch_started_at: '2026-09-03T00:00:01.000Z',
  remote_confirmed_at: null,
  terminal_at: '2026-09-03T00:00:02.000Z',
  version: 3,
  ...over,
})

let db: ReturnType<typeof fakeDb>
beforeEach(() => { db = fakeDb() })

// ═════════════════════════════════════════════════════════════════════════════

describe('durable store — UNKNOWN survives the process', () => {
  it('a fresh store instance reads back UNKNOWN with its full evidence', async () => {
    // The whole reason the table exists: the store that WROTE this row is gone.
    const store = createSupabaseMediaJobStore(fakeDb({ row: row() }) as any)
    const rec = await store.read('aaaaaaaa-0000-4000-8000-000000000001' as any)

    expect(rec?.state).toBe('UNKNOWN')
    expect(rec?.reconciliationRequired).toBe(true)
    // The evidence a human reconciles against, all of it durable.
    expect(rec?.dispatchObservation).toBe('response_lost')
    expect(rec?.remoteOperationId).toBeNull()
    expect(rec?.projectId).toBe(PROJECT_A)
    expect(rec?.model).toBe('flux-dev')
    expect(rec?.briefHash).toBe('b'.repeat(64))
    expect(rec?.dispatchStartedAt).not.toBeNull()
  })

  it('dispatch_observation round-trips both ambiguous values distinctly', async () => {
    for (const obs of ['response_lost', 'confirmed_evidence_failed'] as const) {
      const store = createSupabaseMediaJobStore(fakeDb({ row: row({ dispatch_observation: obs }) }) as any)
      const rec = await store.read('x' as any)
      expect(rec?.dispatchObservation).toBe(obs)
    }
  })
})

describe('durable store — CAS is sent to the database', () => {
  it('transition issues a conditional UPDATE carrying id AND expected version', async () => {
    const d = fakeDb({ row: row({ state: 'QUEUED', version: 3 }), updateReturns: row({ state: 'RUNNING', version: 4 }) })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.transition({
      id: 'aaaaaaaa-0000-4000-8000-000000000001' as any,
      expectedVersion: 3, to: 'RUNNING', at: 'T1',
    })

    expect(res.ok).toBe(true)
    const upd = d.calls.find(c => c.op === 'update')!
    // THE PREDICATE IS IN THE DATABASE, not in this process.
    expect(upd.filters).toEqual(expect.arrayContaining([
      ['id', 'aaaaaaaa-0000-4000-8000-000000000001'],
      ['version', 3],
    ]))
    // The successor is explicit because PostgREST cannot express `version + 1`;
    // the trigger independently refuses anything but old.version + 1.
    expect((upd.payload as Record<string, unknown>).version).toBe(4)
  })

  it('zero affected rows is a CAS CONFLICT — never a redispatch signal', async () => {
    const d = fakeDb({ row: row({ state: 'SUCCEEDED', version: 7 }), updateReturns: null })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.transition({
      id: 'aaaaaaaa-0000-4000-8000-000000000001' as any,
      expectedVersion: 7, to: 'RUNNING', at: 'T1',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.refusal).toBe('version_conflict')
  })

  it('a stale expected version is refused before any write is attempted', async () => {
    const d = fakeDb({ row: row({ version: 9 }) })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.transition({ id: 'x' as any, expectedVersion: 3, to: 'RUNNING', at: 'T' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.refusal).toBe('version_conflict')
    expect(d.calls.filter(c => c.op === 'update')).toHaveLength(0)
  })

  it('two writers at the same version: the loser conflicts and cannot overwrite', async () => {
    const winner = createSupabaseMediaJobStore(
      fakeDb({ row: row({ state: 'RUNNING', version: 4 }), updateReturns: row({ state: 'SUCCEEDED', version: 5 }) }) as any)
    const loser = createSupabaseMediaJobStore(
      fakeDb({ row: row({ state: 'RUNNING', version: 4 }), updateReturns: null }) as any)

    const [a, b] = await Promise.all([
      winner.transition({ id: 'x' as any, expectedVersion: 4, to: 'SUCCEEDED', at: 'T' }),
      loser.transition({ id: 'x' as any, expectedVersion: 4, to: 'FAILED', at: 'T' }),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    const lost = [a, b].find(r => !r.ok) as any
    expect(lost.refusal).toBe('version_conflict')
  })

  it('the guard\'s refusal is mapped, not swallowed', async () => {
    const d = fakeDb({
      row: row({ state: 'UNKNOWN', version: 3 }),
      updateError: { code: '23001', message: 'media_jobs: UNKNOWN may only be resolved by a recorded reconciliation (job x)' },
    })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.transition({ id: 'x' as any, expectedVersion: 3, to: 'SUCCEEDED', at: 'T' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.refusal).toBe('requires_reconciliation')
  })
})

describe('durable store — reconciliation is ONE transaction', () => {
  it('recordReconciliation issues exactly one RPC and NO insert/update', async () => {
    const d = fakeDb({ rpcReturns: row({ state: 'SUCCEEDED', version: 4, reconciliation_required: false }) })
    const store = createSupabaseMediaJobStore(d as any)

    const res = await store.recordReconciliation({
      id: 'aaaaaaaa-0000-4000-8000-000000000001' as any,
      expectedVersion: 3,
      record: {
        projectId: PROJECT_A, provider: 'muapi', remoteOperationId: null,
        result: 'CONFIRMED_SUCCEEDED', blocker: null, detail: {}, observedAt: 'T',
      },
      resolvesTo: 'SUCCEEDED', at: 'T',
    })

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.record.state).toBe('SUCCEEDED')

    // THE ASSERTION THIS FILE EXISTS FOR.
    expect(d.calls.filter(c => c.op === 'insert')).toHaveLength(0)
    expect(d.calls.filter(c => c.op === 'update')).toHaveLength(0)
    expect(d.calls.filter(c => c.op === 'rpc')).toHaveLength(1)
    expect(d.calls[0].table).toBe('rpc:media_job_record_reconciliation')
  })

  it('identity is NOT sent — the function derives it from the locked job row', async () => {
    const d = fakeDb({ rpcReturns: row() })
    const store = createSupabaseMediaJobStore(d as any)
    await store.recordReconciliation({
      id: 'x' as any, expectedVersion: 3,
      record: {
        // A hostile caller naming another project and a foreign operation id.
        projectId: PROJECT_B, provider: 'openart' as any,
        remoteOperationId: 'someone-elses-operation' as any,
        result: 'CONFIRMED_SUCCEEDED', blocker: null, detail: {}, observedAt: 'T',
      },
      resolvesTo: 'SUCCEEDED', at: 'T',
    })

    const payload = d.calls[0].payload as Record<string, unknown>
    // None of these reach the database. Project authority is the job's own.
    expect(payload).not.toHaveProperty('p_project_id')
    expect(payload).not.toHaveProperty('p_provider')
    expect(payload).not.toHaveProperty('p_remote_operation_id')
    expect(Object.keys(payload).sort()).toEqual([
      'p_blocker', 'p_detail', 'p_expected_version', 'p_job_id',
      'p_observed_at', 'p_resolves_to', 'p_result',
    ])
  })

  it('an unresolved answer is sent with resolvesTo null — evidence without invented state', async () => {
    const d = fakeDb({ rpcReturns: row({ state: 'UNKNOWN', version: 3 }) })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.recordReconciliation({
      id: 'x' as any, expectedVersion: 3,
      record: {
        projectId: PROJECT_A, provider: 'muapi', remoteOperationId: null,
        result: 'STILL_UNKNOWN', blocker: 'no_remote_identity', detail: {}, observedAt: 'T',
      },
      resolvesTo: null, at: 'T',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.record.state).toBe('UNKNOWN')
    expect((d.calls[0].payload as Record<string, unknown>).p_resolves_to).toBeNull()
    expect((d.calls[0].payload as Record<string, unknown>).p_blocker).toBe('no_remote_identity')
  })

  it('every refusal maps to a DISTINCT contract value — none is "retry the dispatch"', async () => {
    const cases: [{ code?: string; message: string }, string][] = [
      [{ code: 'P0002', message: 'media_job_record_reconciliation: no such media job x' }, 'not_found'],
      [{ code: '23001', message: 'media_job_record_reconciliation: version conflict on job x (expected 3, found 5)' }, 'version_conflict'],
      [{ code: '23001', message: 'media_jobs: UNKNOWN may only be resolved by a recorded reconciliation (job x)' }, 'requires_reconciliation'],
      [{ code: '23001', message: 'media_jobs: illegal state transition SUCCEEDED -> UNKNOWN (job x)' }, 'illegal_transition'],
      [{ code: '23001', message: 'reconciliation: identity does not match media job x' }, 'write_failed'],
    ]
    for (const [rpcError, expected] of cases) {
      const store = createSupabaseMediaJobStore(fakeDb({ rpcError }) as any)
      const res = await store.recordReconciliation({
        id: 'x' as any, expectedVersion: 3,
        record: { projectId: PROJECT_A, provider: 'muapi', remoteOperationId: null,
                  result: 'CONFIRMED_SUCCEEDED', blocker: null, detail: {}, observedAt: 'T' },
        resolvesTo: 'SUCCEEDED', at: 'T',
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.refusal).toBe(expected)
    }
  })
})

describe('durable store — project isolation', () => {
  it('listUnresolved is scoped to the caller\'s projects', async () => {
    const d = fakeDb({ row: row() })
    const store = createSupabaseMediaJobStore(d as any)
    await store.listUnresolved([PROJECT_A])
    const sel = d.calls.find(c => c.op === 'select' && c.filters.length > 0)!
    expect(sel.filters).toEqual(expect.arrayContaining([
      ['project_id', [PROJECT_A]],
      ['reconciliation_required', true],
    ]))
  })

  it('an empty project list reads nothing at all', async () => {
    const d = fakeDb({ row: row() })
    const store = createSupabaseMediaJobStore(d as any)
    expect(await store.listUnresolved([])).toEqual([])
    expect(d.calls).toHaveLength(0)
  })

  it('create sends only the six fields a caller may state', async () => {
    const d = fakeDb({ row: row({ state: 'PENDING_DISPATCH', version: 1 }) })
    const store = createSupabaseMediaJobStore(d as any)
    await store.create({
      id: newMediaJobId(), projectId: PROJECT_A, provider: 'muapi',
      model: 'flux-dev', briefHash: 'c'.repeat(64), simulated: true,
    })
    const ins = d.calls.find(c => c.op === 'insert')!
    expect(Object.keys(ins.payload as object).sort())
      .toEqual(['brief_hash', 'id', 'model', 'project_id', 'provider', 'simulated'])
    // No state, no version, no asset, no remote id: those are the lifecycle's.
    expect(ins.payload).not.toHaveProperty('state')
    expect(ins.payload).not.toHaveProperty('asset_id')
    expect(ins.payload).not.toHaveProperty('remote_operation_id')
  })

  it('a remote operation id is never a lookup key', async () => {
    // The store exposes no read-by-remote-id at all. Every read is by local
    // identity or by project, so a vendor string cannot address a job.
    const store = createSupabaseMediaJobStore(fakeDb() as any)
    expect(Object.keys(store).sort()).toEqual([
      'create', 'listUnresolved', 'read', 'recordAdmission', 'recordReconciliation', 'transition',
    ])
  })
})

describe('durable store — admission binding', () => {
  it('re-binding the SAME asset is idempotent and issues no write', async () => {
    const d = fakeDb({ row: row({ state: 'SUCCEEDED', asset_id: 'asset-A', version: 5 }) })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.recordAdmission({ id: 'x' as any, expectedVersion: 5, assetId: 'asset-A' as any, at: 'T' })
    expect(res.ok).toBe(true)
    expect(d.calls.filter(c => c.op === 'update')).toHaveLength(0)
  })

  it('a DIFFERENT asset is refused as already_admitted, never overwritten', async () => {
    const d = fakeDb({ row: row({ state: 'SUCCEEDED', asset_id: 'asset-A', version: 5 }) })
    const store = createSupabaseMediaJobStore(d as any)
    const res = await store.recordAdmission({ id: 'x' as any, expectedVersion: 5, assetId: 'asset-B' as any, at: 'T' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.refusal).toBe('already_admitted')
    expect(d.calls.filter(c => c.op === 'update')).toHaveLength(0)
  })
})
