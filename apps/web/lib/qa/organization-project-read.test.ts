import { describe, expect, it, vi } from 'vitest'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
function session(role = 'collaborator', revoked_at: string | null = null) {
  return { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { user_id: USER, role, revoked_at }, error: null,
  }) }) }) })) }
}
function projects(rows: unknown = [{ id: PROJECT }], error: unknown = null) {
  return { from: vi.fn(() => ({ select: async () => ({ data: rows, error }) })) }
}
describe('organization read scope is not an action authority', () => {
  it('returns all project IDs only to active organization members', async () => {
    const db = projects()
    expect(await resolveOrganizationReadScope(session(), db, USER)).toEqual({
      role: { active: true, role: 'collaborator' }, projectIds: [PROJECT],
    })
    expect(db.from).toHaveBeenCalledWith('projects')
  })
  it('denies revoked, invalid and absent membership without listing projects', async () => {
    for (const member of [session('collaborator', '2026-10-13'), session('admin')]) {
      const db = projects()
      expect((await resolveOrganizationReadScope(member, db, USER)).projectIds).toEqual([])
      expect(db.from).not.toHaveBeenCalled()
    }
    const db = projects()
    expect((await resolveOrganizationReadScope(session(), db, null)).projectIds).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
  })
  it('fails closed on database errors and malformed data', async () => {
    expect((await resolveOrganizationReadScope(session(), projects(null, Error('down')), USER)).projectIds).toEqual([])
    expect((await resolveOrganizationReadScope(session(), projects([{ id: PROJECT }, { id: null }]), USER)).projectIds).toEqual([])
  })
})
