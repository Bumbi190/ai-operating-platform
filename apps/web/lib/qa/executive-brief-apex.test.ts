/**
 * Apex Daily Executive Brief — EI-S1.2.
 *
 * Covers the pure producer, the orchestrator shell, evidence completeness,
 * project/world isolation, the principal-scoped read boundary, the legacy
 * retirement, and the authority boundary.
 *
 * Filesystem/local only: the store and DB handles are in-memory fakes. No
 * Supabase client is ever constructed and no credential is read.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EXECUTIVE_BRIEF_PRODUCER_VERSION,
  MAX_RECOMMENDATIONS,
  MAX_WHAT_NEEDS_YOU,
  buildExecutiveBrief,
  type ExecutiveBriefInput,
} from '@/lib/atlas/intelligence/producers/executive-brief-producer'
import { runExecutiveBriefProducer } from '@/lib/atlas/intelligence/producers/executive-brief-orchestrator'
import { readExecutiveBriefForPrincipal } from '@/lib/atlas/intelligence/principal-read'
import { executiveBriefColumns } from '@/lib/atlas/intelligence/brief-view'
import type { IntelligenceStore, QueryArgs } from '@/lib/atlas/intelligence/store'
import type {
  BriefBody,
  EvidenceChain,
  ExecutiveBriefBody,
  InsightBody,
  IntelligenceDraft,
  IntelligenceObject,
  OpportunityBody,
  RiskBody,
  TrendBody,
} from '@/lib/atlas/intelligence/types'

const REPO_ROOT = resolve(__dirname, '../../../..')
const NOW = '2026-08-18T06:00:00.000Z'
const WINDOW = { since: '2026-08-11T06:00:00.000Z', until: NOW }

// ── Fixtures ──────────────────────────────────────────────────────────────────

function signalEvidence(id = 'sig-1'): EvidenceChain {
  return [{ sourceId: id, sourceKind: 'signal', label: 'stripe.mrr_snapshot', producedAt: '2026-08-17T00:00:00.000Z' }]
}

function object<B>(over: Partial<IntelligenceObject<B>> & { id: string; kind: IntelligenceObject<B>['kind']; body: B }): IntelligenceObject<B> {
  return {
    projectId: null, subject: null, evidence: signalEvidence(), confidence: 0.7,
    producedAt: '2026-08-18T05:00:00.000Z', producedBy: 'test-producer-1.0.0',
    supersededBy: null, window: WINDOW, ...over,
  } as IntelligenceObject<B>
}

function trend(over: Partial<TrendBody> & { metric: string }, o: Partial<IntelligenceObject<TrendBody>> = {}) {
  return object<TrendBody>({
    id: `trend-${over.metric}`, kind: 'trend',
    body: {
      projectId: null, direction: 'rising', changeRatio: 0.4, r2: 0.8,
      pointCount: 12, window: WINDOW, baseline: 100, current: 140, slope: 3, ...over,
    },
    ...o,
  })
}

function risk(over: Partial<RiskBody> = {}, o: Partial<IntelligenceObject<RiskBody>> = {}) {
  return object<RiskBody>({
    id: 'risk-1', kind: 'risk',
    body: {
      subject: 'Churn pressure', description: 'Churn is accelerating.', affectedMetrics: ['churn_rate'],
      likelihood: 0.6, magnitude: 0.5, horizon: 'near_term',
      mitigations: ['Review the churn cohort before Friday.'], projectId: null, ...over,
    },
    ...o,
  })
}

function opportunity(over: Partial<OpportunityBody> = {}, o: Partial<IntelligenceObject<OpportunityBody>> = {}) {
  return object<OpportunityBody>({
    id: 'opp-1', kind: 'opportunity',
    body: {
      subject: 'Audience momentum', description: 'Followers are compounding.', affectedMetrics: ['total_followers'],
      expectedGain: 0.5, magnitude: 0.4, horizon: 'near_term',
      actions: ['Double down on the top-performing format.'], projectId: null, ...over,
    },
    ...o,
  })
}

function insight(over: Partial<InsightBody> = {}, o: Partial<IntelligenceObject<InsightBody>> = {}) {
  return object<InsightBody>({
    id: 'insight-1', kind: 'insight',
    body: { pattern: 'acceleration', metrics: ['total_followers'], projectId: null, description: 'Growth is accelerating.', window: WINDOW, ...over },
    ...o,
  })
}

function brief(o: Partial<IntelligenceObject<BriefBody>> = {}) {
  return object<BriefBody>({
    id: 'brief-1', kind: 'brief',
    body: { scope: 'global', projectId: null, window: WINDOW, situation: 'Steady.', findings: [], signalCount: 3, memoryItemCount: 0 },
    ...o,
  })
}

function input(over: Partial<ExecutiveBriefInput> = {}): ExecutiveBriefInput {
  return {
    scope: 'global', projectId: null, window: WINDOW, horizon: 'morning',
    briefs: [brief()], trends: [trend({ metric: 'mrr_sek' })], insights: [insight()],
    risks: [risk()], opportunities: [opportunity()], priorBrief: null, now: NOW, ...over,
  }
}

// ── In-memory store ───────────────────────────────────────────────────────────

class FakeStore implements IntelligenceStore {
  rows: IntelligenceObject<unknown>[] = []
  appends = 0
  supersedes = 0
  private seq = 0

  constructor(seed: IntelligenceObject<unknown>[] = []) { this.rows = [...seed] }

  async append<B>(draft: IntelligenceDraft<B>): Promise<IntelligenceObject<B>> {
    this.appends += 1
    const row = { ...draft, id: `persisted-${++this.seq}`, supersededBy: null } as IntelligenceObject<B>
    this.rows.push(row as IntelligenceObject<unknown>)
    return row
  }

  async supersede<B>(priorId: string, draft: IntelligenceDraft<B>): Promise<IntelligenceObject<B>> {
    this.supersedes += 1
    const row = await this.append(draft)
    const prior = this.rows.find(r => r.id === priorId)
    if (prior) prior.supersededBy = row.id
    return row
  }

  async query<B>(args: QueryArgs): Promise<IntelligenceObject<B>[]> {
    return this.rows.filter(r =>
      (!args.kinds || args.kinds.includes(r.kind)) &&
      (args.projectId === undefined || r.projectId === args.projectId) &&
      (args.notSuperseded === false || r.supersededBy === null),
    ).slice(0, args.limit ?? 50) as IntelligenceObject<B>[]
  }

  async getById<B>(id: string): Promise<IntelligenceObject<B> | null> {
    return (this.rows.find(r => r.id === id) as IntelligenceObject<B>) ?? null
  }
}

/** Minimal DB double for the isolation lookup. Never a Supabase client. */
function fakeDb(opts: { owned: string[]; all: string[]; throwOnProjects?: boolean }) {
  return {
    from(table: string) {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`)
      const builder = {
        select: () => builder,
        eq: (_col: string, _val: string) => Promise.resolve({ data: opts.owned.map(id => ({ id })), error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(opts.throwOnProjects
            ? { data: null, error: { message: 'boom' } }
            : { data: opts.all.map(id => ({ id })), error: null }).then(res),
      }
      return builder
    },
  }
}

// ── 1–3. Generation, determinism, canonical shape ─────────────────────────────

describe('Apex Executive Brief — canonical shape', () => {
  it('produces a valid executive_brief with all five canonical sections', () => {
    const draft = buildExecutiveBrief(input())
    expect(draft.kind).toBe('executive_brief')
    expect(draft.producedBy).toBe(EXECUTIVE_BRIEF_PRODUCER_VERSION)
    expect(draft.body.horizon).toBe('morning')
    expect(typeof draft.body.situation).toBe('string')
    expect(draft.body.situation).not.toContain('\n')          // one sentence, never a list
    expect(draft.body.whatChanged.length).toBeGreaterThan(0)
    expect(draft.body.whatItMeans.length).toBeGreaterThan(0)
    expect(draft.body.recommendations.length).toBeGreaterThan(0)
    expect(draft.body.whatNeedsYou.length).toBeGreaterThan(0)
    expect(draft.body.noMaterialChange).toBe(false)
  })

  it('is deterministic for identical input', () => {
    expect(JSON.stringify(buildExecutiveBrief(input()))).toBe(JSON.stringify(buildExecutiveBrief(input())))
  })

  it('assigns the project horizon for a project-scoped brief', () => {
    const draft = buildExecutiveBrief(input({
      scope: 'project', projectId: 'p1', horizon: 'project',
      briefs: [brief({ projectId: 'p1' })], trends: [trend({ metric: 'mrr_sek' }, { projectId: 'p1' })],
      insights: [], risks: [], opportunities: [],
    }))
    expect(draft.body.horizon).toBe('project')
    expect(draft.projectId).toBe('p1')
    expect(draft.subject).toEqual({ kind: 'project', id: 'p1' })
  })

  it('keeps every recommendation decision-ready with counterfactual and defeater', () => {
    const draft = buildExecutiveBrief(input())
    for (const recommendation of draft.body.recommendations) {
      expect(recommendation.summary.length).toBeGreaterThan(0)
      expect(recommendation.counterfactual).toMatch(/Do nothing/)
      expect(recommendation.defeater.length).toBeGreaterThan(0)
      expect(recommendation.evidence.length).toBeGreaterThan(0)
    }
  })

  it('caps the attention list and the decision set', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      risk({ subject: `Risk ${i}` }, { id: `risk-${i}`, confidence: 0.5 + i / 100 }))
    const draft = buildExecutiveBrief(input({ risks: many }))
    expect(draft.body.whatNeedsYou.length).toBeLessThanOrEqual(MAX_WHAT_NEEDS_YOU)
    expect(draft.body.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS)
  })
})

// ── 4–6. Isolation, evidence, signed direction ────────────────────────────────

describe('Apex Executive Brief — evidence and isolation', () => {
  it('records one evidence entry per consumed artifact and lists them in sourcedFrom', () => {
    const draft = buildExecutiveBrief(input())
    const consumed = ['brief-1', 'trend-mrr_sek', 'insight-1', 'risk-1', 'opp-1']
    expect(draft.body.sourcedFrom.sort()).toEqual([...consumed].sort())
    expect(draft.evidence.map(e => e.sourceId).sort()).toEqual([...consumed].sort())
    for (const entry of draft.evidence) expect(entry.sourceKind).toBe('atlas_intelligence')
  })

  it('never consumes another project’s intelligence', () => {
    const foreign = trend({ metric: 'leaked_metric' }, { id: 'trend-foreign', projectId: 'other-project' })
    const own = trend({ metric: 'mrr_sek' }, { id: 'trend-own', projectId: 'p1' })
    const draft = buildExecutiveBrief(input({
      scope: 'project', projectId: 'p1', horizon: 'project',
      briefs: [], insights: [], risks: [], opportunities: [], trends: [own, foreign],
    }))
    expect(draft.body.sourcedFrom).toEqual(['trend-own'])
    expect(JSON.stringify(draft)).not.toContain('leaked_metric')
    expect(JSON.stringify(draft)).not.toContain('other-project')
  })

  it('does not let a world brief widen into project-scoped artifacts', () => {
    const projectTrend = trend({ metric: 'project_only' }, { id: 'trend-p', projectId: 'p1' })
    const draft = buildExecutiveBrief(input({ trends: [projectTrend], briefs: [], insights: [], risks: [], opportunities: [] }))
    expect(draft.body.sourcedFrom).toEqual([])
    expect(JSON.stringify(draft)).not.toContain('project_only')
  })

  it('excludes superseded inputs deterministically', () => {
    const stale = trend({ metric: 'stale_metric' }, { id: 'trend-stale', supersededBy: 'trend-fresh' })
    const fresh = trend({ metric: 'mrr_sek' }, { id: 'trend-fresh' })
    const draft = buildExecutiveBrief(input({ trends: [stale, fresh], briefs: [], insights: [], risks: [], opportunities: [] }))
    expect(draft.body.sourcedFrom).toEqual(['trend-fresh'])
    expect(JSON.stringify(draft)).not.toContain('stale_metric')
  })

  it('suppresses recommendations that lack factual grounding', () => {
    const ungrounded = risk({}, { id: 'risk-ungrounded', evidence: [{ sourceId: 'm1', sourceKind: 'memory', label: 'memory:hunch', producedAt: NOW }] })
    const draft = buildExecutiveBrief(input({ risks: [ungrounded], opportunities: [], trends: [], insights: [], briefs: [] }))
    expect(draft.body.recommendations).toEqual([])
    // The finding is still reported — only the recommendation is withheld.
    expect(draft.body.whatItMeans.length).toBe(1)
  })

  it('derives direction from the signed risk/opportunity artifacts, not from metric names', () => {
    const draft = buildExecutiveBrief(input({
      trends: [trend({ metric: 'churn_rate' }), trend({ metric: 'total_followers' }), trend({ metric: 'unclaimed_metric' })],
      risks: [risk({ affectedMetrics: ['churn_rate'] })],
      opportunities: [opportunity({ affectedMetrics: ['total_followers'] })],
      insights: [], briefs: [],
    }))
    const byLabel = new Map(draft.body.whatChanged.map(s => [s.label, s.direction]))
    expect(byLabel.get('churn_rate')).toBe('negative')
    expect(byLabel.get('total_followers')).toBe('positive')
    expect(byLabel.get('unclaimed_metric')).toBe('neutral')
  })

  it('reports a metric claimed by both a risk and an opportunity as neutral', () => {
    const draft = buildExecutiveBrief(input({
      trends: [trend({ metric: 'mrr_sek' })],
      risks: [risk({ affectedMetrics: ['mrr_sek'] })],
      opportunities: [opportunity({ affectedMetrics: ['mrr_sek'] })],
      insights: [], briefs: [],
    }))
    expect(draft.body.whatChanged.find(s => s.label === 'mrr_sek')?.direction).toBe('neutral')
  })
})

// ── 7, 9, 10. Confidence, empty input, continuity ─────────────────────────────

describe('Apex Executive Brief — confidence and cold start', () => {
  it('propagates confidence from the consumed artifacts', () => {
    const draft = buildExecutiveBrief(input())
    expect(draft.confidence).toBeGreaterThan(0)
    expect(draft.confidence).toBeLessThanOrEqual(1)
    // Harmonic propagation is pulled down by the weakest input, never above it.
    const weak = buildExecutiveBrief(input({ trends: [trend({ metric: 'mrr_sek' }, { confidence: 0.2 })] }))
    expect(weak.confidence).toBeLessThan(draft.confidence)
  })

  it('remains a valid artifact at floor confidence with no inputs at all', () => {
    const draft = buildExecutiveBrief(input({ briefs: [], trends: [], insights: [], risks: [], opportunities: [] }))
    expect(draft.kind).toBe('executive_brief')
    expect(draft.confidence).toBe(0.1)
    expect(draft.body.sourcedFrom).toEqual([])
    expect(draft.body.recommendations).toEqual([])
    expect(draft.body.situation).toMatch(/no executive judgement can be offered yet/i)
  })

  it('states plainly when nothing material changed rather than inventing novelty', () => {
    const flat = trend({ metric: 'mrr_sek', direction: 'flat', changeRatio: 0.001 })
    const draft = buildExecutiveBrief(input({ trends: [flat], insights: [], risks: [], opportunities: [] }))
    expect(draft.body.noMaterialChange).toBe(true)
    expect(draft.body.situation).toMatch(/No material change/i)
  })

  it('carries continuity from the prior brief (§13.3)', () => {
    const prior = object<ExecutiveBriefBody>({
      id: 'prior-brief', kind: 'executive_brief',
      body: buildExecutiveBrief(input()).body,
    })
    const draft = buildExecutiveBrief(input({ priorBrief: prior }))
    expect(draft.body.priorBriefId).toBe('prior-brief')
    expect(draft.evidence.map(e => e.sourceId)).toContain('prior-brief')
  })
})

// ── 11–12. Orchestrator persistence and repeat invocation ─────────────────────

describe('Apex Executive Brief — orchestrator', () => {
  function seeded() {
    return new FakeStore([brief(), trend({ metric: 'mrr_sek' }), insight(), risk(), opportunity()])
  }

  it('appends on first run and supersedes the prior apex brief on the next', async () => {
    const store = seeded()
    const first = await runExecutiveBriefProducer({ projectId: null, store, now: NOW })
    expect(first.kind).toBe('executive_brief')
    expect(store.appends).toBe(1)
    expect(store.supersedes).toBe(0)

    const second = await runExecutiveBriefProducer({ projectId: null, store, now: '2026-08-19T06:00:00.000Z' })
    expect(store.supersedes).toBe(1)
    expect(second.body.priorBriefId).toBe(first.id)
    expect(store.rows.find(r => r.id === first.id)?.supersededBy).toBe(second.id)
    // Exactly one live apex brief per scope after repeated invocation.
    expect(store.rows.filter(r => r.kind === 'executive_brief' && r.supersededBy === null)).toHaveLength(1)
  })

  it('reads a project scope without touching global artifacts', async () => {
    const store = new FakeStore([
      trend({ metric: 'global_metric' }, { id: 'trend-global' }),
      trend({ metric: 'project_metric' }, { id: 'trend-project', projectId: 'p1' }),
    ])
    const result = await runExecutiveBriefProducer({ projectId: 'p1', store, now: NOW })
    expect(result.body.sourcedFrom).toEqual(['trend-project'])
    expect(result.body.horizon).toBe('project')
  })
})

// ── 16–17. Principal-scoped read boundary ─────────────────────────────────────

describe('Executive Brief principal read boundary', () => {
  const persisted = object<ExecutiveBriefBody>({
    id: 'eb-1', kind: 'executive_brief', body: buildExecutiveBrief(input()).body,
  })

  it('denies an unauthenticated principal', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: [], all: ['p1'] }), userId: null, store: new FakeStore([persisted]),
    })
    expect(result).toEqual({ brief: null, status: 'no_principal' })
  })

  it('denies a project the principal does not own', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: ['p1'], all: ['p1', 'p2'] }), userId: 'u1', projectId: 'p2',
      store: new FakeStore([object<ExecutiveBriefBody>({ id: 'eb-p2', kind: 'executive_brief', projectId: 'p2', body: persisted.body })]),
    })
    expect(result.status).toBe('project_denied')
    expect(result.brief).toBeNull()
  })

  it('allows a project the principal owns', async () => {
    const owned = object<ExecutiveBriefBody>({ id: 'eb-p1', kind: 'executive_brief', projectId: 'p1', body: persisted.body })
    const result = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: ['p1'], all: ['p1', 'p2'] }), userId: 'u1', projectId: 'p1', store: new FakeStore([owned]),
    })
    expect(result.status).toBe('ok')
    expect(result.brief?.id).toBe('eb-p1')
  })

  it('denies the portfolio brief when any project is outside the allow-list', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: ['p1'], all: ['p1', 'p2'] }), userId: 'u1', store: new FakeStore([persisted]),
    })
    expect(result.status).toBe('portfolio_denied')
    expect(result.brief).toBeNull()
  })

  it('allows the portfolio brief only with authority over every project', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: ['p1', 'p2'], all: ['p1', 'p2'] }), userId: 'u1', store: new FakeStore([persisted]),
    })
    expect(result.status).toBe('ok')
    expect(result.brief?.id).toBe('eb-1')
  })

  it('fails closed when the project lookup errors, and reports a missing brief honestly', async () => {
    const denied = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: ['p1'], all: ['p1'], throwOnProjects: true }), userId: 'u1', store: new FakeStore([persisted]),
    })
    expect(denied.status).toBe('portfolio_denied')

    const empty = await readExecutiveBriefForPrincipal({
      db: fakeDb({ owned: ['p1'], all: ['p1'] }), userId: 'u1', store: new FakeStore(),
    })
    expect(empty.status).toBe('not_produced')
    expect(empty.brief).toBeNull()
  })
})

// ── View adapter ──────────────────────────────────────────────────────────────

describe('Executive Brief view adapter', () => {
  it('splits the page columns by canonical direction', () => {
    const columns = executiveBriefColumns(buildExecutiveBrief(input()).body)
    expect(columns.whatWorked.join(' ')).toMatch(/Audience momentum|total_followers/)
    expect(columns.whatFailed.join(' ')).toMatch(/Churn pressure|churn_rate/)
    expect(columns.needsAttention.length).toBeGreaterThan(0)
  })

  it('says nothing changed instead of rendering blank columns', () => {
    const body = buildExecutiveBrief(input({ trends: [], insights: [], risks: [], opportunities: [] })).body
    const columns = executiveBriefColumns(body)
    expect(columns.whatWorked[0]).toMatch(/Ingen väsentlig/)
    expect(columns.whatFailed[0]).toMatch(/Ingen väsentlig/)
    expect(columns.needsAttention[0]).toMatch(/Inget kräver ditt beslut/)
  })
})

// ── 13–15, 18–19. Boundaries, authority and legacy retirement ─────────────────

describe('Apex Executive Brief — boundaries and legacy retirement', () => {
  const producer = readFileSync(resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/producers/executive-brief-producer.ts'), 'utf8')
  const orchestrator = readFileSync(resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/producers/executive-brief-orchestrator.ts'), 'utf8')
  const page = readFileSync(resolve(REPO_ROOT, 'apps/web/app/(platform)/atlas/page.tsx'), 'utf8')

  it('keeps the pure core free of all I/O', () => {
    for (const forbidden of ['createAdminClient', 'supabase', 'fetch(', 'readFileSync', 'process.env', 'new Date(']) {
      expect(producer).not.toContain(forbidden)
    }
  })

  it('keeps the apex clear of any direct Memory access', () => {
    // Matched as code (import specifier / call site), so a prose mention in a
    // header comment cannot trip the guard and cannot hide a real bypass.
    for (const source of [producer, orchestrator]) {
      expect(source).not.toMatch(/from\s+['"][^'"]*recall-memories['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*memory-context['"]/)
      expect(source).not.toMatch(/\brecallMemories\s*\(/)
      expect(source).not.toMatch(/\bresolveMemoryItems\s*\(/)
      expect(source).not.toContain('atlas_recall')
    }
  })

  it('leaves the sanctioned Memory path intact for the input-tier brief', () => {
    const briefOrchestrator = readFileSync(resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/producers/brief-orchestrator.ts'), 'utf8')
    expect(briefOrchestrator).toContain('resolveMemoryItems')
    const memoryContext = readFileSync(resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/memory-context.ts'), 'utf8')
    expect(memoryContext).toContain('recallMemories')
  })

  it('grants no execution authority', () => {
    for (const source of [producer, orchestrator]) {
      for (const forbidden of ['atlasActions', 'publish', 'sendEmail', 'stripe', 'approve', 'executeAction']) {
        expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('powers the Atlas page from the conformant source only', () => {
    expect(page).toContain('readExecutiveBriefForPrincipal')
    expect(page).not.toMatch(/from\s+['"]@\/lib\/atlas\/executive['"]/)
    expect(page).not.toMatch(/\batlasExecutiveSummary\s*\(/)
    // The page must never reach the CRON_SECRET internal route.
    expect(page).not.toContain('CRON_SECRET')
    expect(page).not.toContain('/api/atlas/intelligence/brief')
  })

  it('leaves the legacy module with no live importer', () => {
    const roots = ['apps/web/app', 'apps/web/lib', 'apps/web/scripts']
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(REPO_ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`
        if (entry.isDirectory()) { walk(rel); continue }
        if (!/\.tsx?$/.test(entry.name)) continue
        if (rel.endsWith('apps/web/lib/atlas/executive.ts')) continue
        if (rel.includes('/qa/')) continue
        const src = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
        const imports = /from\s+['"](?:@\/lib\/atlas\/executive|\.{1,2}\/executive)['"]/.test(src)
        const calls = /\batlasExecutiveSummary\s*\(/.test(src)
        if (imports || calls) offenders.push(rel)
      }
    }
    roots.forEach(walk)
    expect(offenders).toEqual([])
  })

  it('runs the apex last in the cron chain, after its inputs exist', () => {
    const route = readFileSync(resolve(REPO_ROOT, 'apps/web/app/api/atlas/intelligence/cron/brief/route.ts'), 'utf8')
    expect(route).toContain('runExecutiveBriefProducer')
    expect(route.indexOf('runAssessmentProducer(')).toBeLessThan(route.indexOf('runExecutiveBriefProducer('))
  })
})
