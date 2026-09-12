/**
 * Atlas Memory Slice 2B-2 — Dream producers.
 *
 * Dream analyses one project per cycle and stamps its findings onto the stable
 * issue ledger (`dream_issues`). Almost every night that ledger only says "the
 * same problems are still here": occurrences++, last_seen bumped, wording
 * restated. Those nights are worth nothing to memory, so this slice records ONLY
 * what actually changed, and only after Postgres stored it:
 *
 *   • a new issue          → `<issue id>:first_seen`                 (once, ever)
 *   • a severity change    → `<issue id>:severity:<new>:<UTC date>`
 *   • the cycle summary    → `<project id>:<UTC date>`, gated on the two above
 *
 * The severity key carries the cycle date deliberately. Cron, a manual run and
 * any retry inside one UTC day collapse to a single event, while a genuine later
 * transition back to a severity the issue held before stays visible — a lifetime
 * `:severity:<new>` key would swallow it.
 *
 * The REAL recordMemoryEvent runs (ATLAS_MEMORY=1). The wrapper double answers on
 * a later tick, so an event is only stored if the producer awaited it, and it
 * mirrors the two database rules that matter — the (source, source_id,
 * event_type) unique index and the project-scope CHECK — which are proven against
 * real Postgres by atlas-memory-emit-idempotency-sql.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectScope } from '../governance/execution-stop'
import { runDreamCycleForProject } from '../ai/dream'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ── M4 wrapper double ────────────────────────────────────────────────────────

interface StoredEvent {
  source: unknown; source_id: unknown; event_type: unknown; scope: unknown
  project_id: unknown; entity_kind: unknown; entity_id: unknown
  subject: unknown; content: unknown; confidence: unknown
  structured: Record<string, unknown>
}
let memoryEvents: StoredEvent[]
let wrapperFault: 'none' | 'error' | 'throw'
const WRAPPER_LATENCY_MS = 25

async function atlasRecordEvent(p: Record<string, unknown>) {
  await new Promise((r) => setTimeout(r, WRAPPER_LATENCY_MS))
  if (wrapperFault === 'throw') throw new Error('connection reset by peer')
  if (wrapperFault === 'error') return { data: null, error: { message: 'wrapper unavailable' } }
  if ((p.p_scope === 'project') !== (p.p_project_id != null)) {
    return { data: null, error: { message: 'violates check constraint "memory_events_project_scope"' } }
  }
  if (p.p_source_id != null && memoryEvents.some((e) =>
    e.source === p.p_source && e.source_id === p.p_source_id && e.event_type === p.p_event_type)) {
    return { data: null, error: null }
  }
  memoryEvents.push({
    source: p.p_source, source_id: p.p_source_id, event_type: p.p_event_type, scope: p.p_scope,
    project_id: p.p_project_id, entity_kind: p.p_entity_kind, entity_id: p.p_entity_id,
    subject: p.p_subject, content: p.p_content, confidence: p.p_confidence,
    structured: (p.p_structured ?? {}) as Record<string, unknown>,
  })
  return { data: `evt-${memoryEvents.length}`, error: null }
}

// ── Dream harness ────────────────────────────────────────────────────────────

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SLUG = 'ai-media-automation'
const CRON = 'cron-secret-under-test'
const DAY_1 = '2026-09-12T00:00:11.000Z'

interface IssueRow {
  id: string; project_id: string; issue_id: string; title: string | null
  severity: string | null; latest_insight: string | null; latest_action: string | null
  latest_memory_key: string | null; occurrences: number
  first_seen_at: string; last_seen_at: string; updated_at: string
}

let issues: IssueRow[]
let issueSeq: number
let legacyMemories: Record<string, unknown>[]
let runsRows: Record<string, unknown>[]
let projectsRows: { id: string; name: string; slug: string }[]
let legacyUpsertFails: boolean
let insertFaultSlugs: Set<string>
let updateFaultSlugs: Set<string>
/** Slugs whose insert loses the (project_id, issue_id) race to another writer. */
let raceLostSlugs: Set<string>
let modelInsights: Record<string, unknown>[]
let modelFault: 'none' | 'throw' | 'invalid'
let modelCalls: number

function insight(slug: string, severity: string, value = `finding about ${slug}`) {
  return { key: `dream_20260912_${slug}`, issue_id: slug, value, severity, action: `fix ${slug}` }
}

function seedIssue(slug: string, severity: string, occurrences = 3, project = PROJECT): IssueRow {
  const row: IssueRow = {
    id: `issue-${++issueSeq}`, project_id: project, issue_id: slug, title: `known ${slug}`,
    severity, latest_insight: `known ${slug}`, latest_action: 'fix', latest_memory_key: 'dream_old',
    occurrences, first_seen_at: '2026-06-08T00:00:00.000Z', last_seen_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
  }
  issues.push(row)
  return row
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private mode: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select'
  private filters: Record<string, unknown> = {}
  private payload: Record<string, unknown> | null = null
  constructor(private readonly table: string) {}
  select() { return this }
  insert(v: Record<string, unknown>) { this.mode = 'insert'; this.payload = v; return this }
  update(v: Record<string, unknown>) { this.mode = 'update'; this.payload = v; return this }
  upsert(v: Record<string, unknown>) { this.mode = 'upsert'; this.payload = v; return this }
  delete() { this.mode = 'delete'; return this }
  eq(c: string, v: unknown) { this.filters[c] = v; return this }
  gte() { return this }
  in() { return this }
  like() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return this.run() }
  single() { return this.run() }
  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    ok?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> { return this.run().then(ok, bad) }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    switch (this.table) {
      case 'projects': {
        if (this.filters.slug != null) {
          const row = projectsRows.find((p) => p.slug === this.filters.slug) ?? null
          return { data: row, error: row ? null : { message: 'not found' } }
        }
        return { data: projectsRows, error: null }
      }
      case 'runs':
        return { data: runsRows, error: null }
      case 'run_logs':
        return { data: [], error: null }
      case 'memories': {
        if (this.mode === 'upsert') {
          if (legacyUpsertFails) return { data: null, error: { message: 'legacy memory upsert failed' } }
          legacyMemories.push(this.payload ?? {})
          return { data: null, error: null }
        }
        if (this.mode === 'delete') return { data: null, error: null }
        return { data: legacyMemories, error: null }
      }
      case 'dream_issues': {
        if (this.mode === 'insert') {
          const slug = String(this.payload?.issue_id)
          if (insertFaultSlugs.has(slug)) return { data: null, error: { message: 'insert failed' } }
          const taken = raceLostSlugs.has(slug) ||
            issues.some((i) => i.project_id === this.payload?.project_id && i.issue_id === slug)
          if (taken) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dream_issues_project_id_issue_id_key"' } }
          }
          const now = new Date().toISOString()
          const row: IssueRow = {
            id: `issue-${++issueSeq}`, project_id: String(this.payload?.project_id), issue_id: slug,
            title: (this.payload?.title as string) ?? null, severity: (this.payload?.severity as string) ?? null,
            latest_insight: (this.payload?.latest_insight as string) ?? null,
            latest_action: (this.payload?.latest_action as string) ?? null,
            latest_memory_key: (this.payload?.latest_memory_key as string) ?? null,
            occurrences: 1, first_seen_at: now, last_seen_at: now, updated_at: now,
          }
          issues.push(row)
          return { data: row, error: null }
        }
        if (this.mode === 'update') {
          const row = issues.find((i) => i.id === this.filters.id)
          if (!row) return { data: null, error: { message: 'row missing' } }
          if (updateFaultSlugs.has(row.issue_id)) return { data: null, error: { message: 'update failed' } }
          Object.assign(row, this.payload)
          return { data: { id: row.id, severity: row.severity }, error: null }
        }
        if (this.filters.issue_id != null) {
          const row = issues.find((i) => i.project_id === this.filters.project_id && i.issue_id === this.filters.issue_id) ?? null
          return { data: row, error: null }
        }
        return { data: issues.filter((i) => i.project_id === this.filters.project_id), error: null }
      }
      default:
        throw new Error(`unexpected table: ${this.table}`)
    }
  }
}

const fakeDb = {
  from: (t: string) => new QueryBuilder(t),
  rpc: async (name: string, params: Record<string, unknown>) =>
    name === 'atlas_record_event' ? atlasRecordEvent(params) : { data: null, error: null },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (t: string) => new QueryBuilder(t),
  }),
}))
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({
    messages: {
      create: async () => {
        modelCalls++
        if (modelFault === 'throw') throw new Error('spend gate refused this call')
        const text = modelFault === 'invalid'
          ? 'I could not analyse anything tonight.'
          : JSON.stringify({ insights: modelInsights, agent_suggestions: [], summary: 'Systemet mår bra.' })
        return { content: [{ type: 'text', text }], stop_reason: 'end_turn' }
      },
    },
  }),
}))

async function runCycle(project: { id: string; name: string } = { id: PROJECT, name: 'AI Media' }) {
  return runDreamCycleForProject(
    { context: 'AUTONOMOUS' as const, scope: projectScope({ projectId: project.id }) },
    project,
  )
}

const firstSeenEvents = () => memoryEvents.filter((e) => /:first_seen$/.test(String(e.source_id)))
const severityEvents = () => memoryEvents.filter((e) => /:severity:/.test(String(e.source_id)))
const summaryEvents = () => memoryEvents.filter((e) => e.entity_kind === 'project')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(DAY_1))
  memoryEvents = []
  wrapperFault = 'none'
  issues = []
  issueSeq = 0
  legacyMemories = []
  runsRows = [{ id: 'run-1', status: 'done', error: null, created_at: DAY_1, workflows: { name: 'daily' } }]
  projectsRows = [{ id: PROJECT, name: 'AI Media', slug: SLUG }]
  legacyUpsertFails = false
  insertFaultSlugs = new Set()
  updateFaultSlugs = new Set()
  raceLostSlugs = new Set()
  modelInsights = []
  modelFault = 'none'
  modelCalls = 0
  process.env.ATLAS_MEMORY = '1'
  process.env.CRON_SECRET = CRON
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.ATLAS_MEMORY
  delete process.env.CRON_SECRET
})

// ── New issues ───────────────────────────────────────────────────────────────

describe('2B-2 · Dream — a newly created issue', () => {
  it('records one first-seen reflection, keyed by the stored issue id', async () => {
    modelInsights = [insight('token_expiry_unhandled', 'critical')]
    const result = await runCycle()

    expect(result.ran).toBe(true)
    const stored = issues.find((i) => i.issue_id === 'token_expiry_unhandled')!
    expect(stored).toBeTruthy()
    expect(firstSeenEvents()).toHaveLength(1)
    const [event] = firstSeenEvents()
    expect(event.source).toBe('dream')
    expect(event.source_id).toBe(`${stored.id}:first_seen`)
    expect(event.event_type).toBe('reflection')
    expect(event.scope).toBe('project')
    expect(event.project_id).toBe(PROJECT)
    expect(event.entity_kind).toBe('dream_issue')
    expect(event.entity_id).toBe(stored.id)
    expect(event.confidence).toBe(0.50)
    expect(event.structured).toMatchObject({
      issueId: stored.id, issueSlug: 'token_expiry_unhandled', severity: 'critical',
      occurrences: 1, cycleDate: '2026-09-12',
    })
  })

  it('a known issue seen again records nothing at all', async () => {
    seedIssue('step_logs_missing', 'critical')
    modelInsights = [insight('step_logs_missing', 'critical')]
    await runCycle()

    expect(memoryEvents).toEqual([])
  })

  it('an occurrence increment alone records nothing', async () => {
    const known = seedIssue('perfect_run_rate', 'info', 96)
    modelInsights = [insight('perfect_run_rate', 'info', 'still a perfect run rate tonight')]
    await runCycle()

    expect(issues.find((i) => i.id === known.id)!.occurrences).toBe(97)
    expect(memoryEvents).toEqual([])
  })

  it('a restated title with the same severity records nothing', async () => {
    seedIssue('alerting_missing', 'warning')
    modelInsights = [insight('alerting_missing', 'WARNING', 'alerting is, once again, entirely absent')]
    await runCycle()

    expect(memoryEvents).toEqual([])
  })

  it('the same issue named twice in one answer is one ledger write and one event', async () => {
    modelInsights = [insight('ig_self_account_id', 'warning'), insight('ig_self_account_id', 'critical', 'worse than it looked')]
    await runCycle()

    expect(issues.filter((i) => i.issue_id === 'ig_self_account_id')).toHaveLength(1)
    expect(issues[0].occurrences).toBe(1)
    expect(firstSeenEvents()).toHaveLength(1)
    // The last finding wins the ledger, and the initial severity belongs to the
    // first-seen event — a brand-new issue never also reports a "change".
    expect(issues[0].severity).toBe('critical')
    expect(severityEvents()).toEqual([])
  })

  it('an issue created this cycle never also emits a severity change', async () => {
    modelInsights = [insight('new_today', 'info'), insight('new_today', 'critical')]
    await runCycle()

    expect(firstSeenEvents()).toHaveLength(1)
    expect(severityEvents()).toEqual([])
  })
})

// ── Severity changes ─────────────────────────────────────────────────────────

describe('2B-2 · Dream — severity changes', () => {
  it('records one reflection when the stored severity actually changes', async () => {
    const known = seedIssue('youtube_unverified', 'warning')
    modelInsights = [insight('youtube_unverified', 'critical')]
    await runCycle()

    expect(severityEvents()).toHaveLength(1)
    const [event] = severityEvents()
    expect(event.source).toBe('dream')
    expect(event.source_id).toBe(`${known.id}:severity:critical:2026-09-12`)
    expect(event.event_type).toBe('reflection')
    expect(event.entity_kind).toBe('dream_issue')
    expect(event.confidence).toBe(0.50)
    expect(event.structured).toMatchObject({
      issueId: known.id, issueSlug: 'youtube_unverified',
      fromSeverity: 'warning', toSeverity: 'critical', cycleDate: '2026-09-12',
    })
    expect(issues.find((i) => i.id === known.id)!.severity).toBe('critical')
  })

  it('a severity that only differs in spelling is not a change', async () => {
    seedIssue('signal_collapse_risk', 'critical')
    modelInsights = [insight('signal_collapse_risk', 'CrItIcAl')]
    await runCycle()

    expect(severityEvents()).toEqual([])
    expect(memoryEvents).toEqual([])
  })

  it('an invented severity collapses to info, so info → "nonsense" is not a change', async () => {
    seedIssue('baseline_too_small', 'info')
    modelInsights = [insight('baseline_too_small', 'catastrophic-ish')]
    await runCycle()

    expect(severityEvents()).toEqual([])
  })

  it('the same change retried inside one UTC day is one event', async () => {
    const known = seedIssue('flapping_issue', 'warning')
    modelInsights = [insight('flapping_issue', 'critical')]
    await runCycle()
    // Another writer puts it back; the same cycle date re-derives the same key.
    issues.find((i) => i.id === known.id)!.severity = 'warning'
    await runCycle()

    expect(severityEvents()).toHaveLength(1)
    expect(severityEvents()[0].source_id).toBe(`${known.id}:severity:critical:2026-09-12`)
  })

  it('info → warning → critical across nights records each step', async () => {
    const known = seedIssue('escalating', 'info')
    modelInsights = [insight('escalating', 'warning')]
    await runCycle()
    vi.setSystemTime(new Date('2026-09-13T00:00:11.000Z'))
    modelInsights = [insight('escalating', 'critical')]
    await runCycle()

    expect(severityEvents().map((e) => e.source_id)).toEqual([
      `${known.id}:severity:warning:2026-09-12`,
      `${known.id}:severity:critical:2026-09-13`,
    ])
  })

  it('a later flip back to a severity the issue already held is still recorded', async () => {
    const known = seedIssue('oscillating', 'critical')
    modelInsights = [insight('oscillating', 'warning')]
    await runCycle()
    vi.setSystemTime(new Date('2026-09-17T00:00:11.000Z'))
    modelInsights = [insight('oscillating', 'critical')]
    await runCycle()

    expect(severityEvents().map((e) => e.source_id)).toEqual([
      `${known.id}:severity:warning:2026-09-12`,
      `${known.id}:severity:critical:2026-09-17`,
    ])
  })
})

// ── The gated cycle summary ──────────────────────────────────────────────────

describe('2B-2 · Dream — the gated cycle summary', () => {
  it('a new issue opens the gate, and the summary counts only this cycle', async () => {
    seedIssue('step_logs_missing', 'critical')
    modelInsights = [insight('step_logs_missing', 'critical'), insight('brand_new', 'warning')]
    await runCycle()

    expect(summaryEvents()).toHaveLength(1)
    const [summary] = summaryEvents()
    expect(summary.source).toBe('dream')
    expect(summary.source_id).toBe(`${PROJECT}:2026-09-12`)
    expect(summary.event_type).toBe('reflection')
    expect(summary.confidence).toBe(0.50)
    expect(summary.structured).toMatchObject({
      cycleDate: '2026-09-12', newIssues: 1, severityChanges: 0, runsAnalyzed: 1, failRatePct: 0,
      issues: [{ slug: 'brand_new', severity: 'warning', kind: 'new' }],
    })
  })

  it('a severity change alone opens the gate', async () => {
    seedIssue('observabilitet', 'warning')
    modelInsights = [insight('observabilitet', 'critical')]
    await runCycle()

    expect(summaryEvents()).toHaveLength(1)
    expect(summaryEvents()[0].structured).toMatchObject({
      newIssues: 0, severityChanges: 1,
      issues: [{ slug: 'observabilitet', severity: 'critical', kind: 'severity' }],
    })
  })

  it('a recurrence-only night records no summary — and nothing else', async () => {
    seedIssue('step_logs_missing', 'critical')
    seedIssue('perfect_run_rate', 'info')
    modelInsights = [insight('step_logs_missing', 'critical'), insight('perfect_run_rate', 'info')]
    await runCycle()

    expect(summaryEvents()).toEqual([])
    expect(memoryEvents).toEqual([])
  })

  it('cron and a manual run on the same UTC day share one summary', async () => {
    const known = seedIssue('same_day', 'info')
    modelInsights = [insight('same_day', 'warning')]
    await runCycle()
    issues.find((i) => i.id === known.id)!.severity = 'info'
    modelInsights = [insight('same_day', 'critical')]
    await runCycle()

    expect(summaryEvents()).toHaveLength(1)
    expect(summaryEvents()[0].source_id).toBe(`${PROJECT}:2026-09-12`)
    // The second cycle's own change is still recorded; only the summary dedupes.
    expect(severityEvents()).toHaveLength(2)
  })

  it('a retried cycle on the same UTC day does not add a second summary', async () => {
    modelInsights = [insight('retry_me', 'warning')]
    await runCycle()
    issues = []
    modelInsights = [insight('retry_me', 'warning')]
    await runCycle()

    expect(summaryEvents()).toHaveLength(1)
    expect(firstSeenEvents()).toHaveLength(2) // two distinct ledger rows, two identities
  })

  it('the summary never carries the analyzer free text or the standing issue list', async () => {
    seedIssue('old_one', 'critical')
    seedIssue('old_two', 'warning')
    modelInsights = [insight('old_one', 'critical'), insight('old_two', 'warning'), insight('fresh', 'info')]
    await runCycle()

    const [summary] = summaryEvents()
    const blob = JSON.stringify(summary)
    expect(blob).not.toContain('Systemet mår bra')
    expect(blob).not.toContain('old_one')
    expect(blob).not.toContain('old_two')
    expect(summary.structured.issues).toEqual([{ slug: 'fresh', severity: 'info', kind: 'new' }])
  })
})

// ── Canonical truth and failure isolation ────────────────────────────────────

describe('2B-2 · Dream — canonical truth and failure isolation', () => {
  it('a skipped cycle (no recent runs) calls no model and records nothing', async () => {
    runsRows = []
    const result = await runCycle()

    expect(result.ran).toBe(false)
    expect(modelCalls).toBe(0)
    expect(memoryEvents).toEqual([])
  })

  it('a model failure records nothing', async () => {
    modelFault = 'throw'
    modelInsights = [insight('never_seen', 'critical')]
    await expect(runCycle()).rejects.toThrow(/spend gate refused/)

    expect(memoryEvents).toEqual([])
  })

  it('an unparseable model answer records nothing', async () => {
    modelFault = 'invalid'
    await expect(runCycle()).rejects.toThrow(/JSON-parsning misslyckades/)

    expect(memoryEvents).toEqual([])
  })

  it('a failed ledger insert records no issue event', async () => {
    insertFaultSlugs = new Set(['doomed'])
    modelInsights = [insight('doomed', 'critical')]
    await runCycle()

    expect(issues).toEqual([])
    expect(memoryEvents).toEqual([])
  })

  it('a failed ledger update records no severity event', async () => {
    seedIssue('stubborn', 'warning')
    updateFaultSlugs = new Set(['stubborn'])
    modelInsights = [insight('stubborn', 'critical')]
    await runCycle()

    expect(severityEvents()).toEqual([])
    expect(memoryEvents).toEqual([])
  })

  it('a failed ledger write does not count toward the summary', async () => {
    insertFaultSlugs = new Set(['doomed'])
    modelInsights = [insight('doomed', 'critical'), insight('landed', 'warning')]
    await runCycle()

    expect(firstSeenEvents()).toHaveLength(1)
    expect(summaryEvents()[0].structured).toMatchObject({
      newIssues: 1, issues: [{ slug: 'landed', severity: 'warning', kind: 'new' }],
    })
  })

  it('losing the insert race records nothing for the loser', async () => {
    raceLostSlugs = new Set(['contested'])
    modelInsights = [insight('contested', 'critical')]
    await runCycle()

    expect(memoryEvents).toEqual([])
  })

  it('a failed legacy memory write does not suppress an issue event that landed', async () => {
    legacyUpsertFails = true
    modelInsights = [insight('canonical_still_true', 'critical')]
    const result = await runCycle()

    expect(result.insights_saved).toBe(0)
    expect(issues).toHaveLength(1)
    expect(firstSeenEvents()).toHaveLength(1)
  })

  it('a payload that cannot even be built is contained — Dream still succeeds', async () => {
    // recordMemoryEvent never throws, so the emitter's own try/catch only earns
    // its place against a payload that blows up while being assembled.
    const hostile = { toString: () => 'hostile finding', trim() { throw new Error('unreadable title') } }
    modelInsights = [{ key: 'dream_20260912_hostile', issue_id: 'hostile', value: hostile, severity: 'critical', action: 'fix' }]
    const result = await runCycle()

    expect(result.ran).toBe(true)
    expect(issues).toHaveLength(1)
    expect(memoryEvents).toEqual([])
  })

  it.each(['throw', 'error'] as const)('a memory failure (%s) leaves Dream and the ledger intact', async (fault) => {
    wrapperFault = fault
    seedIssue('known', 'warning')
    modelInsights = [insight('known', 'critical'), insight('fresh', 'info')]
    const result = await runCycle()

    expect(result.ran).toBe(true)
    expect(result.insights_saved).toBe(2)
    expect(result.summary).toBe('Systemet mår bra.')
    expect(result.stats).toMatchObject({ total_runs: 1, successful: 1, failed: 0 })
    expect(issues.find((i) => i.issue_id === 'known')!.severity).toBe('critical')
    expect(issues.find((i) => i.issue_id === 'fresh')).toBeTruthy()
    expect(memoryEvents).toEqual([])
  })
})

// ── Scope, entry points and identities ───────────────────────────────────────

describe('2B-2 · Dream — scope and entry points', () => {
  it('the cron path takes the project from the server-side iteration', async () => {
    const { GET } = await import('../../app/api/media/cron/dream/route')
    modelInsights = [insight('from_cron', 'warning')]
    const res = await GET(new Request('http://localhost/api/media/cron/dream?project_id=' + FOREIGN, {
      headers: { authorization: `Bearer ${CRON}` },
    }))

    expect(res.status).toBe(200)
    expect(memoryEvents.length).toBeGreaterThan(0)
    for (const event of memoryEvents) {
      expect(event.scope).toBe('project')
      expect(event.project_id).toBe(PROJECT)
    }
  })

  it('the manual path cannot be redirected by the request body', async () => {
    const { POST } = await import('../../app/api/projects/[slug]/dream/route')
    modelInsights = [insight('from_manual', 'critical')]
    const res = await POST(
      // Both redirection vectors at once: a query string AND a body naming
      // another project. The route resolves the slug through RLS and reads
      // neither, so the event can only carry the project it resolved.
      new Request(`http://localhost/api/projects/x/dream?project_id=${FOREIGN}&scope=world`, {
        method: 'POST', body: JSON.stringify({ project_id: FOREIGN, scope: 'world' }),
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    )

    expect(res.status).toBe(200)
    expect(memoryEvents.length).toBeGreaterThan(0)
    for (const event of memoryEvents) {
      expect(event.project_id).toBe(PROJECT)
      expect(event.project_id).not.toBe(FOREIGN)
    }
  })

  it('every Dream event is project-scoped — never world or global', async () => {
    seedIssue('known', 'info')
    modelInsights = [insight('known', 'critical'), insight('fresh', 'warning')]
    await runCycle()

    expect(memoryEvents).toHaveLength(3)
    for (const event of memoryEvents) {
      expect(event.scope).toBe('project')
      expect(event.project_id).toBe(PROJECT)
      expect(event.event_type).toBe('reflection')
      expect(event.source).toBe('dream')
    }
  })

  it('all three identities are deterministic and carry no timestamp', async () => {
    const known = seedIssue('known', 'warning')
    modelInsights = [insight('known', 'critical'), insight('fresh', 'info')]
    await runCycle()

    const fresh = issues.find((i) => i.issue_id === 'fresh')!
    expect(new Set(memoryEvents.map((e) => String(e.source_id)))).toEqual(new Set([
      `${fresh.id}:first_seen`,
      `${known.id}:severity:critical:2026-09-12`,
      `${PROJECT}:2026-09-12`,
    ]))
    for (const event of memoryEvents) {
      expect(String(event.source_id)).not.toMatch(/T\d{2}:\d{2}|\d{13}/)
    }
  })

  it('no Dream payload carries the prompt, the raw answer or a model blob', async () => {
    seedIssue('known', 'info')
    modelInsights = [insight('known', 'critical'), insight('fresh', 'warning', 'a'.repeat(400))]
    await runCycle()

    for (const event of memoryEvents) {
      const blob = JSON.stringify(event)
      expect(blob).not.toContain('KÖRNINGSSTATISTIK')
      expect(blob).not.toContain('Systemet mår bra')
      expect(blob).not.toContain('agent_suggestions')
      expect(blob.length).toBeLessThan(1200)
    }
    expect(String(firstSeenEvents()[0].content)).toMatch(/…$/)
  })
})

// ── Placement and boundaries (static) ────────────────────────────────────────

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}
const read = (rel: string) => fs.readFileSync(path.join(WEB_ROOT, rel), 'utf8')
const MEMORY_IMPORT = /lib\/atlas\/memory\/|recordMemoryEvent|recallMemories/
// A recall SEAM is an import of a recall module or a call into one — not the
// generated database types, which merely name the `atlas_recall` RPC.
const RECALL_SEAM =
  /from\s+['"][^'"]*(memory\/recall-memories|intelligence\/memory-context|atlas\/context)['"]|\b(recallMemories|assembleMemoryPack|resolveMemoryItems)\s*\(|rpc\(\s*['"]atlas_recall['"]/

function importGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const stack = [path.join(WEB_ROOT, entry)]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    let src: string
    try { src = codeOnly(fs.readFileSync(file, 'utf8')) } catch { continue }
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] ?? m[2]
      if (!spec || (!spec.startsWith('@/') && !spec.startsWith('.'))) continue
      const base = spec.startsWith('@/') ? path.join(WEB_ROOT, spec.slice(2)) : path.resolve(path.dirname(file), spec)
      for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { stack.push(cand); break }
      }
    }
  }
  return seen
}
const rel = (f: string) => path.relative(WEB_ROOT, f)

describe('2B-2 · placement and boundaries', () => {
  it('the Dream emitter lives in lib/ai/dream.ts, which chat cannot reach', () => {
    expect(codeOnly(read('lib/ai/dream.ts'))).toMatch(/recordMemoryEvent/)
    const chat = new Set([...importGraph('app/api/chat/route.ts')].map(rel))
    expect(chat.has('lib/ai/dream.ts')).toBe(false)
    expect(chat.has('lib/atlas/memory/record-event.ts')).toBe(false)
    expect([...chat].filter((f) => MEMORY_IMPORT.test(codeOnly(read(f))))).toEqual([])
  })

  it('lib/atlas/dream.ts — which chat DOES import — stays memory-free', () => {
    const atlasDream = codeOnly(read('lib/atlas/dream.ts'))
    expect(atlasDream).not.toMatch(MEMORY_IMPORT)
    expect(atlasDream).toMatch(/export function normSeverity/)
    expect(importGraph('app/api/chat/route.ts')).toContain(path.join(WEB_ROOT, 'lib/atlas/dream.ts'))
  })

  it('no M4 recall can feed Dream — the producer closure has no recall seam', () => {
    const closure = [...importGraph('lib/ai/dream.ts')].map(rel)
    expect(closure).toContain('lib/atlas/memory/record-event.ts')
    const readers = closure.filter((f) => RECALL_SEAM.test(codeOnly(read(f))))
    expect(readers).toEqual([])
    for (const f of ['lib/ai/dream.ts', 'app/api/media/cron/dream/route.ts', 'app/api/projects/[slug]/dream/route.ts']) {
      expect(codeOnly(read(f)), f).not.toMatch(RECALL_SEAM)
    }
  })

  it('the Dream emits are awaited, gated, and ordered after the ledger write', () => {
    const src = codeOnly(read('lib/ai/dream.ts'))
    const emits = [...src.matchAll(/recordMemoryEvent\(/g)]
    expect(emits).toHaveLength(3)
    expect(src).not.toMatch(/void\s+(recordMemoryEvent|recordDreamCycleMemory)/)
    expect([...src.matchAll(/await recordMemoryEvent\(/g)]).toHaveLength(3)
    expect(src).toMatch(/await recordDreamCycleMemory\(/)
    // The gate, and the delta it reads, come from ledger writes only.
    expect(src).toMatch(/if \(newIssues\.length === 0 && severityChanges\.length === 0\) return/)
    expect(src.indexOf('.from(\'dream_issues\')')).toBeLessThan(src.indexOf('await recordDreamCycleMemory('))
    expect(src.indexOf('severityChanges.push(')).toBeLessThan(src.indexOf('await recordDreamCycleMemory('))
  })

  it('Dream memory is observational — it mints nothing and is read back nowhere', () => {
    const src = codeOnly(read('lib/ai/dream.ts'))
    expect(src).toMatch(/eventType: 'reflection'/)
    expect(src).not.toMatch(/eventType: '(decision|authorization)'/)
    expect(src).not.toMatch(/authorization_id|authorizationId|manager_task_id:/)
    const readers = [...importGraph('lib/ai/dream.ts')].map(rel).filter((f) => RECALL_SEAM.test(codeOnly(read(f))))
    expect(readers).toEqual([])
  })

  it('the pipeline, Minne and injection surfaces are untouched by this slice', () => {
    for (const f of ['lib/media/run-log.ts', 'lib/atlas/memory/recall-memories.ts', 'lib/atlas/memory/flags.ts']) {
      expect(fs.existsSync(path.join(WEB_ROOT, f)), f).toBe(true)
    }
    expect(codeOnly(read('lib/media/run-log.ts'))).not.toMatch(MEMORY_IMPORT)
    const media = path.join(WEB_ROOT, 'app/api/media')
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    const mediaWriters = walk(media)
      .filter((f) => /\.ts$/.test(f) && !/cron\/dream/.test(f) && MEMORY_IMPORT.test(codeOnly(fs.readFileSync(f, 'utf8'))))
    expect(mediaWriters.map(rel)).toEqual([])
    // Minne (the legacy memory surface) and injection stay out of the Dream graph.
    const closure = [...importGraph('lib/ai/dream.ts')].map(rel)
    expect(closure.filter((f) => /minne|memory-context|inject/i.test(f))).toEqual([])
  })
})
