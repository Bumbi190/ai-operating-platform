import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const page = readFileSync(resolve(process.cwd(), 'app/organization/projects/[slug]/page.tsx'), 'utf8')
const editor = readFileSync(resolve(process.cwd(), 'app/organization/projects/HandlarborsenCollaboratorWorkflows.tsx'), 'utf8')

describe('same Command Center with narrowly delegated Handlarbörsen actions', () => {
  it('preserves the EXACT existing Owner Command Center UI in observer mode', () => {
    expect(page).toContain('<ProjectCommandCenter model={model} overview={overview} />')
    expect(page).toContain('<fieldset disabled')
  })
  it('gates extra actions by active collaborator membership and canonical project', () => {
    expect(page).toContain('resolveOrganizationRole(')
    expect(page).toContain("canCollaborateOnProject(")
    expect(page).toContain("'operate_workflow'")
    expect(page).toContain('mayWorkWithHandlarborsen &&')
    expect(page).toContain('<HandlarborsenCollaboratorWorkflows />')
  })
  it('never opens Owner routes or arbitrary project paths from its UI', () => {
    expect(editor).toContain("'/api/organization/projects/handlarborsen/workflows'")
    expect(editor).not.toContain('/api/projects/')
    expect(editor).not.toContain("method: 'DELETE'")
    expect(editor).not.toContain("method: 'PUT'")
  })
  it('labels manual drafts as inactive and never offers activation/execution', () => {
    expect(editor).toContain('Skapa inaktivt utkast')
    expect(editor).toContain("method: 'POST'")
    expect(editor).toContain("method: 'PATCH'")
    expect(editor).not.toMatch(/<button[^>]*>Kör/)
  })
})
