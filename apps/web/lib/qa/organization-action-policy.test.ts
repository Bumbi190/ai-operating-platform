import { describe, expect, it } from 'vitest'
import { authorizeOrganizationAction as check } from '@/lib/auth/organization-action-policy'
const collaborator = { active: true as const, role: 'collaborator' as const }
const owner = { active: true as const, role: 'owner' as const }
const denied = { active: false as const, role: null }
describe('non-executing organization authorization', () => {
  it('lets members read and submit proposals, nothing else', () => {
    expect(check(collaborator, 'read').allowed).toBe(true)
    expect(check(collaborator, 'propose').allowed).toBe(true)
    for (const action of ['approve','execute','invite','deploy','billing','credentials'] as const)
      expect(check(collaborator, action).allowed).toBe(false)
  })
  it('separates owner approval from execution and prevents self approval', () => {
    expect(check(owner, 'approve', 'oscar', 'owner').allowed).toBe(true)
    expect(check(owner, 'approve', 'owner', 'owner').allowed).toBe(false)
    expect(check(owner, 'approve').allowed).toBe(false)
    expect(check(owner, 'execute').allowed).toBe(false)
    expect(check(owner, 'deploy').allowed).toBe(false)
  })
  it('revoked members get no read access or proposal capability', () => {
    expect(check(denied, 'read').allowed).toBe(false)
    expect(check(denied, 'propose').allowed).toBe(false)
  })
})
