import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const shell = readFileSync(resolve(process.cwd(), 'app/(platform)/layout.tsx'), 'utf8')
const sidebar = readFileSync(resolve(process.cwd(), 'components/platform/Sidebar.tsx'), 'utf8')
const organizationLayout = readFileSync(resolve(process.cwd(), 'app/organization/layout.tsx'), 'utf8')
const page = readFileSync(resolve(process.cwd(), 'app/organization/projects/[slug]/page.tsx'), 'utf8')

describe('Owner and Collaborator use the same Omnira visual shell', () => {
  it('reuses the real shell and the frozen Owner Command Center', () => {
    expect(organizationLayout).toContain("from '@/app/(platform)/layout'")
    expect(page).toContain("from '@/components/platform/vnext/ProjectCommandCenter'")
    expect(page).toContain('<ProjectCommandCenter model={model} overview={overview} />')
  })
  it('never passes read-only organization project IDs into execution context', () => {
    expect(shell).toContain('const ownedProjectIds = await getAllowedProjectIds(db, user.id)')
    expect(shell).toContain('const organizationScope = ownedProjectIds.length === 0')
    expect(shell).toContain('resolveOrganizationReadScope(supabase, db, user.id)')
    expect(shell).toContain('displayProjectIds')
    expect(shell).toContain('<AtlasRuntimeProvider projects={isCollaborator ? [] : projects}>')
  })
  it('keeps all collaborator service-role reads constrained to a scoped allowlist', () => {
    expect(shell).toContain(".in('id', scopedProjectIds)")
    expect(shell).toContain('const allowedProjects = new Set(displayProjectIds)')
    expect(shell).toContain('projectsRaw.filter((project: any) => allowedProjects.has(project.id))')
  })
  it('links to monitored projects, never exposes project creation controls', () => {
    expect(shell).toContain('readOnly={Boolean(isCollaborator)}')
    expect(sidebar).toContain('readOnly = false')
    expect(sidebar).toContain('readOnly ? `/organization/projects/${project.slug}` : `/projects/${project.slug}`')
    expect(sidebar).toContain('{isActive && !readOnly && (')
    expect(sidebar).toContain('{showGlobalProjectList && !readOnly && (')
  })
  it('disables embedded Owner form actions and removes owner-only brief shortcuts', () => {
    expect(page).toContain('<fieldset disabled')
    expect(page).not.toContain('ProjectPauseToggle')
    expect(page).toContain('loadOrganizationProjectCommandCenter(params.slug)')
    expect(page).not.toContain('HandlarborsenOwnerBrief')
    expect(page).toContain('reportHref={null}')
  })
})
