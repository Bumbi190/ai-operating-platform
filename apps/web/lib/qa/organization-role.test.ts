import { describe, expect, it, vi } from 'vitest'
import { resolveOrganizationRole, mayViewOrganizationProjects } from '@/lib/auth/organization-role'

const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
function db(row: unknown, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { from, select, eq }
}
describe('Organization role reader', () => {
  it('accepts a verified active collaborator, scoped to the authenticated ID', async () => {
    const client = db({ user_id: ID, role: 'collaborator', revoked_at: null })
    const result = await resolveOrganizationRole(client, ID)
    expect(result).toEqual({ active: true, role: 'collaborator' })
    expect(mayViewOrganizationProjects(result)).toBe(true)
    expect(client.eq).toHaveBeenCalledWith('user_id', ID)
  })
  it('accepts an active owner', async () => {
    expect(await resolveOrganizationRole(db({ user_id: ID, role: 'owner', revoked_at: null }), ID))
      .toEqual({ active: true, role: 'owner' })
  })
  it('denies spoofing, missing, revoked, unknown role and DB failures', async () => {
    const invalid = [
      db({ user_id: 'another', role: 'owner', revoked_at: null }),
      db({ user_id: ID, role: 'collaborator', revoked_at: '2026-10-13T00:00:00Z' }),
      db({ user_id: ID, role: 'admin', revoked_at: null }),
      db(null),
      db({ user_id: ID, role: 'owner', revoked_at: null }, new Error('database unavailable')),
      { from() { throw Error('unavailable') } },
    ]
    for (const reader of invalid) {
      const state = await resolveOrganizationRole(reader, ID)
      expect(state).toEqual({ active: false, role: null })
      expect(mayViewOrganizationProjects(state)).toBe(false)
    }
  })
  it('denies anonymous without querying membership table', async () => {
    const reader = db({ user_id: ID, role: 'owner', revoked_at: null })
    expect(await resolveOrganizationRole(reader, null)).toEqual({ active: false, role: null })
    expect(reader.from).not.toHaveBeenCalled()
  })
})
