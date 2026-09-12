/**
 * vNext Phase 11 — Granskningar, the global review queue (`/approvals`).
 *
 * Three risks carry this surface, and the suite is organised around them:
 *
 *   1. CLAIMING AUTHORITY THE RUNTIME DOES NOT GIVE. A review queue is where a
 *      fourth decision, a risk score or an optimistic "done" slips in. Omnira
 *      supports exactly three decisions, through exactly one route, and answers
 *      409 when a caller loses the transition. The UI must say what the server
 *      said — and must not offer a decision the route would refuse.
 *
 *   2. WIDENING THE BOUNDARY. The queue is global, so its scope is the whole
 *      boundary. It reads through the RLS client, where a row is admitted only
 *      when its run belongs to a project the session owns. `approvals.project_id`
 *      is null on nearly every stored row, so the project comes through the run.
 *
 *   3. LOSING THE ROLLBACK. `?ui=legacy` must render the previous body exactly —
 *      pinned here by hash, not by eyeballing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleReviewQueue,
  REVIEW_QUEUE_LIMIT,
  type RawReviewApproval,
  type RawReviewProject,
  type ReviewQueueModel,
} from '@/lib/os/review-queue'
import {
  ACTIONABLE_STATUSES,
  BLOCKED_REASONS,
  DECISIONS,
  TERMINAL_STATUSES,
  UNKNOWN_STATUS_LABEL,
  classifyStatus,
} from '@/lib/os/review-queue-shared'
import { resolveDestination, destinationLabel } from '@/lib/nav/registry'

// The app compiles JSX with the automatic runtime; vitest's transform uses the
// classic one, so components rendered here need `React` in scope.
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => '/approvals',
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => { throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` }) },
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECT_A: RawReviewProject = {
  id: 'proj-a', name: 'Familje-Stunden', slug: 'familje-stunden',
  color: '#22d3ee', execution_paused: false, paused_reason: null,
}
const PROJECT_B: RawReviewProject = {
  id: 'proj-b', name: 'AI Media', slug: 'ai-media-automation',
  color: '#a855f7', execution_paused: true, paused_reason: 'Incident i releasen',
}

function row(over: Partial<RawReviewApproval> & { project?: RawReviewProject } = {}): RawReviewApproval {
  const { project = PROJECT_A, ...rest } = over
  return {
    id: 'appr-1',
    status: 'pending',
    kind: 'workflow_output',
    output_key: 'draft',
    content: 'Ett utkast att granska.',
    reviewer_notes: null,
    created_at: '2026-09-10T08:00:00.000Z',
    reviewed_at: null,
    decided_at: null,
    run_id: 'run-1',
    runs: {
      id: 'run-1', status: 'awaiting_approval', action_kind: null,
      workflows: { name: 'Daglig produktion' },
      projects: project,
    },
    ...rest,
  }
}

const model = (rows: RawReviewApproval[], over: Partial<{ count: number | null; filterSlug: string | null }> = {}) =>
  assembleReviewQueue({
    approvals: { ok: true, rows, count: over.count === undefined ? rows.length : over.count },
    filterSlug: over.filterSlug ?? null,
  })

const errorModel = (filterSlug: string | null = null) =>
  assembleReviewQueue({ approvals: { ok: false }, filterSlug })

async function html(m: ReviewQueueModel): Promise<string> {
  const { ReviewQueue } = await import('@/components/platform/vnext/ReviewQueue')
  return renderToStaticMarkup(createElement(ReviewQueue, { model: m }))
}

// ── The status vocabulary ────────────────────────────────────────────────────

describe('phase 11 · the status vocabulary is the stored one', () => {
  it('classifies exactly the three statuses resolve_approval acts on as actionable', () => {
    for (const status of ACTIONABLE_STATUSES) expect(classifyStatus(status), status).toBe('actionable')
    expect([...ACTIONABLE_STATUSES].sort()).toEqual(['needs_input', 'pending', 'revised'])
  })

  it('classifies decided and runtime-closed statuses as terminal', () => {
    for (const status of TERMINAL_STATUSES) expect(classifyStatus(status), status).toBe('terminal')
    expect([...TERMINAL_STATUSES].sort()).toEqual(['approved', 'rejected', 'returned'])
  })

  it('an unknown status stays unknown — it is never read as pending', () => {
    for (const status of ['escalated', '', null, undefined, 'PENDING']) {
      expect(classifyStatus(status as string), String(status)).toBe('unknown')
    }
  })

  it('offers exactly the three decisions the route accepts', () => {
    expect(DECISIONS.map((d) => d.action)).toEqual(['approved', 'revised', 'rejected'])
    expect(DECISIONS.map((d) => d.label)).toEqual(['Godkänn', 'Revidera', 'Avvisa'])
  })
})

// ── The model ────────────────────────────────────────────────────────────────

describe('phase 11 · the queue model is built from stored rows only', () => {
  it('a pending approval with a run is actionable and decidable', () => {
    const m = model([row()])
    expect(m.state).toBe('ok')
    expect(m.queue).toHaveLength(1)
    expect(m.archive).toHaveLength(0)
    expect(m.queue[0]).toMatchObject({
      status: 'pending', statusClass: 'actionable', decidable: true, blockedReason: null,
      kind: 'workflow_output', outputKey: 'draft', runStatus: 'awaiting_approval',
      workflowName: 'Daglig produktion',
    })
  })

  it('a revised approval is still actionable — the run waits for another pass', () => {
    const m = model([row({ status: 'revised', reviewer_notes: 'Skärp rubriken' })])
    expect(m.queue[0].statusClass).toBe('actionable')
    expect(m.queue[0].decidable).toBe(true)
    expect(m.queue[0].reviewerNotes).toBe('Skärp rubriken')
  })

  it('needs_input is explicit and actionable', () => {
    const m = model([row({ status: 'needs_input' })])
    expect(m.queue[0].statusClass).toBe('actionable')
    expect(m.queue[0].statusLabel).toBe('Behöver underlag')
  })

  it('returned is explicit, terminal and carries no decision', () => {
    const m = model([row({ status: 'returned' })])
    expect(m.queue).toHaveLength(0)
    expect(m.archive[0]).toMatchObject({
      status: 'returned', statusClass: 'terminal', decidable: false, blockedReason: 'terminal',
      statusLabel: 'Återlämnad',
    })
  })

  it.each(['approved', 'rejected'])('%s is terminal and non-actionable', (status) => {
    const m = model([row({ status, reviewed_at: '2026-09-11T09:00:00.000Z' })])
    expect(m.archive[0].decidable).toBe(false)
    expect(m.archive[0].blockedReason).toBe('terminal')
  })

  it('an unknown status is archived, explicit, and never decidable', () => {
    const m = model([row({ status: 'escalated' })])
    expect(m.archive[0]).toMatchObject({ status: 'escalated', statusClass: 'unknown', decidable: false, blockedReason: 'unknown' })
    expect(m.archive[0].statusLabel).toBe(UNKNOWN_STATUS_LABEL)
  })

  it('a run-less approval can never be decided here — the route refuses it first', () => {
    const m = model([row({ status: 'pending', run_id: null, runs: null })])
    expect(m.queue[0]).toMatchObject({ decidable: false, blockedReason: 'no_run', runId: null })
  })

  it('a marketing ledger row gets no run-decision controls', () => {
    // The marketing flow writes its rows with kind='marketing_draft' and no run;
    // its decisions belong to /api/marketing/approvals, not to this queue.
    const m = model([row({ kind: 'marketing_draft', status: 'approved', run_id: null, runs: null, output_key: 'marketing_draft' })])
    expect(m.archive[0].decidable).toBe(false)
    expect(m.archive[0].kind).toBe('marketing_draft')
  })

  it('a null approvals.project_id still resolves its project through the run', () => {
    const m = model([row({ project: PROJECT_B })])
    expect(m.queue[0].project).toMatchObject({
      id: 'proj-b', name: 'AI Media', slug: 'ai-media-automation', color: '#a855f7',
      paused: true, pausedReason: 'Incident i releasen',
    })
  })

  it('project and run links come from the nav registry, not from literals', () => {
    const m = model([row()])
    const expected = resolveDestination('project_home', { project: 'familje-stunden' })?.href
    expect(m.queue[0].project?.href).toBe(expected)
    expect(m.queue[0].runHref).toBe(`${expected}/runs/run-1`)
    expect(m.links.approvals).toBe(resolveDestination('approvals')?.href)
  })

  it('a failed read is an error, never an empty queue', () => {
    const m = errorModel()
    expect(m.state).toBe('error')
    expect(m.queue).toEqual([])
    expect(m.archive).toEqual([])
    expect(m.total).toBeNull()
  })

  it('reports the exact row count and whether the page was truncated', () => {
    const rows = Array.from({ length: 3 }, (_, i) => row({ id: `appr-${i}` }))
    expect(model(rows, { count: 3 }).truncated).toBe(false)
    expect(model(rows, { count: 41 }).truncated).toBe(true)
    expect(model(rows, { count: null }).total).toBeNull()
    expect(REVIEW_QUEUE_LIMIT).toBeGreaterThan(0)
  })

  it('records the project filter and whether anything matched it', () => {
    expect(model([row()], { filterSlug: 'familje-stunden' }).filter).toEqual({ slug: 'familje-stunden', matched: true })
    expect(model([row()], { filterSlug: 'ai-media-automation' }).filter).toEqual({ slug: 'ai-media-automation', matched: false })
    expect(model([row()]).filter).toBeNull()
  })

  it('carries no field Omnira does not store for an approval', () => {
    const item = model([row()]).queue[0]
    expect(Object.keys(item).sort()).toEqual([
      'blockedReason', 'content', 'createdAt', 'decidable', 'decidedAt', 'id', 'kind',
      'outputKey', 'project', 'reviewedAt', 'reviewerNotes', 'runActionKind', 'runHref',
      'runId', 'runStatus', 'status', 'statusClass', 'statusLabel', 'workflowName',
    ])
    for (const invented of ['risk', 'confidence', 'priority', 'score', 'deadline', 'amount', 'currency', 'impact', 'progress']) {
      expect(Object.keys(item)).not.toContain(invented)
    }
  })

  it('keeps stored content verbatim, including text that looks like markup', () => {
    const content = '<script>alert(1)</script> & <b>fetstil</b>'
    expect(model([row({ content })]).queue[0].content).toBe(content)
  })

  it('orders the queue before the archive without reordering within them', () => {
    const m = model([
      row({ id: 'a', status: 'approved' }),
      row({ id: 'b', status: 'pending' }),
      row({ id: 'c', status: 'revised' }),
    ])
    expect(m.queue.map((i) => i.id)).toEqual(['b', 'c'])
    expect(m.archive.map((i) => i.id)).toEqual(['a'])
  })
})

// ── Rendering ────────────────────────────────────────────────────────────────

describe('phase 11 · the queue renders stored truth', () => {
  it('shows the item, its project and its status', async () => {
    const out = await html(model([row()]))
    expect(out).toContain('draft')
    expect(out).toContain('Familje-Stunden')
    expect(out).toContain('Väntar på granskning')
    expect(out).toContain('Granskningar')
  })

  it('an unknown status is shown as unknown, with the stored value beside it', async () => {
    const out = await html(model([row({ status: 'escalated' })]))
    expect(out).toContain(UNKNOWN_STATUS_LABEL)
    expect(out).toContain('escalated')
    expect(out).not.toContain('Väntar på granskning')
  })

  it('offers Godkänn, Revidera and Avvisa on a decidable item, and states what revision means', async () => {
    const out = await html(model([row()]))
    for (const { action, label } of DECISIONS) {
      expect(out, action).toMatch(new RegExp(`data-action="${action}"`))
      expect(out, label).toContain(label)
    }
    expect(out).toContain('Revidering begär en ny omgång')
  })

  it('a terminal item shows why it cannot be decided instead of buttons', async () => {
    const out = await html(model([row({ status: 'approved' })]))
    expect(out).toContain(BLOCKED_REASONS.terminal)
    expect(out).not.toMatch(/data-action="approved"/)
    expect(out).not.toMatch(/<textarea/)
  })

  it('a run-less item says so, in the route\'s own words', async () => {
    const out = await html(model([row({ run_id: null, runs: null })]))
    expect(out).toContain(BLOCKED_REASONS.no_run)
    expect(out).not.toMatch(/data-action="approved"/)
  })

  it('an unreadable queue says so and is never rendered as empty', async () => {
    const out = await html(errorModel())
    expect(out).toContain('kunde inte läsas')
    expect(out).not.toContain('Inga granskningar att visa')
  })

  it('an empty queue says it is empty, and names the filter when one narrowed it', async () => {
    expect(await html(model([]))).toContain('Inga granskningar att visa')
    const filtered = await html(model([], { filterSlug: 'ai-media-automation' }))
    expect(filtered).toContain('ai-media-automation')
  })

  it('renders stored content as text — never as markup', async () => {
    const out = await html(model([row({ content: '<script>alert(1)</script><b>x</b>' })]))
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>alert(1)</script>')
    expect(read('components/platform/vnext/ReviewQueue.tsx')).not.toMatch(/dangerouslySetInnerHTML/)
  })

  it('shows the project stop when the project carries one', async () => {
    const out = await html(model([row({ project: PROJECT_B })]))
    expect(out).toContain('Projektstopp aktivt')
    expect(out).toContain('Incident i releasen')
  })

  it('invents no risk, confidence, priority, deadline or money', async () => {
    const out = await html(model([row(), row({ id: 'b', status: 'approved' })]))
    for (const word of ['Risk', 'Konfidens', 'Prioritet', 'Deadline', 'SEK', 'poäng', 'Sannolikhet']) {
      expect(out, word).not.toContain(word)
    }
  })

  it('the loading state is distinct from both empty and error', async () => {
    const { ReviewQueueLoading } = await import('@/components/platform/vnext/ReviewQueue')
    const out = renderToStaticMarkup(createElement(ReviewQueueLoading))
    expect(out).toContain('Läser granskningar')
    expect(out).not.toContain('Inga granskningar att visa')
    expect(out).not.toContain('kunde inte läsas')
  })
})

// ── Generation ───────────────────────────────────────────────────────────────

describe('phase 11 · generation', () => {
  const loadSpy = vi.fn(async () => model([row()]))
  let cookieValue: string | null = null

  beforeEach(() => {
    vi.resetModules()
    loadSpy.mockClear()
    cookieValue = null
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (name: string) => (cookieValue && name === 'omnira_ui' ? { value: cookieValue } : undefined) }),
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
    }))
    vi.doMock('@/lib/os/review-queue', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/review-queue')>()),
      loadReviewQueue: loadSpy,
    }))
    vi.doMock('@/app/(platform)/approvals/ApprovalsLegacy', () => ({
      ApprovalsLegacy: () => createElement('div', { id: 'legacy-body' }),
    }))
  })

  it('renders vNext by default', async () => {
    const { default: Page } = await import('@/app/(platform)/approvals/page')
    const element = await Page({}) as React.ReactElement
    // vNext is a Suspense boundary around the loader; legacy is the legacy body.
    expect(element.type).toBe(React.Suspense)
    const inner = (element.props as { children: React.ReactElement }).children
    expect((inner.type as { name?: string }).name).toBe('LoadedReviewQueue')
  })

  it('`?ui=legacy` (via the cookie the middleware persists) renders the legacy body', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/approvals/page')
    const out = renderToStaticMarkup(await Page({}) as React.ReactElement)
    expect(out).toContain('legacy-body')
  })

  it('the legacy branch never runs the vNext loader', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/approvals/page')
    renderToStaticMarkup(await Page({}) as React.ReactElement)
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['familje-stunden', 'familje-stunden'],
    [['familje-stunden', 'ai-media-automation'], 'familje-stunden'],
    [undefined, null],
  ])('passes the ?project= filter (%s) straight through to the loader', async (raw, expected) => {
    const { default: Page } = await import('@/app/(platform)/approvals/page')
    const element = await Page({ searchParams: { project: raw as string | string[] | undefined } }) as React.ReactElement
    const inner = (element.props as { children: React.ReactElement }).children
    await (inner.type as (props: unknown) => Promise<unknown>)(inner.props)
    expect(loadSpy).toHaveBeenCalledWith({ projectSlug: expected })
  })

  it('an unsigned-in session is sent to login before any branch', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    }))
    vi.resetModules()
    const { default: Page } = await import('@/app/(platform)/approvals/page')
    await expect(Page({})).rejects.toThrow(/NEXT_REDIRECT/)
    expect(loadSpy).not.toHaveBeenCalled()
  })
})

// ── The loader, executed ─────────────────────────────────────────────────────

describe('phase 11 · the loader reads inside the owner boundary', () => {
  interface Recorded { table: string; select: string; eq: [string, unknown][]; limit: number | null }
  let recorded: Recorded
  let result: { data: unknown; error: unknown; count: number | null }
  let adminClients: number

  function fakeQuery() {
    const api: Record<string, unknown> = {
      select(select: string) { recorded.select = select; return api },
      order() { return api },
      limit(n: number) { recorded.limit = n; return api },
      eq(column: string, value: unknown) { recorded.eq.push([column, value]); return api },
      then(ok: (v: unknown) => unknown) { return Promise.resolve(result).then(ok) },
    }
    return api
  }

  beforeEach(() => {
    // The generation block doubles the loader itself; this block tests the real
    // one, so that double must be lifted before the module graph is rebuilt.
    vi.doUnmock('@/lib/os/review-queue')
    vi.doUnmock('@/app/(platform)/approvals/ApprovalsLegacy')
    vi.doUnmock('next/headers')
    vi.resetModules()
    recorded = { table: '', select: '', eq: [], limit: null }
    result = { data: [row()], error: null, count: 1 }
    adminClients = 0
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ from: (table: string) => { recorded.table = table; return fakeQuery() } }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => { adminClients += 1; return {} } }))
  })

  it('reads approvals through the RLS client, with the run and project joined inward', async () => {
    const { loadReviewQueue } = await import('@/lib/os/review-queue')
    const m = await loadReviewQueue()
    expect(recorded.table).toBe('approvals')
    expect(recorded.select).toMatch(/runs!inner/)
    expect(recorded.select).toMatch(/projects!inner/)
    expect(recorded.eq).toEqual([])
    expect(recorded.limit).toBe(REVIEW_QUEUE_LIMIT)
    expect(adminClients).toBe(0)
    expect(m.state).toBe('ok')
    expect(m.queue).toHaveLength(1)
  })

  it('a project filter narrows through the run\'s project slug — it never names a project id', async () => {
    const { loadReviewQueue } = await import('@/lib/os/review-queue')
    await loadReviewQueue({ projectSlug: 'familje-stunden' })
    expect(recorded.eq).toEqual([['runs.projects.slug', 'familje-stunden']])
  })

  it('a filter that matches nothing is an empty queue, not another project\'s rows', async () => {
    result = { data: [], error: null, count: 0 }
    const { loadReviewQueue } = await import('@/lib/os/review-queue')
    const m = await loadReviewQueue({ projectSlug: 'someone-elses-project' })
    expect(m.state).toBe('ok')
    expect(m.queue).toEqual([])
    expect(m.archive).toEqual([])
    expect(m.filter).toEqual({ slug: 'someone-elses-project', matched: false })
  })

  it('an empty or whitespace filter is no filter at all', async () => {
    const { loadReviewQueue } = await import('@/lib/os/review-queue')
    await loadReviewQueue({ projectSlug: '   ' })
    expect(recorded.eq).toEqual([])
  })

  it('a failed read becomes the error state — never an empty queue', async () => {
    result = { data: null, error: { message: 'permission denied' }, count: null }
    const { loadReviewQueue } = await import('@/lib/os/review-queue')
    const m = await loadReviewQueue()
    expect(m.state).toBe('error')
    expect(m.total).toBeNull()
  })

  it('a thrown read is contained and reported as an error state', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => { throw new Error('no session') },
    }))
    vi.resetModules()
    const { loadReviewQueue } = await import('@/lib/os/review-queue')
    await expect(loadReviewQueue()).resolves.toMatchObject({ state: 'error', queue: [], archive: [] })
  })
})

// ── Scope and authority (static) ─────────────────────────────────────────────

describe('phase 11 · scope, authority and boundaries', () => {
  const loader = read('lib/os/review-queue.ts')
  const component = read('components/platform/vnext/ReviewQueue.tsx')
  const page = read('app/(platform)/approvals/page.tsx')

  it('reads through the RLS client — never the service-role client', () => {
    expect(loader).toMatch(/from '@\/lib\/supabase\/server'/)
    expect(loader).not.toMatch(/createAdminClient|supabase\/admin/)
    expect(page).not.toMatch(/createAdminClient|supabase\/admin/)
  })

  it('places every approval through its run, and every run through its project', () => {
    expect(loader).toMatch(/runs!inner/)
    expect(loader).toMatch(/projects!inner/)
    expect(loader).not.toMatch(/getAllowedProjectIds|scopeProjectFilter/)
  })

  it('the project filter narrows inside the owner scope and cannot widen it', () => {
    expect(loader).toMatch(/\.eq\('runs\.projects\.slug', slug\)/)
    // No path sets, replaces or defaults the project — narrowing only ever removes rows.
    expect(loader).not.toMatch(/allowedProjectIds|projects\[0\]|firstProject|\.single\(\)/)
  })

  it('decisions go to the existing route only — no second mutation path', () => {
    const fetches = component.match(/fetch\([^)]*\)/g) ?? []
    expect(fetches).toHaveLength(1)
    expect(fetches[0]).toMatch(/\/api\/approvals\/\$\{item\.id\}/)
    expect(component).toMatch(/method: 'PATCH'/)
    for (const forbidden of [/createClient/, /createAdminClient/, /from\('approvals'\)/, /rpc\(/, /'use server'/]) {
      expect(component, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('sends only the three actions the route accepts', () => {
    const shared = read('lib/os/review-queue-shared.ts')
    const actions = [...shared.matchAll(/action: '([a-z_]+)'/g)].map((m) => m[1])
    expect(actions.sort()).toEqual(['approved', 'rejected', 'revised'])
  })

  it('never renders a refused decision as success', () => {
    expect(component).toMatch(/if \(!res\.ok\)/)
    expect(component).toMatch(/res\.status === 409 \? 'stale' : 'error'/)
    // The success branch is only reachable after the !res.ok return above it.
    const handler = component.slice(component.indexOf('const decide ='), component.indexOf('if (!item.decidable)'))
    expect(handler.indexOf('if (!res.ok)')).toBeGreaterThan(-1)
    expect(handler.indexOf('if (!res.ok)')).toBeLessThan(handler.indexOf("setOutcome({ kind: 'done'"))
    expect(handler).toMatch(/return\n?\s*\}/)
  })

  it('writes no memory from the UI — the route already emits the canonical event', () => {
    for (const [name, src] of [['loader', loader], ['component', component], ['page', page]] as const) {
      expect(src, name).not.toMatch(/recordMemoryEvent|atlas\/memory/)
    }
  })

  it('adds no global keyboard router — key handling is bound to the list element', () => {
    expect(component).not.toMatch(/document\.addEventListener|window\.addEventListener/)
    expect(component).toMatch(/onKeyDown=\{onListKeyDown\}/)
  })

  it('navigates only through the registry', () => {
    expect(loader).toMatch(/resolveDestination\('project_home'/)
    expect(loader).toMatch(/resolveDestination\('approvals'\)/)
    expect(component).not.toMatch(/href="\/(approvals|projects)/)
    expect(destinationLabel('approvals')).toBe('Granskningar')
  })

  it('adds no endpoint, no migration and no schema change', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const changed = execSync('git diff --name-only origin/main HEAD; git status --porcelain --untracked-files=all | cut -c4-', {
      cwd: WEB_ROOT, encoding: 'utf8',
    }).split('\n').filter(Boolean)
    expect(changed.filter((f) => /supabase\/migrations|\.sql$/.test(f))).toEqual([])
    expect(changed.filter((f) => /^apps\/web\/app\/api\//.test(f))).toEqual([])
    expect(changed.filter((f) => /database\.types|packages\/db/.test(f))).toEqual([])
  })
})

// ── Rollback ─────────────────────────────────────────────────────────────────

describe('phase 11 · the legacy rollback is the page that shipped', () => {
  it('the legacy body is the previous page verbatim — pinned by hash', () => {
    const legacy = read('app/(platform)/approvals/ApprovalsLegacy.tsx')
    const body = legacy.slice(legacy.indexOf('import '))
    const hash = createHash('sha256').update(body).digest('hex')
    // Regenerate deliberately if the legacy page is ever intentionally changed.
    expect(hash).toBe('e07c443a999812fd796e7f3dd1df8bd3cdc2b3c6e2fd9d57d45ecd08815a1341')
  })

  it('the legacy component still renders the legacy queue, not the vNext one', () => {
    const legacy = read('app/(platform)/approvals/ApprovalsLegacy.tsx')
    expect(legacy).toMatch(/ApprovalCard/)
    expect(legacy).not.toMatch(/ReviewQueue/)
  })
})

// ── Layout contract (static) ─────────────────────────────────────────────────

describe('phase 11 · layout, scale and motion', () => {
  const css = read('components/platform/vnext/ReviewQueue.module.css')

  it('sizes in rem so the display-scale preference reaches it', () => {
    const pxFontSizes = css.match(/font-size:\s*\d+px/g) ?? []
    expect(pxFontSizes).toEqual([])
    expect(css).toMatch(/font-size: 0\.\d+rem/)
  })

  it('declares the surface font locally, as the other vNext surfaces do', () => {
    expect(css).toMatch(/font-family: var\(--font-geist-sans\)/)
  })

  it('gives the queue the dominant share at wide desktop and one column when narrow', () => {
    expect(css).toMatch(/grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\)/)
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
  })

  it('at 375px the queue leads and the selected item becomes the surface', () => {
    expect(css).toMatch(/@media \(max-width: 768px\)/)
    expect(css).toMatch(/\[data-detail='open'\] \.queue \{ display: none; \}/)
    expect(css).toMatch(/\[data-detail='closed'\] \.inspector \{ display: none; \}/)
    expect(css).toMatch(/overflow-x: hidden/)
  })

  it('respects reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
