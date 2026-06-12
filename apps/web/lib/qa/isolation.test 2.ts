/**
 * Atlas project-isolation boundary tests.
 *
 * Locks the leakage-path invariants identified in the visibility audit:
 *  - empty allow-list ⇒ empty result (never an unscoped query)
 *  - caller-supplied project id is only trusted when owned
 *  - getAllowedProjectIds mirrors `owner_id = userId` and fails closed
 */
import { describe, it, expect } from 'vitest'
import {
  getAllowedProjectIds,
  scopeProjectFilter,
  scopeToProjects,
  applyProjectScope,
  assertProjectAllowed,
  IMPOSSIBLE_PROJECT_ID,
} from '@/lib/atlas/isolation'

describe('applyProjectScope — undefined = no scope, array = scope (protects legacy callers)', () => {
  const mkQ = () => {
    const calls: { col: string; vals: string[] }[] = []
    const q: any = { in(col: string, vals: string[]) { calls.push({ col, vals }); return q } }
    return { q, calls }
  }
  it('undefined ⇒ does NOT call .in() (global/legacy caller unchanged)', () => {
    const { q, calls } = mkQ()
    expect(applyProjectScope(q, undefined)).toBe(q)
    expect(calls).toEqual([])
  })
  it('a populated array ⇒ scopes to it', () => {
    const { q, calls } = mkQ()
    applyProjectScope(q, ['p1', 'p2'])
    expect(calls).toEqual([{ col: 'project_id', vals: ['p1', 'p2'] }])
  })
  it('an EMPTY array ⇒ scopes to impossible id (zero rows, never global)', () => {
    const { q, calls } = mkQ()
    applyProjectScope(q, [])
    expect(calls).toEqual([{ col: 'project_id', vals: [IMPOSSIBLE_PROJECT_ID] }])
  })
  it('honors an indirect scope column', () => {
    const { q, calls } = mkQ()
    applyProjectScope(q, ['x'], 'id')
    expect(calls[0].col).toBe('id')
  })
})

describe('scopeProjectFilter — empty allow-list never returns empty array', () => {
  it('passes through a non-empty allow-list', () => {
    expect(scopeProjectFilter(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('substitutes an impossible id for an empty allow-list (no row matches)', () => {
    expect(scopeProjectFilter([])).toEqual([IMPOSSIBLE_PROJECT_ID])
  })
})

describe('scopeToProjects — always applies .in(), even when empty', () => {
  it('applies .in(project_id, ids) for a non-empty list', () => {
    const calls: { col: string; vals: string[] }[] = []
    const q: any = { in(col: string, vals: string[]) { calls.push({ col, vals }); return q } }
    scopeToProjects(q, ['p1', 'p2'])
    expect(calls).toEqual([{ col: 'project_id', vals: ['p1', 'p2'] }])
  })
  it('still applies .in() with the impossible id for an empty list (never skipped)', () => {
    const calls: { col: string; vals: string[] }[] = []
    const q: any = { in(col: string, vals: string[]) { calls.push({ col, vals }); return q } }
    scopeToProjects(q, [])
    expect(calls).toEqual([{ col: 'project_id', vals: [IMPOSSIBLE_PROJECT_ID] }])
  })
  it('supports an indirect scope column', () => {
    const calls: { col: string; vals: string[] }[] = []
    const q: any = { in(col: string, vals: string[]) { calls.push({ col, vals }); return q } }
    scopeToProjects(q, ['r1'], 'run_id')
    expect(calls[0].col).toBe('run_id')
  })
})

describe('assertProjectAllowed — caller-supplied id only trusted when owned', () => {
  const allowed = ['owned-1', 'owned-2']
  it('true for an owned project', () => expect(assertProjectAllowed('owned-1', allowed)).toBe(true))
  it('false for a non-owned project (by-id leak path)', () => expect(assertProjectAllowed('other-tenant', allowed)).toBe(false))
  it('false for null/undefined/empty', () => {
    expect(assertProjectAllowed(null, allowed)).toBe(false)
    expect(assertProjectAllowed(undefined, allowed)).toBe(false)
    expect(assertProjectAllowed('', allowed)).toBe(false)
  })
  it('false when the allow-list is empty', () => expect(assertProjectAllowed('owned-1', [])).toBe(false))
})

describe('getAllowedProjectIds — mirrors owner_id = userId, fails closed', () => {
  const mockDb = (rows: { id: string }[] | null, opts: { throw?: boolean } = {}) => ({
    from() {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              if (opts.throw) throw new Error('db down')
              // assert it scopes by owner_id
              expect(col).toBe('owner_id')
              expect(val).toBe('user-123')
              return Promise.resolve({ data: rows })
            },
          }
        },
      }
    },
  })

  it('returns the ids the user owns', async () => {
    const ids = await getAllowedProjectIds(mockDb([{ id: 'p1' }, { id: 'p2' }]) as any, 'user-123')
    expect(ids).toEqual(['p1', 'p2'])
  })
  it('returns [] when the user owns nothing', async () => {
    expect(await getAllowedProjectIds(mockDb([]) as any, 'user-123')).toEqual([])
  })
  it('fails closed ([]) when userId is missing', async () => {
    expect(await getAllowedProjectIds(mockDb([{ id: 'p1' }]) as any, null)).toEqual([])
    expect(await getAllowedProjectIds(mockDb([{ id: 'p1' }]) as any, undefined)).toEqual([])
  })
  it('fails closed ([]) on a db error', async () => {
    expect(await getAllowedProjectIds(mockDb(null, { throw: true }) as any, 'user-123')).toEqual([])
  })
})
