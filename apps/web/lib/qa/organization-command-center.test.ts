import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sanitizeOrganizationCommandCenter } from '@/lib/os/organization-command-center-reader'
import type { ProjectCommandCenterModel } from '@/lib/os/project-command-center'

const page = readFileSync(resolve(process.cwd(), 'app/organization/projects/[slug]/page.tsx'), 'utf8')
const component = readFileSync(resolve(process.cwd(), 'components/platform/vnext/ProjectCommandCenter.tsx'), 'utf8')
const reader = readFileSync(resolve(process.cwd(), 'lib/os/organization-command-center-reader.ts'), 'utf8')
const section = <T,>(items: T[]) => ({ state: 'ok' as const, items, total: items.length, truncated: false })

function model(): ProjectCommandCenterModel {
  const run = { id: 'run', status: 'running', createdAt: null, startedAt: null, finishedAt: null, href: '/projects/foo/runs/run' }
  return {
    project: { id: 'project', name: 'Project', slug: 'foo', color: '#336699', href: '/projects/foo', executionPaused: false, pausedAt: null, pausedReason: null },
    links: { build: '/projects/foo/build', runs: '/projects/foo/runs', workflows: '/projects/foo/workflows', agents: '/projects/foo/agents', outputs: '/projects/foo/outputs', newAgent: '/projects/foo/agents/new', newWorkflow: '/projects/foo/workflows/new', media: '/projects/foo/media', approvals: '/approvals', marketplace: '/projects/foo/marketplace' },
    activity: { activeRuns: 1, lastRun: { state: 'ok', at: null } },
    workflows: section([{
      id: 'wf', name: 'Workflow', description: 'private detail', trigger: null, cronExpr: null, active: true, href: '/projects/foo/workflows/wf',
      latestRun: run, activeRuns: [run],
      steps: [{ position: 1, order: 1, name: 'Check', outputKey: 'sensitive-output-key', agent: { kind: 'resolved', id: 'a', name: 'Agent', model: null, href: '/projects/foo/agents/a' } }],
    }]),
    instances: section([]),
    runs: section([{ ...run, workflowName: null, workflowHref: '/projects/foo/workflows/wf', actionKind: null }]),
    approvals: section([{ id: 'a', outputKey: 'key', kind: null, createdAt: null, workflowName: null, runHref: '/projects/foo/runs/run' }]),
    agents: section([{ id: 'agent', name: 'Agent', model: null, href: '/projects/foo/agents/agent' }]),
    outputs: section([{ id: 'file', name: 'Media', type: null, createdAt: null, runHref: '/projects/foo/runs/run', fileUrl: 'https://sensitive.example/token' }]),
  }
}

describe('shared Owner/Collaborator Command Center', () => {
  it('renders the exact shared component with an explicit read-only mode', () => {
    expect(page).toContain('loadOrganizationProjectCommandCenter(params.slug)')
    expect(page).toContain('<ProjectCommandCenter model={model} overview={overview} />')
    expect(page).toContain('<fieldset disabled')
    expect(page).toContain('isHandlarborsenProject(model.project)')
    expect(page).toContain('loadHandlarborsenMarketplaceReport(model.project')
    expect(page).toContain('reportHref={null}')
    expect(component).toContain('ProjectPauseToggle')
    expect(page).not.toContain('loadProjectCommandCenter(')
  })
  it('authorizes the session and project before a service-role scoped read', () => {
    expect(reader).toContain('resolveOrganizationReadScope(session, admin, user.id)')
    expect(reader).toContain("if (!scope.role.active || scope.projectIds.length === 0) return null")
    expect(reader).toContain(".eq('slug', slug).in('id', [...scope.projectIds])")
    expect(reader).toContain('assembleProjectCommandCenter({')
    expect(reader).toContain(".eq('project_id', project.id)")
  })
  it('removes every privileged navigation or downloadable URL in collaborator model', () => {
    const old = model()
    const view = sanitizeOrganizationCommandCenter(old)
    expect(view.project.href).toBeNull()
    expect(view.links.build).toBeNull()
    expect(Object.values(view.links).every(value => value === null)).toBe(true)
    expect(view.workflows.items[0].href).toBeNull()
    expect(view.workflows.items[0].description).toBeNull()
    expect(view.workflows.items[0].steps?.[0].outputKey).toBeNull()
    const agent = view.workflows.items[0].steps?.[0].agent
    if (agent?.kind === 'resolved') expect(agent.href).toBeNull()
    expect(view.workflows.items[0].latestRun?.href).toBeNull()
    expect(view.workflows.items[0].activeRuns?.[0]?.href).toBeNull()
    expect(view.runs.items[0].href).toBeNull()
    expect(view.runs.items[0].workflowHref).toBeNull()
    expect(view.agents.items[0].href).toBeNull()
    expect(view.approvals.items[0].runHref).toBeNull()
    expect(view.outputs.items[0].fileUrl).toBeNull()
    expect(view.outputs.items[0].runHref).toBeNull()
    expect(old.outputs.items[0].fileUrl).toContain('sensitive')
  })
  it('does not expose raw workflow step JSON to the common renderer', () => {
    expect(reader).toContain('scrubWorkflowSteps')
    expect(reader).toContain("agent_id: typeof step.agent_id === 'string'")
    expect(reader).not.toContain('step.input_props')
  })
})
