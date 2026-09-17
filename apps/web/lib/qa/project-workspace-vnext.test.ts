/**
 * Project Workspace B1 — observation-only vNext surfaces.
 *
 * These tests lock the two risky boundaries: project isolation must happen
 * before any dependent read, and the vNext presentation must not silently
 * replace the legacy editors or change their mutations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ResolvedProject } from '@/lib/project/get-project'
import {
  loadRunDetail,
  loadWorkflowDetail,
  loadWorkspaceAgents,
  loadWorkspaceOutputs,
  loadWorkspaceRuns,
} from '@/lib/os/project-workspace'

type Op = [string, string, unknown]
interface Rec { client: 'rls' | 'admin'; table: string; select: string; ops: Op[] }

const SEEN: Rec[] = []
let RESPOND: (rec: Rec) => { data: unknown; error: unknown; count?: number | null } = () => ({ data: [], error: null, count: 0 })

function fakeDb(client: Rec['client']) {
  return {
    from(table: string) {
      const rec: Rec = { client, table, select: '', ops: [] }
      SEEN.push(rec)
      const builder: any = {
        select(value: string) { rec.select = value; return builder },
        eq(column: string, value: unknown) { rec.ops.push(['eq', column, value]); return builder },
        in(column: string, value: unknown) { rec.ops.push(['in', column, value]); return builder },
        gte(column: string, value: unknown) { rec.ops.push(['gte', column, value]); return builder },
        order(column: string) { rec.ops.push(['order', column, null]); return builder },
        limit(value: number) { rec.ops.push(['limit', String(value), value]); return builder },
        maybeSingle() { rec.ops.push(['maybeSingle', '', null]); return Promise.resolve(RESPOND(rec)) },
        then(ok: (value: unknown) => unknown, fail?: (error: unknown) => unknown) {
          return Promise.resolve().then(() => RESPOND(rec)).then(ok, fail)
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeDb('rls') }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb('admin') }))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(WEB_ROOT, path), 'utf8')
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const legacySuffix = (source: string, marker: string) => source.slice(source.lastIndexOf(marker))
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const LOADER = read('lib/os/project-workspace.ts')
const VIEW = read('components/platform/vnext/project-workspace/ProjectWorkspaceViews.tsx')
const OUTPUT_VIEW = read('components/platform/vnext/project-workspace/OutputRunCard.tsx')
const CSS = read('components/platform/vnext/project-workspace/ProjectWorkspace.module.css')
const AGENTS_PAGE = read('app/(platform)/projects/[slug]/agents/page.tsx')
const WORKFLOWS_PAGE = read('app/(platform)/projects/[slug]/workflows/page.tsx')
const WORKFLOW_PAGE = read('app/(platform)/projects/[slug]/workflows/[id]/page.tsx')
const WORKFLOW_EDIT_PAGE = read('app/(platform)/projects/[slug]/workflows/[id]/edit/page.tsx')
const WORKFLOW_EDITOR = read('app/(platform)/projects/[slug]/workflows/[id]/EditWorkflowClient.tsx')
const RUNS_PAGE = read('app/(platform)/projects/[slug]/runs/page.tsx')
const RUN_PAGE = read('app/(platform)/projects/[slug]/runs/[id]/page.tsx')
const OUTPUTS_PAGE = read('app/(platform)/projects/[slug]/outputs/page.tsx')
const LEGACY_OUTPUT_CARD = read('app/(platform)/projects/[slug]/outputs/OutputCard.tsx')

const PROJECT: ResolvedProject = {
  id: 'project-a', name: 'Projekt A', slug: 'projekt-a', color: '#22d3ee', settings: {} as never,
  executionPaused: false, pausedAt: null, pausedReason: null,
}

beforeEach(() => {
  SEEN.length = 0
  RESPOND = () => ({ data: [], error: null, count: 0 })
})

describe('project workspace B1 · project isolation', () => {
  it('has no project resolver, default project or first-row fallback inside the loaders', () => {
    expect(codeOnly(LOADER)).not.toContain('getProjectBySlug')
    expect(LOADER).not.toMatch(/\.limit\(1\)/)
    expect(LOADER).not.toMatch(/defaultProject|firstProject|fallbackProject/)
  })

  it('names the resolved project on every collection boundary, including the admin output read', async () => {
    await loadWorkspaceAgents(PROJECT)
    expect(SEEN[0]).toMatchObject({ client: 'rls', table: 'agents' })
    expect(SEEN[0].ops).toContainEqual(['eq', 'project_id', PROJECT.id])

    SEEN.length = 0
    await loadWorkspaceOutputs(PROJECT, 'all', new Date('2026-09-17T10:00:00Z'))
    expect(SEEN[0]).toMatchObject({ client: 'admin', table: 'runs' })
    expect(SEEN[0].ops).toContainEqual(['eq', 'project_id', PROJECT.id])
    expect(SEEN[0].ops).toContainEqual(['eq', 'status', 'done'])
  })

  it('does not read workflow children when the scoped parent is absent', async () => {
    RESPOND = () => ({ data: null, error: null })
    await expect(loadWorkflowDetail('foreign-workflow', PROJECT)).resolves.toEqual({ kind: 'not_found' })
    expect(SEEN.map((rec) => rec.table)).toEqual(['workflows'])
    expect(SEEN[0].ops).toContainEqual(['eq', 'project_id', PROJECT.id])
  })

  it('does not read run logs when the scoped run parent is absent', async () => {
    RESPOND = () => ({ data: null, error: null })
    await expect(loadRunDetail('foreign-run', PROJECT)).resolves.toEqual({ kind: 'not_found' })
    expect(SEEN.map((rec) => rec.table)).toEqual(['runs'])
    expect(SEEN[0].ops).toContainEqual(['eq', 'project_id', PROJECT.id])
  })
})

describe('project workspace B1 · truthful read states', () => {
  it('keeps a successful empty read distinct from a failed read', async () => {
    RESPOND = () => ({ data: [], error: null, count: 0 })
    const empty = await loadWorkspaceAgents(PROJECT)
    expect(empty).toMatchObject({ state: 'ready', items: [], count: 0 })

    RESPOND = () => ({ data: null, error: { message: 'synthetic read error' }, count: null })
    const failed = await loadWorkspaceAgents(PROJECT)
    expect(failed).toMatchObject({ state: 'error', items: [], count: null })
  })

  it('keeps a missing run status unknown instead of calling it pending', async () => {
    RESPOND = () => ({ data: [{
      id: 'run-1', status: null, workflow_id: null, workflows: null,
      created_at: '2026-09-17T10:00:00Z', started_at: null, finished_at: null,
    }], error: null, count: 1 })
    const model = await loadWorkspaceRuns(PROJECT)
    expect(model.items[0].status).toBeNull()
    expect(VIEW).toContain('Status okänd')
    expect(VIEW).not.toContain("run.status ?? 'pending'")
  })

  it('labels outputs as completed runs.context, not canonical output rows', () => {
    expect(VIEW).toContain('Detta är inte en läsning av outputs-tabellen')
    expect(OUTPUT_VIEW).toContain('runs.context')
    expect(LOADER).toContain("db.from('runs')")
    expect(LOADER).not.toContain("db.from('outputs')")
  })

  it('does not invent tools, permissions, workload or agent capabilities', () => {
    for (const forbidden of ['tool registry', 'permission score', 'workload', 'capacity score', 'success rate']) {
      expect((VIEW + LOADER).toLowerCase()).not.toContain(forbidden)
    }
    expect(VIEW).toContain('inga verktyg, behörigheter eller arbetsbelastningar antas')
  })
})

describe('project workspace B1 · generation and legacy rollback', () => {
  it.each([
    ['agents', AGENTS_PAGE, 'AgentsLegacy', 'loadWorkspaceAgents'],
    ['workflows', WORKFLOWS_PAGE, 'WorkflowsLegacy', 'loadWorkspaceWorkflows'],
    ['runs', RUNS_PAGE, 'RunsLegacy', 'loadWorkspaceRuns'],
    ['outputs', OUTPUTS_PAGE, 'OutputsLegacy', 'loadWorkspaceOutputs'],
    ['workflow detail', WORKFLOW_PAGE, 'WorkflowLegacy', 'loadWorkflowDetail'],
    ['run detail', RUN_PAGE, 'RunDetailLegacy', 'loadRunDetail'],
  ])('%s selects legacy before its vNext data loader', (_name, source, legacy, loader) => {
    expect(source.indexOf(`return <${legacy}`)).toBeGreaterThan(-1)
    expect(source.indexOf(`return <${legacy}`)).toBeLessThan(source.indexOf(`${loader}(`))
  })

  it('keeps the six legacy route bodies byte-for-byte from the reviewed base', () => {
    expect(sha256(legacySuffix(AGENTS_PAGE, '  const project = await getProjectBySlug(params.slug)\n'))).toBe('f468416dbe37fedb0c647068324e5b014c4f13069837277af8779b17cd25955b')
    expect(sha256(legacySuffix(WORKFLOWS_PAGE, '  const project = await getProjectBySlug(params.slug)\n'))).toBe('aaced9a8379ba36bd27cd90840f8e07f538e4646d395cd9202ba0d89354eefd6')
    expect(sha256(legacySuffix(RUNS_PAGE, '  const project = await getProjectBySlug(params.slug)\n'))).toBe('beb13694b33be04a80ba0e5a99a85338a81a8b70f7953a5258c125d95e725afb')
    expect(sha256(legacySuffix(OUTPUTS_PAGE, '  const { slug } = await params\n'))).toBe('509eab9f3d7bf965b216a880488b95561e4815f73f0dc4e95d327a9be2303087')
    expect(sha256(legacySuffix(WORKFLOW_PAGE, '  const supabase = await createClient()\n'))).toBe('8c8001ccbc2bc45802465fe9d0baac9c7b37fcd39a77ec56b4e6fcf81c27b612')
    expect(sha256(legacySuffix(RUN_PAGE, '  // Scope the run lookup to the project in the URL so a run from another\n'))).toBe('484071bdebb551b1de2f70fce663600713897c33b0cbf6fbd20df3a5c9dc2aa6')
  })

  it('moves the exact workflow editor behind /edit without changing its implementation', () => {
    expect(sha256(WORKFLOW_EDITOR)).toBe('ddb7ff59eb68db27bba50520f1cde641f058a237b975f6682b997099524f1565')
    expect(sha256(legacySuffix(WORKFLOW_EDIT_PAGE, '  const supabase = await createClient()\n'))).toBe('8c8001ccbc2bc45802465fe9d0baac9c7b37fcd39a77ec56b4e6fcf81c27b612')
    expect(VIEW).toContain('Redigera workflow')
    expect(LOADER).toContain('workflows/${workflow.id}/edit')
  })

  it('keeps the previous output component and deletion endpoint untouched while stating whole-run deletion', () => {
    expect(sha256(LEGACY_OUTPUT_CARD)).toBe('5ee0174f7e349ca8bbcacd82da4be89e11cd0960cbbaa94b06af93f119d66a8f')
    expect(OUTPUT_VIEW).toContain("fetch(`/api/runs/${run.id}`, { method: 'DELETE' })")
    expect(OUTPUT_VIEW).toContain('Ta bort hela körningen och dess lagrade resultat?')
  })
})

describe('project workspace B1 · navigation and responsive contract', () => {
  it('keeps workflow inspection and source-run navigation project-scoped', () => {
    expect(LOADER).toContain('workflows/${workflow.id}')
    expect(LOADER).toContain('runs/${run.id}')
    expect(OUTPUT_VIEW).toContain('Visa källkörning')
  })

  it('provides visible focus, reduced motion, mobile stacking and 44px output actions', () => {
    expect(CSS).toContain(':focus-visible')
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(CSS).toContain('@media (max-width: 56.25rem)')
    expect(CSS).toMatch(/\.iconAction,[\s\S]*?width:\s*2\.75rem/)
    expect(CSS).toMatch(/\.runLayout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/)
  })
})
