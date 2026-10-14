import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const source = readFileSync(resolve(process.cwd(), 'app/api/organization/projects/route.ts'), 'utf8')
describe('Organization projects GET security contract', () => {
  it('requires session user and denies inactive membership', () => {
    expect(source).toContain('session.auth.getUser()')
    expect(source).toContain('if (!scope.role.active)')
    expect(source).toContain("status: 403")
  })
  it('only selects allowlisted project IDs and three safe fields', () => {
    expect(source).toContain(".select('id, slug, name')")
    expect(source).toContain(".in('id', [...scope.projectIds])")
    expect(source).toContain("({ id, slug, name })")
    expect(source).toContain("'Cache-Control': 'private, no-store'")
    expect(source).not.toContain('CRON_SECRET')
  })
  it('never defines write routes or changes existing action scope', () => {
    expect(source).toContain('export async function GET()')
    expect(source).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/)
    expect(source).not.toContain('getAllowedProjectIds')
  })
})
