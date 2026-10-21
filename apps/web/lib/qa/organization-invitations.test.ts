import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const source = readFileSync(resolve(process.cwd(), 'app/api/organization/invitations/route.ts'), 'utf8')
describe('Organization invitation endpoint security contract', () => {
  it('is disabled by default and requires platform operator plus owner', () => {
    expect(source).toContain("OMNIRA_COLLAB_INVITES_ENABLED !== 'true'")
    expect(source).toContain('resolvePlatformOperator()')
    expect(source).toContain("owner.role !== 'owner'")
    expect(source).toContain('owner.revoked_at !== null')
  })
  it('never accepts role/project/redirect and creates collaborator only', () => {
    expect(source).toContain("key !== 'email'")
    expect(source).toContain("role: 'collaborator'")
    expect(source).toContain('db.auth.admin.inviteUserByEmail')
    expect(source).toContain('https://app.omniraos.se/auth/callback?next=/organization')
    expect(source).not.toMatch(/export async function GET/)
  })
})
