import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const page = readFileSync(resolve(process.cwd(), 'app/organization/page.tsx'), 'utf8')
describe('collaborator project gallery boundary', () => {
  it('reuses the exact Owner portfolio gallery, not a second design', () => {
    expect(page).toContain("import { ProjectCoverGallery }")
    expect(page).toContain('<ProjectCoverGallery cards={cards} projectsAvailable={!error} />')
  })
  it('derives data from organization read scope, with no privileged loader', () => {
    expect(page).toContain('resolveOrganizationReadScope(session, db, user.id)')
    expect(page).toContain(".in('id', [...scope.projectIds])")
    expect(page).not.toContain('loadAtlasHomeViewModel')
    expect(page).not.toContain('getAllowedProjectIds')
  })
  it('links only to organization-specific read-only project details', () => {
    expect(page).toContain('/organization/projects/')
    expect(page).toContain('composeAtlasRailCards(')
    expect(page).toMatch(/\[\s*\],?\s*\)/)
    expect(page).not.toContain('href: `/projects/')
  })
})
