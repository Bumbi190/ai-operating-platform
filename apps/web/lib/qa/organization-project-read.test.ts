import { describe, expect, it, vi } from 'vitest'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function session(user = USER, role = 'collaborator', revoked_at: string | null = null) {
  return { from: vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { user_id: user, role, revoked_at }, error: null,
    }) }) }),
  })) }
}
function projects(
  rows: unknown = [{ id: PROJECT }],
  error: unknown = null,
  owner: unknown = { user_id: OWNER },
) {
  const projectEq = vi.fn(async () => ({ data: rows, error }))
  const ownerSingle = vi.fn(async () => ({ data: owner, error: null }))
  const ownerIs = vi.fn(() => ({ maybeSingle: ownerSingle }))
  const ownerEq = vi.fn(() => ({ is: ownerIs }))
  const from = vi.fn((table: string) => table === 'omnira_organization_memberships'
    ? { select: () => ({ eq: ownerEq }) }
    : { select: () => ({ eq: projectEq }) })
  return { from, projectEq, ownerEq, ownerIs }
}
describe('organization read scope is not an action authority', () => {
  it('returns only projects owned by the canonical active organization Owner', async () => {
    const db = projects()
    expect(await resolveOrganizationReadScope(session(), db, USER)).toEqual({
      role: { active: true, role: 'collaborator' }, projectIds: [PROJECT],
    })
    expect(db.ownerEq).toHaveBeenCalledWith('role', 'owner')
    expect(db.ownerIs).toHaveBeenCalledWith('revoked_at', null)
    expect(db.projectEq).toHaveBeenCalledWith('owner_id', OWNER)
  })
  it('rejects a claimed Owner whose identity does not match canonical Owner', async () => {
    const db = projects()
    expect((await resolveOrganizationReadScope(session(USER, 'owner'), db, USER)).projectIds).toEqual([])
    expect(db.projectEq).not.toHaveBeenCalled()
  })
  it('denies revoked, invalid, missing membership without any admin reads', async () => {
    for (const member of [session(USER, 'collaborator', '2026-10-13'), session(USER, 'admin')]) {
      const db = projects()
      expect((await resolveOrganizationReadScope(member, db, USER)).projectIds).toEqual([])
      expect(db.from).not.toHaveBeenCalled()
    }
    const db = projects()
    expect((await resolveOrganizationReadScope(session(), db, null)).projectIds).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
  })
  it('denies missing owner, malformed IDs, project database errors', async () => {
    const absent = projects(undefined, null, null)
    expect((await resolveOrganizationReadScope(session(), absent, USER)).projectIds).toEqual([])
    expect(absent.projectEq).not.toHaveBeenCalled()
    expect((await resolveOrganizationReadScope(session(), projects(null, Error('down')), USER)).projectIds).toEqual([])
    expect((await resolveOrganizationReadScope(session(), projects([{ id: PROJECT }, { id: null }]), USER)).projectIds).toEqual([])
  })
  it('rejects a mismatched authenticated user membership', async () => {
    const db = projects()
    expect((await resolveOrganizationReadScope(session(OWNER), db, USER)).projectIds).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
  })
})
