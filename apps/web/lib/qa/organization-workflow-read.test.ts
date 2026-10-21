import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const route = readFileSync(resolve(process.cwd(), 'app/api/organization/projects/[slug]/workflows/route.ts'), 'utf8')
const middleware = readFileSync(resolve(process.cwd(), 'middleware.ts'), 'utf8')
describe('organization workflow directory isolation contract', () => {
  it('authenticates the session and requires active scoped membership', () => {
    expect(route).toContain('session.auth.getUser()')
    expect(route).toContain('resolveOrganizationReadScope(session, admin, user.id)')
    expect(route).toContain('if (!scope.role.active')
  })
  it('binds project slug to allowed project ID and scopes workflow rows to that id', () => {
    expect(route).toContain(".eq('slug', params.slug).in('id', [...scope.projectIds])")
    expect(route).toContain(".eq('project_id', project.id)")
  })
  it('does not expose workflow steps, credentials, secret data or any writes', () => {
    expect(route).toContain("select('id, name, description, trigger, active, created_at')")
    expect(route).toContain('description: showDescription ? row.description : null')
    expect(route).toContain("'Cache-Control': 'private, no-store'")
    expect(route).not.toMatch(/export async function (PATCH|PUT|DELETE)/)
    expect(route).toContain('active: false')
    expect(route).toContain("trigger: 'manual'")
    expect(route).not.toContain('service_role')
  })
  it('middleware allows exact read path and refuses write verbs', () => {
    expect(middleware).toContain("workflows$/.test(pathname)")
    expect(middleware).toContain("request.method === 'POST'")
    expect(middleware).toContain("request.method === 'PATCH'")
    expect(middleware).toContain("status: 403")
  })
})
