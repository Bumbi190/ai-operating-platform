import { describe, expect, it, vi } from 'vitest'
import { hasProjectViewerMembership } from '@/lib/atlas/project-viewer-access'

const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const VIEWER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makeDb(row: { user_id: string } | null, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }))
  const eqUser = vi.fn(() => ({ maybeSingle }))
  const eqProject = vi.fn(() => ({ eq: eqUser }))
  const select = vi.fn(() => ({ eq: eqProject }))
  const from = vi.fn(() => ({ select }))
  return { db: { from }, from, select, eqProject, eqUser, maybeSingle }
}

describe('project viewer read membership guard', () => {
  it('allows exactly the identified membership', async () => {
    const q = makeDb({ user_id: VIEWER })
    expect(await hasProjectViewerMembership(q.db, PROJECT, VIEWER)).toBe(true)
    expect(q.from).toHaveBeenCalledWith('project_viewer_memberships')
    expect(q.select).toHaveBeenCalledWith('user_id')
    expect(q.eqProject).toHaveBeenCalledWith('project_id', PROJECT)
    expect(q.eqUser).toHaveBeenCalledWith('user_id', VIEWER)
  })
  it('denies missing, foreign and revoked membership', async () => {
    expect(await hasProjectViewerMembership(makeDb(null).db, PROJECT, VIEWER)).toBe(false)
    expect(await hasProjectViewerMembership(makeDb({ user_id: PROJECT }).db, PROJECT, VIEWER)).toBe(false)
  })
  it('denies malformed identities without querying', async () => {
    const q = makeDb({ user_id: VIEWER })
    expect(await hasProjectViewerMembership(q.db, '', VIEWER)).toBe(false)
    expect(await hasProjectViewerMembership(q.db, PROJECT, 'user-supplied')).toBe(false)
    expect(q.from).not.toHaveBeenCalled()
  })
  it('fails closed on database errors and exceptions', async () => {
    expect(await hasProjectViewerMembership(makeDb({ user_id: VIEWER }, { message: 'db unavailable' }).db, PROJECT, VIEWER)).toBe(false)
    expect(await hasProjectViewerMembership({ from() { throw Error('db down') } }, PROJECT, VIEWER)).toBe(false)
  })
})
