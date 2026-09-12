/**
 * vNext Phase 13 — Aktivitet (`/agent-activity`).
 *
 * Three risks carry this surface, and the suite is organised around them:
 *
 *   1. INVENTING PROVENANCE. This is the page that most invites it: it is
 *      called the Agent Activity Center, and nothing in a run records an agent.
 *      The only agent ids in the schema live in `workflows.steps`, which is the
 *      definition as it stands NOW — attributing it to an old run would credit
 *      today's agent with yesterday's work. `runs.steps_snapshot` exists for
 *      exactly that and is populated on 4 of 1427 production rows, empty in all
 *      four. So the honest answer is "not recorded", and these tests fail if it
 *      ever becomes a guess. The same rule covers step detail (56 of 1427 runs
 *      have any log row) and statuses nobody stored under a known name.
 *
 *   2. LEAKING ACROSS THE OWNER BOUNDARY. The vNext read is RLS-bound rather
 *      than service-role, and approvals are scoped THROUGH THE RUN —
 *      `approvals.project_id` is null on 12 of 13 production rows, so gating on
 *      it would silently drop almost every review. Neither may regress to the
 *      admin client or to the approvals column.
 *
 *   3. LOSING THE ROLLBACK. `?ui=legacy` must render the previous body exactly —
 *      pinned here by hash, not by eyeballing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleActivity,
  runRecordsAgent,
  type ActivityModel,
  type ActivityRunEntry,
  type AssembleInput,
} from '@/lib/os/activity'
import {
  ACTIVITY_LIMITS,
  AGENT_ATTRIBUTION_NOTE,
  RUN_STATE_LABELS,
  UNKNOWN_RUN_STATE_LABEL,
  runStateLabel,
} from '@/lib/os/activity-shared'
import { destinationFilters, destinationLabel } from '@/lib/nav/registry'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` })
  },
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments explain which symbols this surface deliberately does NOT call, so
 *  every "must not reference" assertion reads the code without them. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

// ── Fixtures — the shapes Supabase actually returns ──────────────────────────

const PROJ_A = { name: 'Familje-Stunden', slug: 'familje-stunden', color: '#ec4899' }
const PROJ_B = { name: 'The Prompt', slug: 'ai-media-automation', color: '#6366f1' }

const runRow = (over: Record<string, unknown> = {}) => ({
  id: 'run-1',
  status: 'done',
  created_at: '2026-09-10T08:00:00.000Z',
  started_at: '2026-09-10T08:00:01.000Z',
  finished_at: '2026-09-10T08:05:00.000Z',
  error: null,
  last_error: null,
  attempts: 0,
  cancel_reason: null,
  steps_snapshot: null,
  workflows: { name: 'Månadsproduktion' },
  projects: PROJ_A,
  ...over,
})

const reviewRow = (over: Record<string, unknown> = {}) => ({
  id: 'apr-1',
  status: 'pending',
  kind: 'workflow_output',
  output_key: 'sammanfattning',
  created_at: '2026-09-11T09:00:00.000Z',
  reviewed_at: null,
  // The project arrives THROUGH the run, never from approvals.project_id.
  runs: { id: 'run-9', projects: PROJ_B },
  ...over,
})

const logRow = (over: Record<string, unknown> = {}) => ({
  run_id: 'run-1',
  content: 'Steg 2 klart — bild genererad',
  created_at: '2026-09-10T08:04:00.000Z',
  ...over,
})

const input = (over: Partial<AssembleInput> = {}): AssembleInput => ({
  runs: { ok: true, rows: [runRow()] },
  reviews: { ok: true, rows: [] },
  logs: { ok: true, rows: [] },
  projectSlug: null,
  ...over,
})

const runs = (m: ActivityModel) => m.entries.filter((e): e is ActivityRunEntry => e.kind === 'run')

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Agent attribution — the sentence this surface exists to get right
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · a run is never credited to an agent it did not record', () => {
  it('a run with no snapshot records no agent', () => {
    expect(runRecordsAgent(runRow({ steps_snapshot: null }))).toBe(false)
    expect(runs(assembleActivity(input()))[0].agentRecorded).toBe(false)
  })

  it('an EMPTY snapshot records no agent — this is production\'s actual shape', () => {
    // All four production runs that have a snapshot have `[]`.
    expect(runRecordsAgent(runRow({ steps_snapshot: [] }))).toBe(false)
  })

  it('a snapshot whose steps carry no agent id records no agent', () => {
    expect(runRecordsAgent(runRow({ steps_snapshot: [{ name: 'Steg 1', order: 1 }] }))).toBe(false)
  })

  it('only a snapshot that actually names an agent counts', () => {
    const row = runRow({ steps_snapshot: [{ name: 'Steg 1', order: 1, agent_id: 'agent-7' }] })
    expect(runRecordsAgent(row)).toBe(true)
    expect(runs(assembleActivity(input({ runs: { ok: true, rows: [row] } })))[0].agentRecorded).toBe(true)
  })

  it('a workflow that names an agent TODAY cannot attribute an old run', () => {
    // The embed carries the current definition. Reading it would be the bug.
    // Both snapshot shapes are covered on purpose: an EMPTY snapshot and NO
    // snapshot. Only the second is nullish, so only the second would let a
    // `?? workflows.steps` fallback through — which is exactly the mistake.
    for (const steps_snapshot of [[], null, undefined]) {
      const row = runRow({
        steps_snapshot,
        workflows: { name: 'Månadsproduktion', steps: [{ order: 1, agent_id: 'agent-current' }] },
      })
      expect(runRecordsAgent(row), String(steps_snapshot)).toBe(false)
      expect(runs(assembleActivity(input({ runs: { ok: true, rows: [row] } })))[0].agentRecorded).toBe(false)
    }
  })

  it('the loader never selects the workflow steps that would make that possible', () => {
    const src = codeOnly(read('lib/os/activity.ts'))
    expect(src).not.toMatch(/workflows\s*\([^)]*steps/)
    // Nor the name-join the legacy agent_scorecards view uses to guess.
    expect(src).not.toMatch(/step_name/)
  })

  it('the counted agents are only the recorded ones', () => {
    const model = assembleActivity(input({
      runs: { ok: true, rows: [
        runRow({ id: 'r1', steps_snapshot: [] }),
        runRow({ id: 'r2', steps_snapshot: [{ order: 1, agent_id: 'a' }] }),
        runRow({ id: 'r3', steps_snapshot: null }),
      ] },
    }))
    expect(model.counts.withAgent).toBe(1)
    expect(model.counts.runs).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Detail and status — absence stays absence
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · what happened is read, never reconstructed', () => {
  it('a run with no log row carries no detail', () => {
    expect(runs(assembleActivity(input()))[0].detail).toBeNull()
  })

  it('a run with logs carries the NEWEST line', () => {
    const model = assembleActivity(input({
      logs: { ok: true, rows: [
        logRow({ content: 'äldre', created_at: '2026-09-10T08:01:00.000Z' }),
        logRow({ content: 'nyare', created_at: '2026-09-10T08:04:30.000Z' }),
      ] },
    }))
    expect(runs(model)[0].detail).toBe('nyare')
  })

  it('a log belonging to another run never describes this one', () => {
    const model = assembleActivity(input({ logs: { ok: true, rows: [logRow({ run_id: 'run-other' })] } }))
    expect(runs(model)[0].detail).toBeNull()
  })

  it('a log with NO run id attaches to nothing, not to the first run', () => {
    for (const run_id of [null, undefined, '']) {
      const model = assembleActivity(input({
        logs: { ok: true, rows: [logRow({ run_id, content: 'orphan' })] },
      }))
      expect(runs(model)[0].detail, String(run_id)).toBeNull()
    }
  })

  it('an unreadable log source leaves detail absent rather than guessed', () => {
    const model = assembleActivity(input({ logs: { ok: false, rows: [] } }))
    expect(runs(model)[0].detail).toBeNull()
    expect(model.sources.logs).toBe('error')
    // …and does not take the page down with it.
    expect(model.state).toBe('ok')
  })

  it('a status nobody stored under a known name keeps its raw value', () => {
    const model = assembleActivity(input({ runs: { ok: true, rows: [runRow({ status: 'weird_state' })] } }))
    expect(runs(model)[0].status).toBe('weird_state')
    expect(runStateLabel('weird_state')).toBe(UNKNOWN_RUN_STATE_LABEL)
  })

  it('every status the nav registry lets an operator ask for has a label', () => {
    // Two vocabularies for one destination is how they drift.
    for (const status of destinationFilters('activity')?.status ?? []) {
      expect(RUN_STATE_LABELS[status], status).toBeTruthy()
    }
  })

  it('cancelled is labelled even though the registry does not declare it', () => {
    // The runtime stores it; production holds one. The registry describes what
    // may be asked for, not what may be written.
    expect(RUN_STATE_LABELS.cancelled).toBeTruthy()
    expect(destinationFilters('activity')?.status).not.toContain('cancelled')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Chronology — the ordering column is never silently swapped
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · the chronology states which column it ordered by', () => {
  it('a finished run is ordered by when it finished', () => {
    expect(runs(assembleActivity(input()))[0].timeSource).toBe('finished_at')
  })

  it('an unfinished run falls back to started, then created', () => {
    const started = assembleActivity(input({ runs: { ok: true, rows: [runRow({ finished_at: null })] } }))
    expect(runs(started)[0].timeSource).toBe('started_at')
    const created = assembleActivity(input({
      runs: { ok: true, rows: [runRow({ finished_at: null, started_at: null })] },
    }))
    expect(runs(created)[0].timeSource).toBe('created_at')
  })

  it('a review is ordered by its decision when it has one, else by creation', () => {
    const decided = assembleActivity(input({
      runs: { ok: true, rows: [] },
      reviews: { ok: true, rows: [reviewRow({ reviewed_at: '2026-09-11T10:00:00.000Z' })] },
    }))
    expect(decided.entries[0].timeSource).toBe('reviewed_at')
    const open = assembleActivity(input({ runs: { ok: true, rows: [] }, reviews: { ok: true, rows: [reviewRow()] } }))
    expect(open.entries[0].timeSource).toBe('created_at')
  })

  it('entries are newest first across both kinds', () => {
    const model = assembleActivity(input({
      runs: { ok: true, rows: [runRow({ id: 'old', finished_at: '2026-09-01T00:00:00.000Z' })] },
      reviews: { ok: true, rows: [reviewRow({ id: 'new', created_at: '2026-09-11T00:00:00.000Z' })] },
    }))
    expect(model.entries.map((e) => e.id)).toEqual(['new', 'old'])
  })

  it('an entry with no timestamp sorts LAST, never to the top of a chronology', () => {
    const model = assembleActivity(input({
      runs: { ok: true, rows: [
        runRow({ id: 'undated', created_at: null, started_at: null, finished_at: null }),
        runRow({ id: 'dated' }),
      ] },
    }))
    expect(model.entries.map((e) => e.id)).toEqual(['dated', 'undated'])
    expect(runs(model).find((e) => e.id === 'undated')!.timeSource).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · The lanes — each is a filter over stored rows, never a judgement
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · the lanes are derived from stored conditions only', () => {
  it('only a run the runtime calls running is running', () => {
    const model = assembleActivity(input({
      runs: { ok: true, rows: [runRow({ id: 'r', status: 'running' }), runRow({ id: 'd', status: 'done' })] },
    }))
    expect(model.running.map((e) => e.id)).toEqual(['r'])
    expect(model.counts.running).toBe(1)
  })

  it('attention is failed, stalled, a stored cancel reason, or a review awaiting a person', () => {
    const model = assembleActivity(input({
      runs: { ok: true, rows: [
        runRow({ id: 'failed', status: 'failed' }),
        runRow({ id: 'stalled', status: 'stalled' }),
        runRow({ id: 'cancelled', status: 'cancelled', cancel_reason: 'Operatör avbröt' }),
        runRow({ id: 'done', status: 'done' }),
      ] },
      reviews: { ok: true, rows: [reviewRow({ id: 'pending' }), reviewRow({ id: 'approved', status: 'approved' })] },
    }))
    expect(new Set(model.attention.map((e) => e.id)))
      .toEqual(new Set(['failed', 'stalled', 'cancelled', 'pending']))
  })

  it('a completed run is never in attention, however slow it was', () => {
    const model = assembleActivity(input({
      runs: { ok: true, rows: [runRow({ status: 'done', attempts: 3 })] },
    }))
    expect(model.attention).toEqual([])
  })

  it('a quiet platform and an unreadable one are different answers', () => {
    const quiet = assembleActivity(input({ runs: { ok: true, rows: [] } }))
    expect(quiet.state).toBe('ok')
    expect(quiet.sources.runs).toBe('ok')
    const broken = assembleActivity(input({ runs: { ok: false, rows: [] } }))
    expect(broken.sources.runs).toBe('error')
    expect(broken.counts.runs).toBe(0)
  })

  it('the page is only blank when NOTHING could be read', () => {
    expect(assembleActivity(input({ runs: { ok: false, rows: [] } })).state).toBe('ok')
    expect(assembleActivity(input({ reviews: { ok: false, rows: [] } })).state).toBe('ok')
    expect(assembleActivity(input({
      runs: { ok: false, rows: [] }, reviews: { ok: false, rows: [] },
    })).state).toBe('error')
  })

  it('rows from a source that failed are never counted', () => {
    // A caller handing rows alongside ok:false must not smuggle them in.
    const model = assembleActivity(input({ runs: { ok: false, rows: [runRow()] } }))
    expect(model.counts.runs).toBe(0)
    expect(model.entries).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Ownership — the review's project comes through the run
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · a review is placed by its run, not by its own column', () => {
  it('the project shown is the run\'s', () => {
    const model = assembleActivity(input({ runs: { ok: true, rows: [] }, reviews: { ok: true, rows: [reviewRow()] } }))
    expect(model.entries[0].project.slug).toBe(PROJ_B.slug)
  })

  it('a null approvals.project_id — 12 of 13 production rows — still places the review', () => {
    const row = { ...reviewRow(), project_id: null }
    const model = assembleActivity(input({ runs: { ok: true, rows: [] }, reviews: { ok: true, rows: [row] } }))
    expect(model.entries[0].project.name).toBe(PROJ_B.name)
  })

  it('the RUN wins even when the approval carries a project of its own', () => {
    // The one production row that has a project_id is the reason this matters:
    // an approvals-side embed must not be preferred, or a disagreement between
    // the two would be resolved in favour of the unreliable column.
    const row = { ...reviewRow(), project_id: 'other', projects: PROJ_A }
    const model = assembleActivity(input({ runs: { ok: true, rows: [] }, reviews: { ok: true, rows: [row] } }))
    expect(model.entries[0].project.slug).toBe(PROJ_B.slug)
    expect(model.entries[0].project.slug).not.toBe(PROJ_A.slug)
  })

  it('the loader selects approvals through runs!inner and never gates on approvals.project_id', () => {
    const src = codeOnly(read('lib/os/activity.ts'))
    expect(src).toMatch(/runs!inner\(id, projects!inner\(name, slug, color\)\)/)
    expect(src).not.toMatch(/\.eq\('project_id'/)
    expect(src).not.toMatch(/approvals'\)[\s\S]{0,400}?\.in\('project_id'/)
  })

  it('a run with no project renders as unknown rather than borrowing one', () => {
    const model = assembleActivity(input({ runs: { ok: true, rows: [runRow({ projects: null })] } }))
    expect(model.entries[0].project).toEqual({ name: null, slug: null, color: null })
    expect(model.entries[0].href).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Navigation — routes come from the registry
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · every link is registry-derived', () => {
  it('a run links to its own row under the project base path', () => {
    expect(assembleActivity(input()).entries[0].href).toBe('/projects/familje-stunden/runs/run-1')
  })

  it('a review links to the review queue, narrowed to its project', () => {
    const model = assembleActivity(input({ runs: { ok: true, rows: [] }, reviews: { ok: true, rows: [reviewRow()] } }))
    expect(model.entries[0].href).toBe('/approvals?project=ai-media-automation')
  })

  it('the loader builds paths from destinationBasePath, not from string literals', () => {
    const src = codeOnly(read('lib/os/activity.ts'))
    expect(src).toMatch(/destinationBasePath\('project_home'\)/)
    expect(src).toMatch(/destinationBasePath\('approvals'\)/)
    expect(src).not.toMatch(/'\/projects\//)
    expect(src).not.toMatch(/'\/approvals'/)
  })

  it('the destination is labelled in the operator\'s language, as Phase 11 and 12 did', () => {
    expect(destinationLabel('activity')).toBe('Aktivitet')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Render — the surface says what it does not know
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · the rendered surface', () => {
  const render = async (model: ActivityModel) => {
    const { ActivityStream } = await import('@/components/platform/vnext/ActivityStream')
    return renderToStaticMarkup(React.createElement(ActivityStream, { model }))
  }

  it('states that no agent is recorded', async () => {
    const html = await render(assembleActivity(input()))
    expect(html).toContain(AGENT_ATTRIBUTION_NOTE.slice(0, 60))
  })

  it('shows an unrecognised status verbatim beside its fallback label', async () => {
    const html = await render(assembleActivity(input({ runs: { ok: true, rows: [runRow({ status: 'weird_state' })] } })))
    expect(html).toContain(UNKNOWN_RUN_STATE_LABEL)
    expect(html).toContain('weird_state')
  })

  it('never prints a score, a percentage of health, or the word healthy', async () => {
    const html = await render(assembleActivity(input()))
    expect(html).not.toMatch(/healthy|Optimal|hälsopoäng|\d+\s*%/i)
  })

  it('an empty stream is a statement about scope, not about the platform', async () => {
    const html = await render(assembleActivity(input({ runs: { ok: true, rows: [] } })))
    expect(html).toMatch(/den här sessionen äger/)
  })

  it('an unreadable source is named on the page', async () => {
    const html = await render(assembleActivity(input({ runs: { ok: false, rows: [] } })))
    expect(html).toMatch(/Kunde inte läsas/)
    expect(html).toMatch(/inte samma sak som att ingenting har hänt/)
  })

  it('a run with a stored error shows it', async () => {
    const html = await render(assembleActivity(input({
      runs: { ok: true, rows: [runRow({ status: 'failed', error: "400 The model 'dall-e-3' does not exist." })] },
    })))
    expect(html).toContain('dall-e-3')
  })

  it('renders no agent name anywhere, because none is read', async () => {
    const html = await render(assembleActivity(input({
      runs: { ok: true, rows: [runRow({ workflows: { name: 'Månadsproduktion', steps: [{ agent_id: 'agent-x' }] } })] },
    })))
    expect(html).not.toContain('agent-x')
  })

  it('the loading state claims nothing about the data', async () => {
    const { ActivityStreamLoading } = await import('@/components/platform/vnext/ActivityStream')
    const html = renderToStaticMarkup(React.createElement(ActivityStreamLoading))
    expect(html).not.toMatch(/\b0\b/)
    expect(html).toContain('Aktivitet')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Generation — the rollback branch returns before the vNext read
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · generation branch', () => {
  beforeEach(() => { vi.resetModules() })

  const mountPage = async (cookie: string | null) => {
    let loaderCalls = 0
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookie && n === 'omnira_ui' ? { value: cookie } : undefined) }),
    }))
    vi.doMock('@/lib/os/activity', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/activity')>()),
      loadActivity: async () => { loaderCalls += 1; return assembleActivity(input()) },
    }))
    vi.doMock('@/app/(platform)/agent-activity/AgentActivityLegacy', () => ({
      AgentActivityLegacy: () => React.createElement('div', null, 'LEGACY BODY'),
    }))
    const mod = await import('@/app/(platform)/agent-activity/page')
    const el = await mod.default({ searchParams: {} })
    return { el, loaderCalls }
  }

  it('legacy renders the moved body and never reaches the vNext loader', async () => {
    const { el, loaderCalls } = await mountPage('legacy')
    expect(renderToStaticMarkup(el as React.ReactElement)).toContain('LEGACY BODY')
    expect(loaderCalls).toBe(0)
  })

  it('the default generation is vNext', async () => {
    const { el } = await mountPage(null)
    expect(renderToStaticMarkup(el as React.ReactElement)).not.toContain('LEGACY BODY')
  })

  it('the page reads the cookie and branches before constructing the loader', () => {
    const src = codeOnly(read('app/(platform)/agent-activity/page.tsx'))
    const branch = src.indexOf('AgentActivityLegacy />')
    const load = src.indexOf('loadActivity(')
    expect(branch).toBeGreaterThan(-1)
    expect(load).toBeGreaterThan(branch)
  })

  it('?project= narrows the view, the shape the registry declares for this destination', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
    // React's dev-time stack probing calls the loading component a second time
    // with no props, so record every call and assert the real one happened.
    const seen: Array<string | null | undefined> = []
    vi.doMock('@/lib/os/activity', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/activity')>()),
      loadActivity: async ({ projectSlug }: { projectSlug?: string | null } = {}) => {
        seen.push(projectSlug)
        return assembleActivity(input())
      },
    }))
    const mod = await import('@/app/(platform)/agent-activity/page')
    const el = await mod.default({ searchParams: { project: 'familje-stunden' } })
    renderToStaticMarkup(el as React.ReactElement)
    expect(seen).toContain('familje-stunden')
  })

  it('a repeated ?project= takes the first value rather than an array', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
    const seen: Array<string | null | undefined> = []
    vi.doMock('@/lib/os/activity', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/activity')>()),
      loadActivity: async ({ projectSlug }: { projectSlug?: string | null } = {}) => {
        seen.push(projectSlug)
        return assembleActivity(input())
      },
    }))
    const mod = await import('@/app/(platform)/agent-activity/page')
    const el = await mod.default({ searchParams: { project: ['familje-stunden', 'gainpilot'] } })
    renderToStaticMarkup(el as React.ReactElement)
    expect(seen).toContain('familje-stunden')
    expect(seen).not.toContain('gainpilot')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9 · The read — RLS-bound, session-gated, bounded
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · the loader', () => {
  beforeEach(() => {
    vi.doUnmock('@/lib/os/activity')
    vi.doUnmock('next/headers')
    vi.doUnmock('@/app/(platform)/agent-activity/AgentActivityLegacy')
    vi.resetModules()
  })

  const fakeDb = (user: unknown) => {
    const calls: Array<{ table: string; filters: string[]; limit?: number }> = []
    const from = (table: string) => {
      const rec = { table, filters: [] as string[], limit: undefined as number | undefined }
      calls.push(rec)
      const q: any = {
        select: () => q,
        order: () => q,
        limit: (n: number) => { rec.limit = n; return q },
        eq: (col: string, val: string) => { rec.filters.push(`eq:${col}=${val}`); return q },
        in: (col: string, vals: string[]) => { rec.filters.push(`in:${col}[${vals.length}]`); return q },
        then: (res: (v: unknown) => unknown) => res({ data: [], error: null }),
      }
      return q
    }
    return { calls, db: { from, auth: { getUser: async () => ({ data: { user } }) } } }
  }

  it('returns null without a session — a scope that cannot be resolved is a redirect', async () => {
    const { db } = fakeDb(null)
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => db }))
    const { loadActivity } = await import('@/lib/os/activity')
    expect(await loadActivity()).toBeNull()
  })

  it('reads runs and approvals, bounded by the declared limits', async () => {
    const { calls, db } = fakeDb({ id: 'user-1' })
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => db }))
    const { loadActivity } = await import('@/lib/os/activity')
    await loadActivity()
    expect(calls.find((c) => c.table === 'runs')?.limit).toBe(ACTIVITY_LIMITS.runs)
    expect(calls.find((c) => c.table === 'approvals')?.limit).toBe(ACTIVITY_LIMITS.reviews)
  })

  it('a project slug narrows BOTH reads, approvals through its run', async () => {
    const { calls, db } = fakeDb({ id: 'user-1' })
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => db }))
    const { loadActivity } = await import('@/lib/os/activity')
    await loadActivity({ projectSlug: 'familje-stunden' })
    expect(calls.find((c) => c.table === 'runs')?.filters).toContain('eq:projects.slug=familje-stunden')
    expect(calls.find((c) => c.table === 'approvals')?.filters).toContain('eq:runs.projects.slug=familje-stunden')
  })

  it('no run ids means no log fan-out at all', async () => {
    const { calls, db } = fakeDb({ id: 'user-1' })
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => db }))
    const { loadActivity } = await import('@/lib/os/activity')
    await loadActivity()
    expect(calls.some((c) => c.table === 'run_logs')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Static boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · boundaries the surface must not cross', () => {
  const LOADER = read('lib/os/activity.ts')
  const SHARED = read('lib/os/activity-shared.ts')
  const COMPONENT = read('components/platform/vnext/ActivityStream.tsx')

  it('the vNext read is RLS-bound — the service-role client is not used here', () => {
    expect(codeOnly(LOADER)).not.toMatch(/createAdminClient|service_role|SERVICE_ROLE/)
    expect(codeOnly(LOADER)).toMatch(/from '@\/lib\/supabase\/server'/)
  })

  it('the surface writes nothing — no action, no mutation, no rpc', () => {
    for (const [name, src] of [['loader', LOADER], ['component', COMPONENT], ['shared', SHARED]] as const) {
      expect(codeOnly(src), name).not.toMatch(/'use server'|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/)
    }
  })

  it('it neither reads nor writes Memory, and does not trigger Dream', () => {
    for (const [name, src] of [['loader', LOADER], ['component', COMPONENT], ['shared', SHARED]] as const) {
      expect(codeOnly(src), name).not.toMatch(/recordMemoryEvent|atlas\/memory|memory_events|runDreamCycleForProject|lib\/ai\/dream/)
    }
  })

  it('it exposes no flag values and no environment', () => {
    for (const [name, src] of [['loader', LOADER], ['component', COMPONENT], ['shared', SHARED]] as const) {
      expect(codeOnly(src), name).not.toMatch(/process\.env|readMemoryFlags|executionSafetyFlags/)
    }
  })

  it('the shared half stays client-safe', () => {
    // The prose explains which half IS server-only; read the code, not the comment.
    expect(codeOnly(SHARED)).not.toMatch(/server-only/)
    expect(codeOnly(SHARED)).not.toMatch(/supabase|createClient|from\('/)
  })

  it('the loader stays server-only', () => {
    expect(LOADER).toMatch(/^import 'server-only'/m)
  })

  it('the component is a server component and installs no global handlers', () => {
    expect(COMPONENT).not.toMatch(/'use client'/)
    expect(codeOnly(COMPONENT)).not.toMatch(/addEventListener|onKeyDown|useEffect|useState/)
  })

  it('the stop authority is nowhere near this surface', () => {
    for (const [name, src] of [['loader', LOADER], ['component', COMPONENT]] as const) {
      expect(codeOnly(src), name).not.toMatch(/PauseToggle|toggleAutomationPause|toggleProjectExecutionPause|automation_paused/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11 · Rollback — the legacy body is byte-identical
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · the rollback body is the body it replaced', () => {
  const LEGACY = read('app/(platform)/agent-activity/AgentActivityLegacy.tsx')

  it('is pinned by hash', () => {
    // Recompute deliberately: this must fail if anyone "improves" the rollback.
    const body = LEGACY.slice(LEGACY.indexOf('import { createAdminClient }'))
    expect(createHash('sha256').update(body).digest('hex'))
      .toBe('4d476c896efaa6008eeaad93fc7349b78fb6f0460df6ed1a04a4ff2b3b650fc3')
  })

  it('keeps its own service-role read and its own scope', () => {
    expect(LEGACY).toMatch(/createAdminClient/)
    expect(LEGACY).toMatch(/getAllowedProjectIds/)
    expect(LEGACY).toMatch(/fetchAgentActivity/)
  })

  it('the segment config moved to the page, which owns it for both generations', () => {
    expect(LEGACY).not.toMatch(/export const dynamic/)
    expect(read('app/(platform)/agent-activity/page.tsx')).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12 · Layout
// ─────────────────────────────────────────────────────────────────────────────

describe('aktivitet · layout', () => {
  const CSS = read('components/platform/vnext/ActivityStream.module.css')

  it('declares its own font, as the other vNext surfaces do', () => {
    expect(CSS).toMatch(/font-family: var\(--font-geist-sans\)/)
  })

  it('is sized in rem so the display-scale preference reaches it', () => {
    expect(CSS).not.toMatch(/font-size:\s*\d+px/)
  })

  it('never scrolls sideways — long text wraps instead', () => {
    expect(CSS).toMatch(/overflow-x: hidden/)
    expect(CSS).toMatch(/overflow-wrap: anywhere/)
  })

  it('reflows on a phone', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\)/)
  })

  it('honours reduced motion', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('keeps focus visible on every interactive element it owns', () => {
    expect(CSS).toMatch(/\.inspect:focus-visible/)
    expect(CSS).toMatch(/\.summary:focus-visible/)
  })
})
