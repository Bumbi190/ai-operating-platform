/**
 * The persistence boundary's contract.
 *
 * These tests use a recording fake rather than a database. What they prove is
 * the half of the guarantee that lives in TypeScript: the store REFUSES an
 * illegal move before it reaches the RPC, derives `from` from history instead of
 * trusting a caller, and will not rewrite a registered definition. The other
 * half — the compare-and-set under a row lock, the append-only triggers, the
 * projection guard — is enforced by the database and verified against the real
 * schema after the migration is applied.
 */

import { describe, expect, it, vi } from 'vitest'
import * as store from '@/lib/workflows/store'
import { InvalidTransitionError } from '@/lib/workflows/store'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'

const VENDORED = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!
const DEF_ID = 'def-1'
const INSTANCE_ID = 'inst-1'

interface FakeState {
  defs: Record<string, unknown>[]
  instances: Record<string, unknown>[]
  transitions: Record<string, unknown>[]
  evidence: Record<string, unknown>[]
}

/** Minimal PostgREST-shaped fake: only the call chains the store actually uses. */
function fakeDb(seed: Partial<FakeState> = {}) {
  const state: FakeState = {
    defs: seed.defs ?? [],
    instances: seed.instances ?? [],
    transitions: seed.transitions ?? [],
    evidence: seed.evidence ?? [],
  }
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const inserts: { table: string; row: Record<string, unknown> }[] = []

  function table(name: keyof FakeState) {
    let rows = [...state[name]]
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (col: string, val: unknown) => {
        rows = rows.filter(r => r[col] === val)
        return chain
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }),
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table: name, row })
        const created = { id: `${name}-new`, created_at: 'now', recorded_at: 'now', ...row }
        rows = [created]
        return chain
      },
      // PostgREST list reads await the builder itself rather than calling a
      // terminal method, so the chain has to be thenable — and must read `rows`
      // at await time, after every .eq() has narrowed it.
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    }
    return chain
  }

  const db = {
    from: (name: string) => table(name.replace('workflow_', '') as keyof FakeState),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      if (name === 'workflow_instantiate') {
        return { data: { id: INSTANCE_ID, def_id: args.p_def_id, def_key: VENDORED.def_key,
          def_version: 1, def_hash: VENDORED.def_hash, project_id: args.p_project_id,
          instance_key: args.p_instance_key, current_state: args.p_initial_state,
          status: 'active', wake_at: null, created_at: 'now', closed_at: null }, error: null }
      }
      return { data: { id: 't-new', seq: 2, instance_id: args.p_instance_id,
        from_state: args.p_from_state, to_state: args.p_to_state, reason: args.p_reason,
        actor: args.p_actor, evidence_ref: args.p_evidence_ref,
        authorization_id: args.p_authorization_id, occurred_at: 'now' }, error: null }
    },
  }
  return { db, rpcCalls, inserts, state }
}

const defRow = (hash = VENDORED.def_hash) => ({
  id: DEF_ID, def_key: VENDORED.def_key, version: 1, def_hash: hash,
  spec: VENDORED.spec, created_at: 'now',
})

const instanceRow = (currentState: string, status = 'active') => ({
  id: INSTANCE_ID, def_id: DEF_ID, def_key: VENDORED.def_key, def_version: 1,
  def_hash: VENDORED.def_hash, project_id: 'p1', instance_key: '2026-11',
  current_state: currentState, status, wake_at: null, created_at: 'now', closed_at: null,
})

const openTx = () => ({
  id: 't1', seq: 1, instance_id: INSTANCE_ID, from_state: null, to_state: 'planning',
  reason: 'created', actor: 'system', evidence_ref: null, authorization_id: null, occurred_at: 'now',
})

// ── Surface ──────────────────────────────────────────────────────────────────

describe('store — exposes no way to rewrite history', () => {
  it('has no update or delete export for transitions, evidence or definitions', () => {
    const forbidden = Object.keys(store).filter(k => /update|delete|remove|edit|rewrite|purge/i.test(k))
    expect(forbidden).toEqual([])
  })

  it('exposes exactly the intended write verbs', () => {
    expect(typeof store.registerVendoredDefinition).toBe('function')
    expect(typeof store.instantiate).toBe('function')
    expect(typeof store.appendTransition).toBe('function')
    expect(typeof store.recordEvidence).toBe('function')
  })
})

// ── Definition registration ──────────────────────────────────────────────────

describe('store — definition registration is idempotent and immutable', () => {
  it('returns the existing row without inserting when the hash matches', async () => {
    const { db, inserts } = fakeDb({ defs: [defRow()] })
    const result = await store.registerVendoredDefinition(db, VENDORED.def_key, 1)
    expect(result.created).toBe(false)
    expect(result.def.id).toBe(DEF_ID)
    expect(inserts).toEqual([])
  })

  it('inserts when the version is not yet registered', async () => {
    const { db, inserts } = fakeDb({ defs: [] })
    const result = await store.registerVendoredDefinition(db, VENDORED.def_key, 1)
    expect(result.created).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].row.def_hash).toBe(VENDORED.def_hash)
  })

  it('REFUSES to reconcile a stored version whose hash differs', async () => {
    // Principle 3: a definition change is a new version, never an edit — an edit
    // would move the ground under every instance pinned to it.
    const { db, inserts } = fakeDb({ defs: [defRow('0'.repeat(64))] })
    await expect(store.registerVendoredDefinition(db, VENDORED.def_key, 1))
      .rejects.toThrow(/already registered with a different def_hash/)
    expect(inserts).toEqual([])
  })

  it('refuses a definition this build does not vendor', async () => {
    const { db } = fakeDb()
    await expect(store.registerVendoredDefinition(db, 'not.vendored', 1))
      .rejects.toThrow(/is not vendored in this build/)
  })
})

// ── Instantiation ────────────────────────────────────────────────────────────

describe('store — instantiate', () => {
  it('takes the initial state from the pinned spec, never from the caller', async () => {
    const { db, rpcCalls } = fakeDb({ defs: [defRow()] })
    await store.instantiate(db, {
      defKey: VENDORED.def_key, version: 1, projectId: 'p1',
      instanceKey: '2026-11', actor: 'system', reason: 'November release',
    })
    const call = rpcCalls.find(c => c.name === 'workflow_instantiate')!
    expect(call.args.p_initial_state).toBe('planning')
    expect(call.args.p_instance_key).toBe('2026-11')
  })

  it('registers the definition as part of instantiating', async () => {
    const { db, inserts } = fakeDb({ defs: [] })
    await store.instantiate(db, {
      defKey: VENDORED.def_key, version: 1, projectId: 'p1',
      instanceKey: '2026-11', actor: 'system', reason: 'x',
    })
    expect(inserts.some(i => i.table === 'defs')).toBe(true)
  })
})

// ── Transitions ──────────────────────────────────────────────────────────────

describe('store — appendTransition validates before it writes', () => {
  it('refuses an undeclared jump and never reaches the RPC', async () => {
    const { db, rpcCalls } = fakeDb({
      defs: [defRow()], instances: [instanceRow('planning')], transitions: [openTx()],
    })
    await expect(store.appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'protected_upload', reason: 'skip ahead', actor: 'test',
      authorizationId: 'auth-1',
    })).rejects.toThrow(InvalidTransitionError)
    expect(rpcCalls.filter(c => c.name === 'workflow_append_transition')).toEqual([])
  })

  it('refuses an unauthorized advance across a gate and never reaches the RPC', async () => {
    const { db, rpcCalls } = fakeDb({
      defs: [defRow()], instances: [instanceRow('planning')], transitions: [openTx()],
    })
    await expect(store.appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'content_generation', reason: 'go', actor: 'test',
    })).rejects.toThrow(/crosses a required human gate/)
    expect(rpcCalls.filter(c => c.name === 'workflow_append_transition')).toEqual([])
  })

  it('writes a legal, authorized advance and derives from_state from history', async () => {
    const { db, rpcCalls } = fakeDb({
      defs: [defRow()], instances: [instanceRow('planning')], transitions: [openTx()],
    })
    await store.appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'content_generation', reason: 'approved', actor: 'editor',
      authorizationId: 'auth-1',
    })
    const call = rpcCalls.find(c => c.name === 'workflow_append_transition')!
    // Derived from the transition history, NOT from the instance projection and
    // NOT from a caller-supplied value.
    expect(call.args.p_from_state).toBe('planning')
    expect(call.args.p_to_state).toBe('content_generation')
    expect(call.args.p_authorization_id).toBe('auth-1')
  })

  it('refuses to build on an instance with no history', async () => {
    const { db } = fakeDb({ defs: [defRow()], instances: [instanceRow('planning')], transitions: [] })
    await expect(store.appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'content_generation', reason: 'x', actor: 'y',
    })).rejects.toThrow(/no transition history/)
  })

  it('refuses an unknown instance', async () => {
    const { db } = fakeDb({ defs: [defRow()] })
    await expect(store.appendTransition(db, {
      instanceId: 'ghost', to: 'content_generation', reason: 'x', actor: 'y',
    })).rejects.toThrow(/unknown instance/)
  })
})

// ── Evidence ─────────────────────────────────────────────────────────────────

describe('store — recordEvidence', () => {
  it('refuses evidence filed against a state the definition does not declare', async () => {
    const { db, inserts } = fakeDb({ defs: [defRow()], instances: [instanceRow('planning')] })
    await expect(store.recordEvidence(db, {
      instanceId: INSTANCE_ID, state: 'ghost_state', checkKey: 'x', result: 'pass', source: 'attested',
    })).rejects.toThrow(/is not declared by/)
    expect(inserts.filter(i => i.table === 'evidence')).toEqual([])
  })

  it('records an attested result against a declared state', async () => {
    const { db, inserts } = fakeDb({ defs: [defRow()], instances: [instanceRow('local_qa')] })
    await store.recordEvidence(db, {
      instanceId: INSTANCE_ID, state: 'local_qa', checkKey: 'audio_files_19_of_19',
      result: 'pass', source: 'attested', detail: { by: 'editor' },
    })
    const row = inserts.find(i => i.table === 'evidence')!.row
    expect(row.state).toBe('local_qa')
    expect(row.source).toBe('attested')
    expect(row.result).toBe('pass')
  })
})
