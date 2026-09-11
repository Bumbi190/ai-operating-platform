/**
 * vNext Phase 10 — Project Command Center (`/projects/[slug]`).
 *
 * Three risks carry this surface, and the suite is organised around them:
 *
 *   1. CLAIMING WHAT IS NOT STORED. A project page is where a progress bar, a
 *      health score or an agent's "tools" slide in unchallenged. None of those is
 *      modelled. Every value rendered here must trace to a column, and every
 *      absence must say so — unknown is never idle, a failed read is never empty.
 *
 *   2. WIDENING THE BOUNDARY. The page reads runs, approvals, agents and outputs.
 *      Each read must name THIS project and go through the RLS client; the one
 *      SERVER_ONLY table goes through the existing scoped reader with exactly this
 *      project. A foreign or unknown slug is one 404, with no fallback.
 *
 *   3. LOSING THE ROLLBACK. `?ui=legacy` must render the previous body exactly —
 *      pinned here by hash, not by eyeballing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { createElement, isValidElement, Suspense, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleProjectCommandCenter,
  COMMAND_CENTER_LIMITS,
  type AssembleCommandCenterInput,
  type RawRunLite,
  type Read,
} from '@/lib/os/project-command-center'
import { findVendoredDefinition } from '@/lib/workflows/definitions'
import { resolveDestination } from '@/lib/nav/registry'
import { PENDING_APPROVAL_LABEL, WAKE_LABELS } from '@/lib/os/project-command-center-shared'
import type { WorkflowInstance } from '@/lib/workflows/types'
import type { ResolvedProject } from '@/lib/project/get-project'

// The app compiles JSX with the automatic runtime; vitest's transform uses the
// classic one, so components rendered here need `React` in scope.
;(globalThis as unknown as { React: typeof React }).React = React

// ── Module doubles ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => '/projects/familje-stunden',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    const error = new Error('NEXT_NOT_FOUND') as Error & { digest?: string }
    error.digest = 'NEXT_NOT_FOUND'
    throw error
  },
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) },
}))

// The existing project-stop server action. Mocked only so the existing client
// toggle can render in a unit test; this suite asserts it is REUSED, not replaced.
vi.mock('@/app/actions/automation', () => ({
  toggleProjectExecutionPause: vi.fn(async () => ({ ok: true, changed: false, paused: false })),
}))

type Op = [string, string, unknown]
interface Rec { client: 'rls' | 'admin'; table: string; select: string; opts: unknown; ops: Op[] }
const SEEN: Rec[] = []
let RESPOND: (rec: Rec) => { data: unknown; error: unknown; count?: number | null } = () => ({ data: [], error: null, count: 0 })

function fakeDb(client: 'rls' | 'admin') {
  return {
    from(table: string) {
      const rec: Rec = { client, table, select: '', opts: undefined, ops: [] }
      SEEN.push(rec)
      const builder: any = {
        select(select: string, opts?: unknown) { rec.select = select; rec.opts = opts; return builder },
        eq(col: string, value: unknown) { rec.ops.push(['eq', col, value]); return builder },
        in(col: string, value: unknown) { rec.ops.push(['in', col, value]); return builder },
        order(col: string) { rec.ops.push(['order', col, null]); return builder },
        limit(n: number) { rec.ops.push(['limit', String(n), n]); return builder },
        single() { rec.ops.push(['single', '', null]); return Promise.resolve(RESPOND(rec)) },
        then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
          return Promise.resolve().then(() => RESPOND(rec)).then(ok, err)
        },
      }
      return builder
    },
  }
}

let ADMIN_CLIENTS = 0
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeDb('rls') }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { ADMIN_CLIENTS += 1; return fakeDb('admin') } }))

const INSTANCE_CALLS: { ids: unknown; opts: unknown }[] = []
let INSTANCE_ROWS: WorkflowInstance[] | Error = []
vi.mock('@/lib/workflows/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workflows/store')>()
  return {
    ...actual,
    listInstancesForProjects: vi.fn(async (_db: unknown, ids: unknown, opts: unknown) => {
      INSTANCE_CALLS.push({ ids, opts })
      if (INSTANCE_ROWS instanceof Error) throw INSTANCE_ROWS
      return INSTANCE_ROWS
    }),
  }
})

let COOKIE: string | null = null
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'omnira_ui' && COOKIE ? { value: COOKIE } : undefined) }),
}))

const PROJECTS_BY_SLUG = new Map<string, ResolvedProject>()
const GET_PROJECT_CALLS: string[] = []
vi.mock('@/lib/project/get-project', () => ({
  getProjectBySlug: vi.fn(async (slug: string) => {
    GET_PROJECT_CALLS.push(slug)
    return PROJECTS_BY_SLUG.get(slug) ?? null
  }),
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const LOADER = read('lib/os/project-command-center.ts')
const SHARED = read('lib/os/project-command-center-shared.ts')
const VIEW = read('components/platform/vnext/ProjectCommandCenter.tsx')
const VIEW_CSS = read('components/platform/vnext/ProjectCommandCenter.module.css')
const PAGE = read('app/(platform)/projects/[slug]/page.tsx')
const LEGACY = read('app/(platform)/projects/[slug]/ProjectLegacy.tsx')
const LAYOUT = read('app/(platform)/projects/[slug]/layout.tsx')
const GET_PROJECT = read('lib/project/get-project.ts')

const P = '4f000000-0000-4000-8000-00000000f5f5'
const SLUG = 'familje-stunden'
const PROJECT: ResolvedProject = {
  id: P, name: 'Familje-Stunden', slug: SLUG, color: '#22d3ee', settings: {} as never,
  executionPaused: false, pausedAt: null, pausedReason: null,
}
const NOW = '2026-09-11T08:00:00.000Z'
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString()

const step = (order: number, name: string, agent_id?: string) =>
  ({ order, name, agent_id, input_template: 'x', output_key: `out_${order}` })

const WF = {
  one: { id: 'w-one', name: 'Ett steg', description: null, steps: [step(1, 'Enda steget', 'a-nova')], trigger: 'manual', cron_expr: null, active: true, created_at: ago(9000) },
  two: { id: 'w-two', name: 'Två steg', description: 'Brief och granskning', steps: [step(2, 'Andra', 'a-lina'), step(1, 'Första', 'a-nova')], trigger: 'manual', cron_expr: null, active: true, created_at: ago(8000) },
  ten: { id: 'w-ten', name: 'Månadspaket', description: null, steps: Array.from({ length: 10 }, (_, i) => step(i + 1, `Steg ${i + 1}`, i === 3 ? 'a-ghost' : i === 6 ? undefined : 'a-nova')), trigger: 'manual', cron_expr: null, active: true, created_at: ago(7000) },
  empty: { id: 'w-empty', name: 'Tomt workflow', description: null, steps: [], trigger: 'cron', cron_expr: '0 6 * * *', active: false, created_at: ago(6000) },
  broken: { id: 'w-broken', name: 'Trasiga steg', description: null, steps: 'not-a-list', trigger: 'manual', cron_expr: null, active: null, created_at: ago(5000) },
}

const FS_DEF = findVendoredDefinition('familje-stunden.monthly-release', 1)!
const instance = (over: Partial<WorkflowInstance>): WorkflowInstance => ({
  id: 'i-1', def_id: 'd-1', def_key: 'familje-stunden.monthly-release', def_version: 1, def_hash: FS_DEF.def_hash,
  project_id: P, instance_key: '2099-01', current_state: 'content_generation', status: 'active',
  wake_at: null, last_tick_at: ago(30), last_tick_outcome: 'blocked: required check failed', created_at: ago(9000),
  closed_at: null, ...over,
} as WorkflowInstance)

const ok = <T,>(rows: T[], count: number | null = rows.length): Read<T> => ({ ok: true, rows, count })
const fail: Read<never> = { ok: false }

function input(over: Partial<AssembleCommandCenterInput> = {}): AssembleCommandCenterInput {
  const latest = new Map<string, Read<RawRunLite>>([
    ['w-one', ok([{ id: 'r-one', status: 'done', created_at: ago(60), started_at: ago(61), finished_at: ago(60) }])],
    ['w-two', ok([])],
    ['w-ten', ok([{ id: 'r-ten', status: 'failed', created_at: ago(120), started_at: ago(121), finished_at: ago(119) }])],
    // w-empty deliberately missing → that lookup did not succeed
    ['w-broken', ok([])],
  ])
  return {
    project: PROJECT,
    now: NOW,
    workflows: ok([WF.one, WF.two, WF.ten, WF.empty, WF.broken]),
    latestRunByWorkflow: latest,
    activeRuns: ok([{ id: 'r-live', status: 'running', workflow_id: 'w-two', created_at: ago(2), started_at: ago(2), finished_at: null }], 1),
    recentRuns: ok([
      { id: 'r-live', status: 'running', workflow_id: 'w-two', workflow_instance_id: null, action_kind: null, created_at: ago(2), started_at: ago(2), finished_at: null, workflows: { name: 'Två steg' } },
      { id: 'r-weird', status: 'weird', workflow_id: 'w-one', workflow_instance_id: null, action_kind: null, created_at: ago(30), started_at: null, finished_at: null, workflows: [{ name: 'Ett steg' }] },
      { id: 'r-action', status: 'done', workflow_id: null, workflow_instance_id: 'i-1', action_kind: 'observe_release_gate', created_at: ago(40), started_at: ago(40), finished_at: ago(39), workflows: null },
    ]),
    approvals: ok([
      { id: 'ap-1', output_key: 'story_draft', kind: 'content', created_at: ago(15), run_id: 'r-weird', runs: { project_id: P, workflows: { name: 'Ett steg' } } },
    ], 1),
    agents: ok(Array.from({ length: 12 }, (_, i) => ({ id: `a-${i}`, name: `Agent ${i}`, model: i === 0 ? null : 'claude-sonnet-5' })), 33),
    stepAgents: ok([
      { id: 'a-nova', name: 'Nova', model: 'claude-sonnet-5' },
      { id: 'a-lina', name: 'Lina', model: null },
    ]),
    outputs: ok([
      { id: 'o-1', run_id: 'r-one', name: 'Saga oktober', type: 'pdf', file_url: 'https://cdn.example.test/saga.pdf', created_at: ago(50) },
      { id: 'o-2', run_id: null, name: null, type: 'text', file_url: 'javascript:alert(1)', created_at: ago(55) },
    ], 2),
    instances: ok([
      instance({}),
      instance({ id: 'i-2', def_key: 'omnira.unknown-def', instance_key: 'x-1' }),
      instance({ id: 'i-3', instance_key: '2099-02', def_hash: 'not-the-vendored-hash' }),
      instance({ id: 'i-4', instance_key: '2099-03', current_state: 'no_such_state' }),
    ], null),
    definitionFor: findVendoredDefinition,
    ...over,
  }
}

let ProjectCommandCenter: (props: { model: ReturnType<typeof assembleProjectCommandCenter> }) => ReactElement
let ProjectCommandCenterLoading: (props: { name: string; color: string }) => ReactElement

async function view() {
  if (!ProjectCommandCenter) {
    const mod = await import('@/components/platform/vnext/ProjectCommandCenter')
    ProjectCommandCenter = mod.ProjectCommandCenter as never
    ProjectCommandCenterLoading = mod.ProjectCommandCenterLoading as never
  }
}

async function render(over: Partial<AssembleCommandCenterInput> = {}) {
  await view()
  return renderToStaticMarkup(createElement(ProjectCommandCenter, { model: assembleProjectCommandCenter(input(over)) }))
}

const stepItemsOf = (html: string, workflowName: string): number => {
  const start = html.indexOf(`>${workflowName}<`)
  const after = html.slice(start)
  const list = after.match(/<ol[^>]*aria-label="(\d+) steg"/)
  return list ? Number(list[1]) : 0
}

const PROJECT_HREF = resolveDestination('project_home', { project: SLUG })!.href

beforeEach(() => {
  SEEN.length = 0
  INSTANCE_CALLS.length = 0
  GET_PROJECT_CALLS.length = 0
  ADMIN_CLIENTS = 0
  INSTANCE_ROWS = []
  COOKIE = null
  PROJECTS_BY_SLUG.clear()
  RESPOND = () => ({ data: [], error: null, count: 0 })
})

// ═════════════════════════════════════════════════════════════════════════════
// 1 · Canonical project data
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · renders from canonical project data', () => {
  it('names the project the route resolved, with its slug and stored stop state', async () => {
    const html = await render()
    expect(html).toContain('>Familje-Stunden</h1>')
    expect(html).toContain(`>${SLUG}<`)
    expect(html).toContain('Projektstopp')
    expect(html).toContain('Inte aktivt')
  })

  it('reports an active project stop with its stored reason and time', async () => {
    const html = await render({ project: { ...PROJECT, executionPaused: true, pausedAt: ago(90), pausedReason: 'Incident i releasen' } })
    expect(html).toContain('Aktivt')
    expect(html).toContain('Incident i releasen')
    expect(html).toMatch(/Aktivt · <time dateTime="[^"]+"[^>]*>[^<]*sedan<\/time>/)
    expect(html).not.toContain('sedan <time')
  })

  it('counts active runs exactly, and says "Okänt" — not 0 — when that read fails', async () => {
    expect(await render()).toMatch(/Aktiva körningar<\/dt><dd[^>]*>1<\/dd>/)
    const unknown = await render({ activeRuns: fail })
    expect(unknown).toMatch(/Aktiva körningar<\/dt><dd[^>]*>Okänt<\/dd>/)
    expect(unknown).not.toMatch(/Aktiva körningar<\/dt><dd[^>]*>0<\/dd>/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2–5 · Workflow renderer
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · workflow steps come from workflows.steps[]', () => {
  it('renders exactly as many steps as each workflow declares — no fixed count', async () => {
    const html = await render()
    expect(stepItemsOf(html, 'Ett steg')).toBe(1)
    expect(stepItemsOf(html, 'Två steg')).toBe(2)
    expect(stepItemsOf(html, 'Månadspaket')).toBe(10)
  })

  it('a single-step workflow renders its one step', async () => {
    const model = assembleProjectCommandCenter(input({ workflows: ok([WF.one]) }))
    expect(model.workflows.items[0].steps).toHaveLength(1)
    expect(model.workflows.items[0].steps![0]).toMatchObject({ position: 1, name: 'Enda steget', outputKey: 'out_1' })
  })

  it('a long workflow renders every step, beyond any display guess', async () => {
    const many = { ...WF.ten, id: 'w-many', name: 'Sjutton steg', steps: Array.from({ length: 17 }, (_, i) => step(i + 1, `Del ${i + 1}`, 'a-nova')) }
    const html = await render({ workflows: ok([many]) })
    expect(stepItemsOf(html, 'Sjutton steg')).toBe(17)
    expect(html).toContain('Del 17')
  })

  it('orders steps by the stored `order`, not by array position, and renumbers nothing in storage', () => {
    const model = assembleProjectCommandCenter(input())
    const two = model.workflows.items.find(w => w.id === 'w-two')!
    expect(two.steps!.map(s => [s.position, s.order, s.name])).toEqual([[1, 1, 'Första'], [2, 2, 'Andra']])
  })

  it('an empty steps list says so; an unreadable one says it could not be read', async () => {
    const html = await render()
    expect(html).toContain('Inga steg definierade i workflowet.')
    expect(html).toContain('Workflowets steg kunde inte tolkas.')
    const model = assembleProjectCommandCenter(input())
    expect(model.workflows.items.find(w => w.id === 'w-empty')!.steps).toEqual([])
    expect(model.workflows.items.find(w => w.id === 'w-broken')!.steps).toBeNull()
  })

  it('a project with no workflows states it', async () => {
    const html = await render({ workflows: ok([], 0), latestRunByWorkflow: new Map() })
    expect(html).toContain('Projektet har inga workflows.')
  })

  it('a failed workflow read is an error, never an empty list', async () => {
    const html = await render({ workflows: fail })
    expect(html).toContain('Projektets workflows kunde inte läsas.')
    expect(html).not.toContain('Projektet har inga workflows.')
  })

  it('shows trigger and cron expression verbatim — no parser, no next-run time', async () => {
    const html = await render()
    expect(html).toContain('0 6 * * *')
    expect(html).toContain('>cron<')
    expect(codeOnly(VIEW)).not.toMatch(/nextRun|nästa körning/i)
  })

  it('puts running work first', () => {
    const model = assembleProjectCommandCenter(input())
    expect(model.workflows.items[0].id).toBe('w-two')
    expect(model.workflows.items[0].activeRuns).toHaveLength(1)
  })
})

describe('project command center · run state per workflow', () => {
  it('distinguishes running, last run, never run and unknown', async () => {
    const html = await render()
    expect(html).toContain('Kör...')                    // w-two, running (existing RunStatus label)
    expect(html).toContain('Senast: ')                  // w-one / w-ten
    expect(html).toContain('Aldrig körd')               // w-broken: read, no rows
    expect(html).toContain('Senaste körning: okänt')    // w-empty: lookup missing
  })

  it('is unknown — not idle — when active runs cannot be read', async () => {
    const html = await render({ activeRuns: fail })
    expect(html).toContain('Körningsläge: okänt')
    expect(html).not.toMatch(/\bidle\b|Inaktiv|Vilande/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 7–8 · Agent resolution
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · step agents resolve only inside the project', () => {
  it('a step naming a project agent links to Agent Detail v2 by the registry-derived route', async () => {
    const html = await render()
    expect(html).toContain(`href="${PROJECT_HREF}/agents/a-nova"`)
    expect(html).toContain('>Nova</a>')
  })

  it('an agent id this project does not contain is reported, never borrowed', async () => {
    const model = assembleProjectCommandCenter(input())
    const ghost = model.workflows.items.find(w => w.id === 'w-ten')!.steps![3]
    expect(ghost.agent).toEqual({ kind: 'unresolved', id: 'a-ghost' })
    expect(await render()).toContain('Agenten finns inte i projektet')
  })

  it('a step without agent_id is unassigned', async () => {
    const model = assembleProjectCommandCenter(input())
    expect(model.workflows.items.find(w => w.id === 'w-ten')!.steps![6].agent).toEqual({ kind: 'unassigned' })
    expect(await render()).toContain('Ingen agent tilldelad')
  })

  it('a failed agent lookup is unknown — it neither resolves nor claims absence', async () => {
    const model = assembleProjectCommandCenter(input({ stepAgents: fail }))
    const first = model.workflows.items.find(w => w.id === 'w-one')!.steps![0]
    expect(first.agent).toEqual({ kind: 'unknown', id: 'a-nova' })
    const html = await render({ stepAgents: fail })
    expect(html).toContain('Agent: okänt')
    expect(html).not.toContain('>Nova</a>')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6 · Workflow instances
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · workflow instances', () => {
  it('draws declared states from the vendored definition the instance is pinned to', async () => {
    const model = assembleProjectCommandCenter(input())
    const inst = model.instances.items[0]
    expect(inst.definition.kind).toBe('declared')
    if (inst.definition.kind !== 'declared') return
    expect(inst.definition.states.map(s => s.id)).toEqual(FS_DEF.spec.states.map(s => s.id))
    expect(inst.definition.states[inst.definition.currentIndex].id).toBe('content_generation')
    // The successor is the definition's own `next_state`, not an inference.
    expect(inst.definition.nextState).toBe(FS_DEF.spec.states.find(s => s.id === 'content_generation')!.next_state)
    const html = await render()
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('Nästa vid framgång')
    expect(html).toContain('visual_generation')
  })

  it('shows status, wake and last outcome as stored, in /planning’s wake words', async () => {
    const html = await render()
    expect(html).toContain('2099-01')
    expect(html).toContain('>active<')
    expect(html).toContain(WAKE_LABELS.not_scheduled)
    expect(html).toContain('blocked: required check failed')
  })

  it('refuses to draw states for an unvendored or hash-mismatched definition', async () => {
    const model = assembleProjectCommandCenter(input())
    expect(model.instances.items.map(i => i.definition.kind)).toEqual(['declared', 'not_vendored', 'hash_mismatch', 'declared'])
    const html = await render()
    expect(html).toContain('finns inte i den här versionen av Omnira')
    expect(html).toContain('annan hash')
  })

  it('says so when the stored state is not one the definition declares', async () => {
    const html = await render()
    expect(html).toContain('Läget “no_such_state” finns inte bland definitionens tillstånd.')
  })

  it('a project with no instances states it; a failed read is an error', async () => {
    expect(await render({ instances: ok([], null) })).toContain('Projektet har inga långlivade workflow-instanser.')
    expect(await render({ instances: fail })).toContain('Workflow-instanserna kunde inte läsas.')
  })

  it('a closed instance has no wake state, whatever its leftover wake_at says', async () => {
    const closed = instance({ id: 'i-9', instance_key: 'done-1', status: 'complete', current_state: 'complete', wake_at: ago(14000), last_tick_outcome: null })
    const model = assembleProjectCommandCenter(input({ instances: ok([closed], null) }))
    expect(model.instances.items[0].wake).toBeNull()
    const html = await render({ instances: ok([closed], null) })
    expect(html).toContain('Ej aktuell')
    expect(html).not.toContain(WAKE_LABELS.due)
  })

  it('a thrown definition registry is unreadable, not missing', () => {
    const model = assembleProjectCommandCenter(input({ definitionFor: () => { throw new Error('boom') } }))
    expect(model.instances.items[0].definition.kind).toBe('unreadable')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 9 · Runs
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · recent runs', () => {
  it('lists runs with their stored status label, timestamps and a link to the run', async () => {
    const html = await render()
    expect(html).toContain(`href="${PROJECT_HREF}/runs/r-live"`)
    expect(html).toContain('Kör...')
    expect(html).toContain('skapad')
    expect(html).toContain('<time')
  })

  it('names an action run by its stored action_kind when no workflow exists', async () => {
    expect(await render()).toContain('observe_release_gate')
  })

  it('an unknown status is shown as unknown — and what it was — never as idle', async () => {
    const html = await render()
    expect(html).toContain('Okänd status (weird)')
    expect(html).not.toMatch(/\bidle\b/i)
  })

  it('fabricates no score, progress, duration estimate or confidence', () => {
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    expect(code).not.toMatch(/progress|percent|score|confidence|estimat|duration|\beta\b/i)
    expect(codeOnly(VIEW)).not.toMatch(/%\s*[`'"]|[`'"]\s*%/)
  })

  it('a project with no runs says so; a failed read says it could not be read', async () => {
    expect(await render({ recentRuns: ok([]) })).toContain('Projektet har inga körningar ännu.')
    const failed = await render({ recentRuns: fail })
    expect(failed).toContain('Körningar kunde inte läsas.')
    expect(failed).toMatch(/Senaste körning<\/dt><dd[^>]*>Okänt<\/dd>/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 10–11 · Approvals
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · approvals', () => {
  it('lists pending approvals in the queue’s own words, with the exact count', async () => {
    const html = await render()
    expect(html).toContain(PENDING_APPROVAL_LABEL)
    expect(html).toContain('story_draft')
    expect(html).toContain(`href="${resolveDestination('approvals')!.href}"`)
  })

  it('keeps the exact pending count in the header, so review stays in view when the list stacks', async () => {
    expect(await render()).toMatch(/Väntande granskningar<\/dt><dd[^>]*><a href="#pcc-approvals"[^>]*>1<\/a>/)
    expect(await render({ approvals: ok([], 0) })).toMatch(/Väntande granskningar<\/dt><dd[^>]*>0<\/dd>/)
    expect(await render({ approvals: fail })).toMatch(/Väntande granskningar<\/dt><dd[^>]*>Okänt<\/dd>/)
  })

  it('an empty queue is a truthful empty state', async () => {
    const html = await render({ approvals: ok([], 0) })
    expect(html).toContain('Inga väntande granskningar i projektet.')
  })

  it('a failed read is an error, not an empty queue', async () => {
    const html = await render({ approvals: fail })
    expect(html).toContain('Granskningar kunde inte läsas.')
    expect(html).not.toContain('Inga väntande granskningar')
  })

  it('adds no approval action — review stays in the queue', () => {
    expect(codeOnly(VIEW)).not.toMatch(/<button|onClick|approve\(|reject\(|action=\{/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 12 · Agents
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · agents', () => {
  it('lists agents with their stored model, linked to Agent Detail v2, and says how many exist', async () => {
    const html = await render()
    expect(html).toContain(`href="${PROJECT_HREF}/agents/a-3"`)
    expect(html).toContain('claude-sonnet-5')
    expect(html).toContain('okänd modell')
    expect(html).toContain(`Visar ${COMMAND_CENTER_LIMITS.agents} av 33.`)
    expect(html).toContain(`href="${PROJECT_HREF}/agents"`)
  })

  it('empty and failed agent reads are different answers', async () => {
    expect(await render({ agents: ok([], 0) })).toContain('Projektet har inga agenter.')
    expect(await render({ agents: fail })).toContain('Agenter kunde inte läsas.')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 13 · Outputs
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · outputs only when stored', () => {
  it('lists stored output rows with their verbatim type and a link to the source run', async () => {
    const html = await render()
    expect(html).toContain('Saga oktober')
    expect(html).toContain('>pdf<')
    expect(html).toContain(`href="${PROJECT_HREF}/runs/r-one"`)
  })

  it('links a file only when the stored URL is http(s)', async () => {
    const html = await render()
    expect(html).toContain('href="https://cdn.example.test/saga.pdf"')
    expect(html).not.toContain('javascript:alert')
    const model = assembleProjectCommandCenter(input())
    expect(model.outputs.items[1].fileUrl).toBeNull()
  })

  it('never renders output content, and invents no artifact model', () => {
    expect(LOADER).toMatch(/from\('outputs'\)[\s\S]{0,80}select\('id, run_id, name, type, file_url, created_at'/)
    expect(codeOnly(LOADER)).not.toMatch(/content/)
    expect(codeOnly(LOADER)).not.toMatch(/from\('(assets|asset_provenance|media_assets|artifacts)'\)/)
  })

  it('no outputs is an empty state, not a fabricated one', async () => {
    expect(await render({ outputs: ok([], 0) })).toContain('Inga lagrade utdata i projektet.')
    expect(await render({ outputs: fail })).toContain('Utdata kunde inte läsas.')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 14 · Pause control reuse
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · the project stop is the existing control', () => {
  it('renders the existing ProjectPauseToggle with the loader’s stop state', async () => {
    expect(VIEW).toContain("import { ProjectPauseToggle } from '@/components/platform/ProjectPauseToggle'")
    expect(VIEW).toMatch(/<ProjectPauseToggle\s+projectId=\{project\.id\}\s+paused=\{project\.executionPaused\}\s+pausedReason=\{project\.pausedReason\}/)
    expect(await render()).toContain('Stoppa projektexekvering')
  })

  it('adds no pause model, server action or second stop control', () => {
    for (const src of [LOADER, SHARED, VIEW, PAGE]) {
      expect(src).not.toMatch(/'use server'/)
      expect(codeOnly(src)).not.toMatch(/toggleProjectExecutionPause|setProjectExecutionStop|execution_paused\s*[:=]/)
    }
    expect(codeOnly(VIEW).match(/<ProjectPauseToggle/g)).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 15–17 · Isolation and routing
// ═════════════════════════════════════════════════════════════════════════════

async function page(slug: string) {
  const mod = await import('@/app/(platform)/projects/[slug]/page')
  return mod.default({ params: { slug } })
}

async function expectNotFound(slug: string) {
  let caught: unknown = null
  try { await page(slug) } catch (error) { caught = error }
  expect((caught as { digest?: string } | null)?.digest).toBe('NEXT_NOT_FOUND')
}

describe('project command center · foreign and unknown slugs', () => {
  it('a foreign slug is a 404 — the RLS-bound loader returns nothing for it', async () => {
    PROJECTS_BY_SLUG.set(SLUG, PROJECT)
    await expectNotFound('someone-elses-project')
    expect(SEEN).toEqual([])
    expect(INSTANCE_CALLS).toEqual([])
  })

  it('an unknown slug is the same 404, before any read', async () => {
    await expectNotFound('no-such-project')
    expect(SEEN).toEqual([])
    expect(ADMIN_CLIENTS).toBe(0)
  })

  it('the project comes only from the RLS client by slug — no first-project or global fallback', () => {
    expect(GET_PROJECT).toMatch(/const supabase = await createClient\(\)/)
    expect(GET_PROJECT).toMatch(/\.eq\('slug', slug\)\s*\.single\(\)/)
    expect(codeOnly(LOADER)).not.toMatch(/from\('projects'\)/)
    expect(codeOnly(PAGE)).not.toMatch(/from\(|limit\(1\)|createAdminClient/)
    expect(LAYOUT).toMatch(/if \(!project\) notFound\(\)/)
    expect(PAGE).toMatch(/if \(!project\) notFound\(\)/)
  })
})

describe('project command center · every read names this project', () => {
  const seed = () => {
    RESPOND = (rec) => {
      const has = (op: string, col: string) => rec.ops.some(([o, c]) => o === op && c === col)
      if (rec.table === 'workflows') return { data: [WF.one, WF.ten], error: null, count: 2 }
      if (rec.table === 'agents' && has('in', 'id')) return { data: [{ id: 'a-nova', name: 'Nova', model: null }], error: null }
      if (rec.table === 'agents') return { data: [{ id: 'a-nova', name: 'Nova', model: null }], error: null, count: 1 }
      if (rec.table === 'runs' && has('in', 'status')) return { data: [], error: null, count: 0 }
      if (rec.table === 'runs' && has('eq', 'workflow_id')) return { data: [], error: null }
      if (rec.table === 'runs') return { data: [], error: null }
      if (rec.table === 'approvals') return { data: [], error: null, count: 0 }
      if (rec.table === 'outputs') return { data: [], error: null, count: 0 }
      return { data: null, error: { message: `unexpected table ${rec.table}` } }
    }
    INSTANCE_ROWS = [instance({})]
  }

  it('reads owner-policied tables through the RLS client, each filtered to this project', async () => {
    seed()
    const { loadProjectCommandCenter } = await import('@/lib/os/project-command-center')
    const model = await loadProjectCommandCenter(PROJECT)
    expect(model.workflows.state).toBe('ok')
    const direct = SEEN.filter(r => r.table !== 'approvals')
    expect(direct.length).toBeGreaterThanOrEqual(7)
    for (const rec of direct) {
      expect(rec.client, `${rec.table} must use the RLS client`).toBe('rls')
      expect(rec.ops, `${rec.table} must name the project`).toContainEqual(['eq', 'project_id', P])
    }
    expect(SEEN.some(r => r.table === 'projects')).toBe(false)
  })

  it('scopes approvals through the run, pending only — the rule /approvals uses', async () => {
    seed()
    const { loadProjectCommandCenter } = await import('@/lib/os/project-command-center')
    await loadProjectCommandCenter(PROJECT)
    const approvals = SEEN.filter(r => r.table === 'approvals')
    expect(approvals).toHaveLength(1)
    expect(approvals[0].client).toBe('rls')
    expect(approvals[0].select).toContain('runs!inner(project_id')
    expect(approvals[0].ops).toContainEqual(['eq', 'runs.project_id', P])
    expect(approvals[0].ops).toContainEqual(['eq', 'status', 'pending'])
  })

  it('resolves step agents only among this project’s agents', async () => {
    seed()
    const { loadProjectCommandCenter } = await import('@/lib/os/project-command-center')
    await loadProjectCommandCenter(PROJECT)
    const lookup = SEEN.find(r => r.table === 'agents' && r.ops.some(([o, c]) => o === 'in' && c === 'id'))!
    expect(lookup.ops).toContainEqual(['eq', 'project_id', P])
    // Exactly the ids the steps name — Nova, and the id no agent in this project carries.
    expect(lookup.ops.find(([o, c]) => o === 'in' && c === 'id')![2]).toEqual(['a-nova', 'a-ghost'])
  })

  it('reaches the SERVER_ONLY instance table only through the scoped reader, with exactly this project', async () => {
    seed()
    const { loadProjectCommandCenter } = await import('@/lib/os/project-command-center')
    await loadProjectCommandCenter(PROJECT)
    expect(INSTANCE_CALLS).toHaveLength(1)
    expect(INSTANCE_CALLS[0].ids).toEqual([P])
    // The service-role client is created for that reader and used for nothing else.
    expect(ADMIN_CLIENTS).toBe(1)
    expect(SEEN.filter(r => r.client === 'admin')).toEqual([])
  })

  it('a failed source becomes an error section, never an empty one', async () => {
    seed()
    const base = RESPOND
    RESPOND = (rec) => (rec.table === 'outputs' ? { data: null, error: { message: 'down' } } : base(rec))
    INSTANCE_ROWS = new Error('reader failed')
    const { loadProjectCommandCenter } = await import('@/lib/os/project-command-center')
    const model = await loadProjectCommandCenter(PROJECT)
    expect(model.outputs.state).toBe('error')
    expect(model.instances.state).toBe('error')
    expect(model.workflows.state).toBe('ok')
  })

  it('writes nothing and calls no RPC', () => {
    expect(codeOnly(LOADER)).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 18 · Legacy rollback
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · legacy rollback', () => {
  // SHA-256 of the pre-Phase-10 page body, from `const supabase = await createClient()`
  // to the end of the file, taken from origin/main 61878db. The rollback must stay
  // byte-identical; any change to legacy is a change to this hash, on purpose.
  const LEGACY_BODY_SHA256 = '368c53d6d3d08c41b62c67cd5e189509b932da39899af9913c449e2277f4fd94'

  it('keeps the legacy body byte-identical to the page it replaced', () => {
    const body = LEGACY.slice(LEGACY.indexOf('  const supabase = await createClient()'))
    expect(createHash('sha256').update(body).digest('hex')).toBe(LEGACY_BODY_SHA256)
    expect(LEGACY).toContain('<DreamStatus slug={slug} />')
    expect(LEGACY).toContain('Senaste körningar')
  })

  it('?ui=legacy renders ProjectLegacy, before the Command Center loader is reached', async () => {
    PROJECTS_BY_SLUG.set(SLUG, PROJECT)
    COOKIE = 'legacy'
    const el = await page(SLUG) as ReactElement<{ slug: string; project: ResolvedProject }>
    const { ProjectLegacy } = await import('@/app/(platform)/projects/[slug]/ProjectLegacy')
    expect(el.type).toBe(ProjectLegacy)
    expect(el.props.slug).toBe(SLUG)
    expect(el.props.project).toBe(PROJECT)
    expect(SEEN).toEqual([])
    expect(INSTANCE_CALLS).toEqual([])
    expect(PAGE.indexOf('return <ProjectLegacy')).toBeLessThan(PAGE.indexOf('loadProjectCommandCenter(project)'))
  })

  it('vNext is the default, and the Command Center streams behind a truthful loading state', async () => {
    PROJECTS_BY_SLUG.set(SLUG, PROJECT)
    COOKIE = null
    const el = await page(SLUG) as ReactElement<{ fallback: ReactElement; children: ReactElement }>
    expect(el.type).toBe(Suspense)
    expect(isValidElement(el.props.fallback)).toBe(true)
    await view()
    const fallback = renderToStaticMarkup(el.props.fallback)
    expect(fallback).toContain('role="status"')
    expect(fallback).toContain('Familje-Stunden')
    expect(fallback).not.toMatch(/>\s*\d+\s*</)
  })

  it('an explicit ?ui=vnext cookie also resolves to the Command Center', async () => {
    PROJECTS_BY_SLUG.set(SLUG, PROJECT)
    COOKIE = 'vnext'
    const el = await page(SLUG) as ReactElement
    expect(el.type).toBe(Suspense)
  })

  it('uses the single generation interpreter, never its own ?ui= parsing', () => {
    expect(PAGE).toMatch(/resolveUiGeneration\(\{\s*cookie: cookieStore\.get\(OMNIRA_UI_COOKIE\)\?\.value \?\? null,?\s*\}\)/)
    expect(codeOnly(PAGE)).not.toMatch(/searchParams|['"]ui['"]/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 19–21 · Honesty and navigation
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · navigation is the registry’s', () => {
  it('derives every project link from resolveDestination(project_home)', () => {
    const model = assembleProjectCommandCenter(input())
    expect(model.project.href).toBe(PROJECT_HREF)
    expect(model.links.runs).toBe(`${PROJECT_HREF}/runs`)
    expect(model.links.newWorkflow).toBe(`${PROJECT_HREF}/workflows/new`)
    expect(LOADER).toContain("resolveDestination('project_home', { project: project.slug })")
  })

  it('writes no route literal of its own', () => {
    expect(codeOnly(VIEW)).not.toMatch(/['"`]\/(projects|approvals|atlas)\b/)
    expect(codeOnly(LOADER)).not.toMatch(/['"`]\/(projects|approvals|atlas)\b/)
  })

  it('a slug the registry will not vouch for yields no links rather than hand-built ones', () => {
    const model = assembleProjectCommandCenter(input({ project: { ...PROJECT, slug: 'Not A Slug!' } }))
    expect(model.project.href).toBeNull()
    expect(model.links.runs).toBeNull()
    expect(model.workflows.items.every(w => w.href === null)).toBe(true)
  })

  it('adds no keyboard owner, return marker or second navigation model', () => {
    for (const src of [VIEW, PAGE, LOADER]) {
      expect(src).not.toMatch(/addEventListener\('keydown'|onKeyDown|sessionStorage|markAtlasProjectRailOpen/)
      expect(src).not.toMatch(/VNEXT_NAV|DESTINATIONS\b|ROUTE_MAP/)
    }
  })
})

describe('project command center · claims no capability Omnira does not model', () => {
  it('renders no skills, tools, permissions, agent memory or agent chat', async () => {
    const html = await render()
    expect(html).not.toMatch(/Färdighet|Verktyg|Behörighet|Minne|Chatt|skill/i)
    expect(codeOnly(LOADER)).not.toMatch(/skill_ids|system_prompt|agent_messages|memories|platform_memory/)
  })

  it('borrows no Intelligence Graph edge or health vocabulary', () => {
    const code = codeOnly(VIEW) + codeOnly(LOADER)
    expect(code).not.toMatch(/READ_MEMORY|USES_SKILL|graph-contract|health score|hälsa/i)
  })

  it('never renders unknown as idle', () => {
    const code = codeOnly(VIEW) + codeOnly(SHARED)
    expect(code).not.toMatch(/\bidle\b|'Inaktiv'|Vilande/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 22–24 · Presentation contracts
// ═════════════════════════════════════════════════════════════════════════════

describe('project command center · display scale, width and motion', () => {
  it('sizes in rem so the display-scale preference reaches it, and never zooms', () => {
    // Sizes only. `border-radius: 999px` is the pill idiom — a shape, not a size.
    const px = [...VIEW_CSS.matchAll(/^\s*(?:width|height|padding|margin|font-size|gap|min-width|max-width)[^:]*:\s*([^;]+);/gm)]
      .map(m => m[1])
      .filter(v => /\d+px/.test(v))
    expect(px).toEqual([])
    expect(VIEW_CSS).not.toMatch(/(^|[^-\w])zoom\s*:/)
    expect(VIEW_CSS).not.toMatch(/font-size:\s*[0-9.]+px/)
  })

  it('never scrolls the page sideways; the step track wraps however many steps there are', () => {
    expect(VIEW_CSS).toMatch(/\.field\s*\{[^}]*overflow-x:\s*hidden/)
    expect(VIEW_CSS).toMatch(/\.steps\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/)
    expect(VIEW_CSS).not.toMatch(/overflow-x:\s*(auto|scroll)/)
  })

  it('collapses to one column before it is narrow, keeping workflows and approvals first', () => {
    const medium = VIEW_CSS.slice(VIEW_CSS.indexOf('@media (max-width: 64rem)'))
    expect(medium).toMatch(/\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
    const narrow = VIEW_CSS.slice(VIEW_CSS.indexOf('@media (max-width: 40rem)'))
    expect(narrow).toMatch(/\.steps\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
    expect(narrow).toMatch(/\.header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
    // DOM order is the narrow-screen priority order.
    const order = ['<WorkflowsSection', '<InstancesSection', '<ApprovalsSection', '<RunsSection', '<AgentsSection', '<OutputsSection']
    const positions = order.map(tag => VIEW.indexOf(tag))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('respects the single resolved motion signal and carries no state in animation', () => {
    expect(VIEW_CSS).toMatch(/html\[data-motion='reduce'\][\s\S]{0,120}animation:\s*none/)
    expect(VIEW_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}:where\(html:not\(\[data-motion='full'\]\)\)/)
    const keyframes = [...VIEW_CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
    expect(keyframes).toEqual(['pcc-live'])
    // The live state is a word as well as a pulse.
    expect(VIEW).toContain('data-tone="live"')
  })

  it('keeps the frozen global decisions untouched: no font, white point or Atlas face', () => {
    expect(VIEW_CSS).not.toMatch(/font-family:\s*['"]?(JetBrains|SF Mono)/)
    expect(VIEW_CSS).not.toMatch(/--omnira-text-\d:\s*|:root/)
    // The prototype-runtime import ban is enforced repo-wide by atlas-vnext-visual-lock;
    // the face layer is this phase's own deferral.
    expect(VIEW + VIEW_CSS).not.toMatch(/atlas-face|AtlasFace/)
  })
})

describe('project command center · the server/client boundary holds', () => {
  it('the loader is server-only and the shared vocabulary carries no data access', () => {
    expect(LOADER.startsWith("import 'server-only'")).toBe(true)
    expect(codeOnly(SHARED)).not.toMatch(/server-only|createClient|createAdminClient|from\(/)
  })

  it('the view takes runtime values from the shared module, and only types from the loader', () => {
    expect(VIEW).toMatch(/import type \{[\s\S]*?\} from '@\/lib\/os\/project-command-center'/)
    expect(VIEW).not.toMatch(/^import \{[^}]*\} from '@\/lib\/os\/project-command-center'$/m)
    expect(VIEW).not.toMatch(/'use client'/)
  })
})
