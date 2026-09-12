/**
 * vNext Phase 12 — Systemhälsa (`/system`).
 *
 * Three risks carry this surface, and the suite is organised around them:
 *
 *   1. REPORTING HEALTH NOBODY STORES. The page this replaces computed
 *      `100 - failRate * 2`, printed it as "Optimal / Degraded / Critical" and
 *      drew a dial from it — so a platform with no runs read as perfectly well.
 *      Every state here must trace to a stored value or an explicit absence, and
 *      absence must never become green.
 *
 *   2. TOUCHING THE STOP AUTHORITY. This page carries the global execution stop.
 *      It may only be the EXISTING control calling the EXISTING server action,
 *      with the same scope, the same platform-operator gate and the same
 *      refusal behaviour. A second path, a renamed scope or an optimistic
 *      success would each be a new kill switch wearing the old one's clothes.
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
  assembleSystemHealth,
  SYSTEM_HEALTH_LIMITS,
  type AssembleSystemHealthInput,
  type RawProject,
  type RawRunLite,
  type SystemHealthModel,
} from '@/lib/os/system-health'
import { COMPONENT_STATE_LABELS, UNREADABLE_LABEL } from '@/lib/os/system-health-shared'
import { destinationLabel, resolveDestination } from '@/lib/nav/registry'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => '/system',
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => { throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` }) },
}))
vi.mock('@/app/actions/automation', () => ({
  toggleAutomationPause: async () => ({ ok: true, changed: true, paused: true }),
  toggleProjectExecutionPause: async () => ({ ok: true, changed: true, paused: true }),
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments explain which symbols this surface deliberately does NOT call, so
 *  every "must not reference" assertion reads the code without them. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = '2026-09-12T12:00:00.000Z'
const PROJECT_A: RawProject = {
  id: 'proj-a', name: 'Familje-Stunden', slug: 'familje-stunden',
  color: '#22d3ee', execution_paused: false, paused_at: null, paused_reason: null,
}
const PROJECT_B: RawProject = {
  id: 'proj-b', name: 'AI Media', slug: 'ai-media-automation',
  color: '#a855f7', execution_paused: true, paused_at: '2026-09-11T10:00:00.000Z',
  paused_reason: 'Incident i releasen',
}
const ALL_FLAGS = { fencing: true, cancel: true, policy_gate: true, unified_executor: true, spend_gate: true }

function input(over: Partial<AssembleSystemHealthInput> = {}): AssembleSystemHealthInput {
  return {
    now: NOW,
    platform: { ok: true, value: { automation_paused: false, paused_at: null, paused_reason: null } },
    safety: { flags: ALL_FLAGS, findings: [] },
    projects: { ok: true, rows: [PROJECT_A], count: 1 },
    openRuns: { ok: true, rows: [], count: 0 },
    recentRuns: { ok: true, rows: [], count: 0 },
    lastRunAt: { ok: true, value: null },
    pendingApprovals: { ok: true, value: 0 },
    approvalsByProject: { ok: true, rows: [], count: null },
    workflows: { ok: true, rows: [], count: 0 },
    dreamIssues: { ok: true, rows: [], count: 0 },
    legacyMemories: { ok: true, value: 12 },
    ...over,
  }
}
const model = (over: Partial<AssembleSystemHealthInput> = {}) => assembleSystemHealth(input(over))
const stateOf = (m: SystemHealthModel, id: string) => m.components.find((c) => c.id === id)?.state
const run = (over: Partial<RawRunLite> = {}): RawRunLite =>
  ({ id: 'run-1', project_id: 'proj-a', status: 'running', created_at: NOW, ...over })

async function html(m: SystemHealthModel): Promise<string> {
  const { SystemHealth } = await import('@/components/platform/vnext/SystemHealth')
  return renderToStaticMarkup(createElement(SystemHealth, { model: m }))
}

// ── No invented health ───────────────────────────────────────────────────────

describe('phase 12 · the model reports states, never a score', () => {
  it('carries no health score, percentage or grade anywhere in the model', () => {
    const m = model()
    const blob = JSON.stringify(m)
    for (const invented of ['systemHealth', 'healthScore', 'successRate', 'failRate', 'Optimal', 'Degraded', 'confidence', 'score']) {
      expect(blob, invented).not.toContain(invented)
    }
    expect(Object.keys(m)).not.toContain('health')
  })

  it('an empty platform is idle — never "healthy" and never a perfect number', () => {
    const m = model()
    expect(stateOf(m, 'runs')).toBe('idle')
    expect(m.components.map((c) => c.state)).not.toContain('healthy' as never)
    expect(Object.values(COMPONENT_STATE_LABELS)).not.toContain('Frisk')
  })

  it('names every component it knows, and no others', () => {
    expect(model().components.map((c) => c.id)).toEqual([
      'execution', 'safety', 'projects', 'runs', 'approvals', 'automation', 'dream', 'memory',
    ])
  })
})

// ── Execution stop ───────────────────────────────────────────────────────────

describe('phase 12 · the execution stop is reported exactly as stored', () => {
  it('a stored global stop is stopped, with its reason', () => {
    const m = model({ platform: { ok: true, value: { automation_paused: true, paused_at: NOW, paused_reason: 'Incident' } } })
    expect(m.platform).toMatchObject({ readable: true, stopped: true, pausedReason: 'Incident' })
    expect(stateOf(m, 'execution')).toBe('stopped')
    expect(m.warnings.find((w) => w.id === 'platform-stopped')).toMatchObject({ tone: 'stop' })
  })

  it('an unreadable stop flag is NOT "not stopped"', () => {
    const m = model({ platform: { ok: false } })
    expect(m.platform).toMatchObject({ readable: false, stopped: false })
    expect(stateOf(m, 'execution')).toBe('unavailable')
    expect(m.warnings.find((w) => w.id === 'platform-unreadable')).toMatchObject({ tone: 'unreadable' })
    // and it must never be reported as a clean bill of health
    expect(m.warnings.some((w) => w.tone === 'stop')).toBe(false)
  })

  it('the global stop comes from platform_config alone — no other failure may set it', () => {
    // A kill switch that can be inferred from a neighbouring read is not a kill
    // switch: every other source is broken here, and the global state stays
    // exactly what platform_config said.
    const m = model({
      projects: { ok: false }, openRuns: { ok: false }, recentRuns: { ok: false },
      workflows: { ok: false }, dreamIssues: { ok: false },
      legacyMemories: { ok: false }, pendingApprovals: { ok: false },
    })
    expect(m.platform).toMatchObject({ readable: true, stopped: false })
    expect(m.warnings.some((w) => w.id === 'platform-stopped')).toBe(false)
    expect(stateOf(m, 'execution')).toBe('idle')
    // …and the reverse: a stored stop survives every other source failing.
    const stopped = model({
      platform: { ok: true, value: { automation_paused: true, paused_at: null, paused_reason: null } },
      projects: { ok: false }, openRuns: { ok: false }, recentRuns: { ok: false },
    })
    expect(stopped.platform.stopped).toBe(true)
    expect(stateOf(stopped, 'execution')).toBe('stopped')
  })

  it('a project stop is its own state, with its own reason, and never implies the global one', () => {
    const m = model({ projects: { ok: true, rows: [PROJECT_A, PROJECT_B], count: 2 } })
    expect(stateOf(m, 'projects')).toBe('stopped')
    expect(m.platform.stopped).toBe(false)
    const row = m.projects.rows.find((p) => p.slug === 'ai-media-automation')!
    expect(row).toMatchObject({ paused: true, pausedReason: 'Incident i releasen' })
    expect(m.warnings.find((w) => w.id === `project-stopped:proj-b`)).toMatchObject({ tone: 'stop' })
  })
})

// ── Safety flags ─────────────────────────────────────────────────────────────

describe('phase 12 · safety flags are the runtime predicates, never raw values', () => {
  it('reports each flag as a boolean and flags the unsafe ones', () => {
    const m = model({ safety: { flags: { ...ALL_FLAGS, cancel: false }, findings: ['cancel'] } })
    expect(m.safety.flags).toContainEqual({ id: 'cancel', on: false })
    expect(stateOf(m, 'safety')).toBe('attention')
    expect(m.warnings.find((w) => w.id === 'safety-flags')?.detail).toBe('cancel')
  })

  it('all flags on is idle, not a claim about the rest of the system', () => {
    const m = model()
    expect(stateOf(m, 'safety')).toBe('idle')
    expect(m.warnings.some((w) => w.id === 'safety-flags')).toBe(false)
  })
})

// ── Runs, approvals, projects ────────────────────────────────────────────────

describe('phase 12 · runtime counts come from stored rows in a named window', () => {
  it('running work is active; a failure in the window needs attention', () => {
    expect(stateOf(model({ openRuns: { ok: true, rows: [run()], count: 1 } }), 'runs')).toBe('active')
    const failed = model({ recentRuns: { ok: true, rows: [run({ status: 'failed' })], count: 1 } })
    expect(stateOf(failed, 'runs')).toBe('attention')
    expect(failed.execution.failed24h).toBe(1)
    expect(failed.warnings.find((w) => w.id === 'runs-failed')).toBeTruthy()
  })

  it('an unreadable run source is unavailable — never zero runs', () => {
    const m = model({ openRuns: { ok: false }, recentRuns: { ok: false } })
    expect(stateOf(m, 'runs')).toBe('unavailable')
    expect(m.execution).toMatchObject({ state: 'error', running: null, failed24h: null })
    expect(m.warnings.some((w) => w.tone === 'unreadable')).toBe(true)
  })

  it('pending approvals are counted and surfaced with a link to the queue', () => {
    const m = model({ pendingApprovals: { ok: true, value: 3 } })
    expect(stateOf(m, 'approvals')).toBe('attention')
    expect(m.warnings.find((w) => w.id === 'approvals-pending')?.href).toBe(resolveDestination('approvals')?.href)
  })

  it('per-project counts come from the same stored rows, placed by project', () => {
    const m = model({
      projects: { ok: true, rows: [PROJECT_A, PROJECT_B], count: 2 },
      openRuns: { ok: true, rows: [run({ id: 'r1' }), run({ id: 'r2', project_id: 'proj-b' })], count: 2 },
      recentRuns: { ok: true, rows: [run({ id: 'r3', status: 'failed', project_id: 'proj-b' })], count: 1 },
      approvalsByProject: { ok: true, rows: [{ project_id: 'proj-b' }, { project_id: 'proj-b' }], count: null },
    })
    const a = m.projects.rows.find((p) => p.id === 'proj-a')!
    const b = m.projects.rows.find((p) => p.id === 'proj-b')!
    expect(a).toMatchObject({ runsRunning: 1, runsFailed24h: 0, pendingApprovals: 0 })
    expect(b).toMatchObject({ runsRunning: 1, runsFailed24h: 1, pendingApprovals: 2 })
    expect(a.href).toBe(resolveDestination('project_home', { project: 'familje-stunden' })?.href)
  })

  it('a project with no name or slug is dropped rather than guessed at', () => {
    const m = model({ projects: { ok: true, rows: [{ id: 'x' } as RawProject], count: 1 } })
    expect(m.projects.rows).toEqual([])
  })
})

// ── Automation, Dream, Memory ────────────────────────────────────────────────

describe('phase 12 · what Omnira does not observe says so', () => {
  it('automation reports configuration and refuses to claim liveness', () => {
    const m = model({
      workflows: { ok: true, count: 1, rows: [{ id: 'w1', name: 'Nattlig', project_id: 'proj-a', active: true, trigger: 'cron', cron_expr: '0 0 * * *' }] },
    })
    expect(stateOf(m, 'automation')).toBe('unknown')
    expect(m.automation.rows[0]).toMatchObject({ active: true, trigger: 'cron', cronExpr: '0 0 * * *', projectSlug: 'familje-stunden' })
    expect(m.components.find((c) => c.id === 'automation')?.detail).toContain('observeras inte')
  })

  it('memory reports the legacy store only, and says M4 is not read here', () => {
    const m = model()
    expect(stateOf(m, 'memory')).toBe('unknown')
    expect(m.memory.legacyRows).toBe(12)
    expect(JSON.stringify(m)).not.toMatch(/memory_events|ATLAS_MEMORY|readMemoryFlags/)
  })

  it('dream findings are read from the ledger, with severities normalised', () => {
    const m = model({
      dreamIssues: { ok: true, count: 2, rows: [
        { id: 'd1', project_id: 'proj-a', issue_id: 'alerting_missing', severity: 'CRITICAL', occurrences: 68, last_seen_at: NOW, manager_task_id: 't1' },
        { id: 'd2', project_id: 'proj-a', issue_id: 'perfect_run_rate', severity: 'nonsense', occurrences: 97, last_seen_at: NOW, manager_task_id: null },
      ] },
    })
    expect(m.dream.rows[0]).toMatchObject({ slug: 'alerting_missing', severity: 'critical', occurrences: 68, delegated: true })
    expect(m.dream.rows[1].severity).toBe('info')
    expect(stateOf(m, 'dream')).toBe('attention')
    expect(m.warnings.find((w) => w.id === 'dream:d1')).toMatchObject({ tone: 'attention' })
  })

  it.each([
    ['projects', { projects: { ok: false } as const }],
    ['workflows', { workflows: { ok: false } as const }],
    ['dreamIssues', { dreamIssues: { ok: false } as const }],
    ['legacyMemories', { legacyMemories: { ok: false } as const }],
    ['pendingApprovals', { pendingApprovals: { ok: false } as const }],
  ])('an unreadable %s source is unavailable and warned about — never empty', (_label, over) => {
    const m = model(over as Partial<AssembleSystemHealthInput>)
    expect(m.warnings.some((w) => w.tone === 'unreadable')).toBe(true)
    expect(m.components.some((c) => c.state === 'unavailable')).toBe(true)
  })

  it('a calm system produces no invented warnings', () => {
    expect(model().warnings).toEqual([])
  })
})

// ── Rendering ────────────────────────────────────────────────────────────────

describe('phase 12 · the surface renders stored truth', () => {
  it('renders every component with its state word', async () => {
    const out = await html(model())
    expect(out).toContain('Systemhälsa')
    for (const label of ['Exekvering', 'Säkerhetsflaggor', 'Projektstopp', 'Körningar', 'Granskningar', 'Automatisering', 'Dream', 'Minne']) {
      expect(out, label).toContain(label)
    }
    expect(out).toContain(COMPONENT_STATE_LABELS.idle)
  })

  it('shows no gauge, dial, percentage or health grade', async () => {
    const out = await html(model({ recentRuns: { ok: true, rows: [run({ status: 'failed' })], count: 4 } }))
    for (const word of ['Optimal', 'Degraded', 'Critical', '%', 'RadialDial', 'Sparkline', 'ConfidenceMeter']) {
      expect(out, word).not.toContain(word)
    }
  })

  it('an unreadable source is stated, never rendered as calm', async () => {
    const out = await html(model({ projects: { ok: false }, openRuns: { ok: false }, recentRuns: { ok: false } }))
    expect(out).toContain(UNREADABLE_LABEL.toLowerCase())
    expect(out).not.toContain('Inga lagrade tillstånd kräver åtgärd')
  })

  it('a calm system says what that means, without claiming health', async () => {
    const out = await html(model())
    expect(out).toContain('Inga lagrade tillstånd kräver åtgärd')
    expect(out).toContain('inte ett omdöme om hälsa')
  })

  it('the global stop control is present with the stored state beside it', async () => {
    const stopped = await html(model({ platform: { ok: true, value: { automation_paused: true, paused_at: NOW, paused_reason: 'Incident' } } }))
    expect(stopped).toContain('Stoppad')
    expect(stopped).toContain('Återuppta exekvering')   // the existing control's own copy
    expect(stopped).toContain('Incident')
    const running = await html(model())
    expect(running).toContain('Stoppa exekvering')
  })

  it('an unreadable stop flag is shown as unreadable, not as "not stopped"', async () => {
    const out = await html(model({ platform: { ok: false } }))
    expect(out).toContain(UNREADABLE_LABEL)
    expect(out).toContain('Okänt betyder inte')
  })

  it('each project carries its own stop control and stored reason', async () => {
    const out = await html(model({ projects: { ok: true, rows: [PROJECT_A, PROJECT_B], count: 2 } }))
    expect(out).toContain('Incident i releasen')
    expect(out.match(/Stoppa exekvering|Återuppta/g)?.length).toBeGreaterThan(1)
  })

  it('the loading state is distinct from empty and from unreadable', async () => {
    const { SystemHealthLoading } = await import('@/components/platform/vnext/SystemHealth')
    const out = renderToStaticMarkup(createElement(SystemHealthLoading))
    expect(out).toContain('Läser systemets tillstånd')
    expect(out).not.toContain('Inga lagrade tillstånd')
    expect(out).not.toContain(UNREADABLE_LABEL.toLowerCase())
  })

  it('keeps diagnostics collapsed behind a disclosure', async () => {
    const out = await html(model())
    expect(out).toMatch(/<details[^>]*>/)
    expect(out).toContain('Tekniska detaljer')
    expect(out).not.toMatch(/<details[^>]*\sopen/)
  })
})

// ── Generation ───────────────────────────────────────────────────────────────

describe('phase 12 · generation', () => {
  const loadSpy = vi.fn(async () => model())
  let cookieValue: string | null = null

  beforeEach(() => {
    vi.resetModules()
    loadSpy.mockClear()
    cookieValue = null
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookieValue && n === 'omnira_ui' ? { value: cookieValue } : undefined) }),
    }))
    vi.doMock('@/lib/os/system-health', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/system-health')>()),
      loadSystemHealth: loadSpy,
    }))
    vi.doMock('@/app/(platform)/system/SystemLegacy', () => ({
      SystemLegacy: () => createElement('div', { id: 'legacy-body' }),
    }))
  })

  it('renders vNext by default', async () => {
    const { default: Page } = await import('@/app/(platform)/system/page')
    const element = await Page() as React.ReactElement
    expect(element.type).toBe(React.Suspense)
    const inner = (element.props as { children: React.ReactElement }).children
    expect((inner.type as { name?: string }).name).toBe('LoadedSystemHealth')
  })

  it('`?ui=legacy` renders the legacy body', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/system/page')
    expect(renderToStaticMarkup(await Page() as React.ReactElement)).toContain('legacy-body')
  })

  it('the legacy branch never runs the vNext loader', async () => {
    cookieValue = 'legacy'
    const { default: Page } = await import('@/app/(platform)/system/page')
    renderToStaticMarkup(await Page() as React.ReactElement)
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('an unresolvable scope is a redirect, never a page of zeroes', async () => {
    loadSpy.mockResolvedValueOnce(null as unknown as SystemHealthModel)
    const { default: Page } = await import('@/app/(platform)/system/page')
    const element = await Page() as React.ReactElement
    const inner = (element.props as { children: React.ReactElement }).children
    await expect((inner.type as (p: unknown) => Promise<unknown>)(inner.props)).rejects.toThrow(/NEXT_REDIRECT/)
  })
})

// ── The loader, executed ─────────────────────────────────────────────────────

describe('phase 12 · the loader reads inside the operator boundary', () => {
  interface Recorded { table: string; select: string; filters: [string, unknown][] }
  let queries: Recorded[]
  let allowed: string[]
  let accessOk: boolean

  function fakeQuery(table: string) {
    const rec: Recorded = { table, select: '', filters: [] }
    queries.push(rec)
    const api: Record<string, unknown> = {
      select(select: string) { rec.select = select; return api },
      eq(c: string, v: unknown) { rec.filters.push([`eq:${c}`, v]); return api },
      in(c: string, v: unknown) { rec.filters.push([`in:${c}`, v]); return api },
      gte(c: string, v: unknown) { rec.filters.push([`gte:${c}`, v]); return api },
      order() { return api },
      limit() { return api },
      single() { return Promise.resolve({ data: {}, error: null }) },
      maybeSingle() { return Promise.resolve({ data: null, error: null }) },
      then(ok: (v: unknown) => unknown) { return Promise.resolve({ data: [], error: null, count: 0 }).then(ok) },
    }
    return api
  }

  beforeEach(() => {
    vi.doUnmock('@/lib/os/system-health')
    vi.doUnmock('@/app/(platform)/system/SystemLegacy')
    vi.doUnmock('next/headers')
    vi.resetModules()
    queries = []
    allowed = ['proj-a', 'proj-b']
    accessOk = true
    vi.doMock('@/lib/auth/project-access', () => ({
      resolveProjectAccess: async () => (accessOk
        ? { ok: true, userId: 'u1', allowedProjectIds: allowed }
        : { ok: false, response: null }),
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fakeQuery }) }))
  })

  it('resolves the operator scope first and hands it to every project read', async () => {
    const { loadSystemHealth } = await import('@/lib/os/system-health')
    const m = await loadSystemHealth()
    expect(m).not.toBeNull()
    const scoped = queries.filter((q) => ['projects', 'runs', 'workflows', 'dream_issues', 'memories'].includes(q.table))
    expect(scoped.length).toBeGreaterThan(0)
    for (const q of scoped) {
      const names = q.filters.map(([k]) => k)
      expect(names.some((n) => n.startsWith('in:')), q.table).toBe(true)
      const scopeFilter = q.filters.find(([k]) => k.startsWith('in:'))!
      expect(scopeFilter[1]).toEqual(allowed)
    }
  })

  it('an unresolvable scope returns null rather than a global read', async () => {
    accessOk = false
    const { loadSystemHealth } = await import('@/lib/os/system-health')
    expect(await loadSystemHealth()).toBeNull()
    expect(queries).toEqual([])
  })

  it('an operator owning nothing gets an impossible id, never every project', async () => {
    allowed = []
    const { loadSystemHealth } = await import('@/lib/os/system-health')
    await loadSystemHealth()
    const projects = queries.find((q) => q.table === 'projects')!
    const scope = projects.filters.find(([k]) => k === 'in:id')![1] as string[]
    expect(scope).toHaveLength(1)
    expect(scope[0]).not.toBe('proj-a')
  })

  it('counts pending approvals through the run, never through approvals.project_id', async () => {
    const { loadSystemHealth } = await import('@/lib/os/system-health')
    await loadSystemHealth()
    const approvals = queries.filter((q) => q.table === 'approvals')
    expect(approvals.length).toBeGreaterThan(0)
    for (const q of approvals) {
      expect(q.select).toMatch(/runs!inner/)
      expect(q.filters).toContainEqual(['eq:status', 'pending'])
      expect(q.filters.some(([k]) => k === 'in:runs.project_id')).toBe(true)
      expect(q.filters.some(([k]) => k === 'in:project_id')).toBe(false)
    }
  })

  it('reads the platform stop itself rather than through the ?? false helper', async () => {
    const { loadSystemHealth } = await import('@/lib/os/system-health')
    await loadSystemHealth()
    const platform = queries.find((q) => q.table === 'platform_config')
    expect(platform?.select).toMatch(/automation_paused/)
    expect(codeOnly(read('lib/os/system-health.ts'))).not.toMatch(/getPlatformConfig/)
  })
})

// ── Authority, scope and boundaries (static) ─────────────────────────────────

describe('phase 12 · authority is preserved, never re-created', () => {
  const loader = read('lib/os/system-health.ts')
  const component = read('components/platform/vnext/SystemHealth.tsx')
  const page = read('app/(platform)/system/page.tsx')
  const pauseToggle = read('components/platform/PauseToggle.tsx')

  it('the global stop is the existing control calling the existing server action', () => {
    expect(component).toMatch(/import \{ PauseToggle \} from '@\/components\/platform\/PauseToggle'/)
    expect(component).toMatch(/<PauseToggle paused=\{platform\.stopped\} \/>/)
    expect(pauseToggle).toMatch(/toggleAutomationPause/)
    // No second implementation, no direct call, no rescoping from this surface.
    expect(codeOnly(component)).not.toMatch(/toggleAutomationPause|setPlatformAutomationStop|automation_paused/)
  })

  it('the project stop is the existing control too', () => {
    expect(component).toMatch(/import \{ ProjectPauseToggle \} from '@\/components\/platform\/ProjectPauseToggle'/)
    expect(codeOnly(component)).not.toMatch(/toggleProjectExecutionPause|setProjectExecutionStop/)
  })

  it('this surface writes nothing: no action, no fetch, no client database', () => {
    for (const [name, src] of [['loader', loader], ['component', component], ['page', page]] as const) {
      expect(codeOnly(src), name).not.toMatch(/'use server'|fetch\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/)
    }
    expect(component).not.toMatch(/'use client'/)
  })

  it('writes no memory and triggers no Dream', () => {
    for (const [name, src] of [['loader', loader], ['component', component], ['page', page]] as const) {
      expect(codeOnly(src), name).not.toMatch(/recordMemoryEvent|atlas\/memory|runDreamCycleForProject|lib\/ai\/dream/)
    }
    expect(loader).toMatch(/from\('dream_issues'\)/)  // read-only, the ledger
  })

  it('navigates only through the registry', () => {
    expect(loader).toMatch(/resolveDestination\('approvals'\)/)
    expect(loader).toMatch(/resolveDestination\('project_home'/)
    expect(codeOnly(component)).not.toMatch(/href="\/(system|projects|approvals)/)
    expect(destinationLabel('health')).toBe('Systemhälsa')
    expect(resolveDestination('health')?.href).toBe('/system')
  })

  it('adds no global keyboard router', () => {
    expect(codeOnly(component)).not.toMatch(/addEventListener|onKeyDown|useEffect/)
  })

  it('adds no endpoint, migration or schema change', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const changed = execSync('git diff --name-only origin/main HEAD; git status --porcelain --untracked-files=all | cut -c4-', {
      cwd: WEB_ROOT, encoding: 'utf8',
    }).split('\n').filter(Boolean)
    expect(changed.filter((f) => /supabase\/migrations|\.sql$/.test(f))).toEqual([])
    expect(changed.filter((f) => /^apps\/web\/app\/api\//.test(f))).toEqual([])
    expect(changed.filter((f) => /database\.types|packages\/db/.test(f))).toEqual([])
    expect(changed.filter((f) => /app\/actions\/automation|PauseToggle|execution-stop|platform-operator/.test(f))).toEqual([])
  })
})

// ── Rollback ─────────────────────────────────────────────────────────────────

describe('phase 12 · the legacy rollback is the page that shipped', () => {
  it('the legacy body is the previous page verbatim — pinned by hash', () => {
    const legacy = read('app/(platform)/system/SystemLegacy.tsx')
    const body = legacy.slice(legacy.indexOf('import '))
    expect(createHash('sha256').update(body).digest('hex')).toBe('141e8a6c8b3425bf649210a0a73ee0ccececa24489445100f7eb4af0337a73b8')
  })

  it('the legacy body keeps its own instruments; the vNext surface has none of them', () => {
    const legacy = read('app/(platform)/system/SystemLegacy.tsx')
    expect(legacy).toMatch(/RadialDial|Sparkline/)
    expect(legacy).toMatch(/systemHealth/)
    expect(read('components/platform/vnext/SystemHealth.tsx')).not.toMatch(/RadialDial|Sparkline|systemHealth/)
  })
})

// ── Layout contract (static) ─────────────────────────────────────────────────

describe('phase 12 · layout, scale and motion', () => {
  const css = read('components/platform/vnext/SystemHealth.module.css')

  it('sizes in rem so the display-scale preference reaches it', () => {
    expect(css.match(/font-size:\s*\d+px/g) ?? []).toEqual([])
    expect(css).toMatch(/font-size: 0\.\d+rem/)
  })

  it('declares the surface font locally, as the other vNext surfaces do', () => {
    expect(css).toMatch(/font-family: var\(--font-geist-sans\)/)
  })

  it('keeps the safety area visually set apart from monitoring', () => {
    expect(css).toMatch(/\.panel\[data-safety='true'\]/)
    expect(read('components/platform/vnext/SystemHealth.tsx')).toMatch(/data-safety="true"/)
  })

  it('collapses to one column when narrow and never scrolls sideways', () => {
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
    expect(css).toMatch(/overflow-x: hidden/)
  })

  it('at 375px the stop control gets its own line rather than sitting beside its state', () => {
    expect(css).toMatch(/@media \(max-width: 768px\)/)
    expect(css).toMatch(/\.stopRow \{ flex-direction: column;/)
  })

  it('respects reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
