import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const page = readFileSync(resolve(process.cwd(), 'app/organization/projects/[slug]/page.tsx'), 'utf8')
const center = readFileSync(resolve(process.cwd(), 'app/organization/projects/CollaboratorProjectCommandCenter.tsx'), 'utf8')

describe('collaborator command center is read-only and scope-bound', () => {
  it('uses Owner command center visual CSS rather than a second inline design', () => {
    expect(center).toContain('ProjectCommandCenter.module.css')
    expect(page).toContain('CollaboratorProjectCommandCenter')
  })
  it('resolves the project within the active organization allowlist', () => {
    expect(page).toContain('resolveOrganizationReadScope(session, db, user.id)')
    expect(page).toContain(".in('id', [...scope.projectIds])")
    expect(page).toContain(".eq('project_id', project.id)")
    expect(page).toContain('notFound()')
  })
  it('has no privileged actions or owner project navigation', () => {
    expect(center).not.toContain('ProjectPauseToggle')
    expect(center).not.toContain('server action')
    expect(center).not.toContain('/projects/')
    expect(center).toContain('href="/organization"')
    expect(center).not.toMatch(/<button\b/)
    expect(page).not.toContain('loadProjectCommandCenter(')
  })
  it('uses honest errors instead of showing zero when reads fail', () => {
    expect(page).toContain('available:')
    expect(center).toContain('Ekonomidata kunde inte läsas')
    expect(center).toContain('Uppgifter kunde inte läsas')
    expect(center).toContain('Körningar kunde inte läsas')
  })
})
