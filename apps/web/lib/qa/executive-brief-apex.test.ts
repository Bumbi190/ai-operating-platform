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

import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
  /** Every query the shell issued — lets a test assert the scope binding. */
  queries: QueryArgs[] = []
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
    this.queries.push(args)
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

/**
 * DB double that models REAL row-level-security semantics.
 *
 * A `projects` row set plus the privilege the client runs with:
 *   • 'user'         — behaves like a cookie-bound client under
 *                      `owner_id = auth.uid()`: an unfiltered select returns
 *                      ONLY the caller's own rows. This is the case that makes
 *                      a naive whole-portfolio check tautological.
 *   • 'service_role' — bypasses RLS: an unfiltered select returns every row.
 *
 * `.eq('owner_id', x)` filters on top of whatever the privilege already allows,
 * exactly as Postgres would.
 */
type Privilege = 'user' | 'service_role'

interface ProjectRow { id: string; owner_id: string }

function rlsDb(opts: {
  projects: ProjectRow[]
  privilege: Privilege
  asUser?: string
  throwOnProjects?: boolean
}) {
  const visible = (): ProjectRow[] =>
    opts.privilege === 'service_role'
      ? opts.projects
      : opts.projects.filter(p => p.owner_id === opts.asUser)

  return {
    from(table: string) {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`)
      const result = (rows: ProjectRow[]) =>
        opts.throwOnProjects
          ? { data: null, error: { message: 'boom' } }
          : { data: rows, error: null }
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) =>
          Promise.resolve(result(visible().filter(p => (p as never as Record<string, string>)[col] === val))),
        then: (res: (v: unknown) => unknown) => Promise.resolve(result(visible())).then(res),
      }
      return builder
    },
  }
}

/** The authority seam as production wires it: enumerates every project row. */
const portfolioReader = (projects: ProjectRow[], throws = false) => async () => {
  if (throws) throw new Error('enumeration failed')
  return projects.map(p => ({ id: p.id, owner_id: p.owner_id }))
}

// Two principals, one project each — the scenario the reviewer described.
const OWNER_A = 'user-a'
const OWNER_B = 'user-b'
const PROJECT_A: ProjectRow = { id: 'p-a', owner_id: OWNER_A }
const PROJECT_B: ProjectRow = { id: 'p-b', owner_id: OWNER_B }
const BOTH_PROJECTS = [PROJECT_A, PROJECT_B]

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

  // EI-S1.2R1 — the mirror direction. A world run must stay on
  // `project_id IS NULL` artifacts and can never absorb project-scoped
  // reasoning, matching PostgresStore's `.is('project_id', null)` filter.
  it('runs the world scope without absorbing any project artifact', async () => {
    const store = new FakeStore([
      trend({ metric: 'global_metric' }, { id: 'trend-global' }),
      trend({ metric: 'a_metric' }, { id: 'trend-a', projectId: 'p-a' }),
      trend({ metric: 'b_metric' }, { id: 'trend-b', projectId: 'p-b' }),
      risk({}, { id: 'risk-b', projectId: 'p-b' }),
    ])
    const result = await runExecutiveBriefProducer({ projectId: null, store, now: NOW })

    expect(result.body.scope).toBe('global')
    expect(result.body.horizon).toBe('morning')
    expect(result.body.sourcedFrom).toEqual(['trend-global'])
    // No project artifact may appear anywhere in the artifact or its provenance.
    const trace = JSON.stringify(result)
    for (const foreign of ['trend-a', 'trend-b', 'risk-b', 'a_metric', 'b_metric']) {
      expect(trace).not.toContain(foreign)
    }
    expect(result.evidence.map(e => e.sourceId)).toEqual(['trend-global'])
  })

  // The store is the enforcement point in production; assert its scoping
  // contract explicitly so a future refactor cannot silently widen it.
  it('binds the store query to the requested scope', async () => {
    const store = new FakeStore([trend({ metric: 'global_metric' }, { id: 'trend-global' })])
    await runExecutiveBriefProducer({ projectId: null, store, now: NOW })
    expect(store.queries.every(q => q.projectId === null)).toBe(true)

    const projectStore = new FakeStore([trend({ metric: 'm' }, { id: 't', projectId: 'p1' })])
    await runExecutiveBriefProducer({ projectId: 'p1', store: projectStore, now: NOW })
    expect(projectStore.queries.every(q => q.projectId === 'p1')).toBe(true)
  })
})

// ── 16–17. Principal-scoped read boundary ─────────────────────────────────────

describe('Executive Brief principal read boundary', () => {
  const worldBrief = object<ExecutiveBriefBody>({
    id: 'eb-world', kind: 'executive_brief', body: buildExecutiveBrief(input()).body,
  })
  const briefA = object<ExecutiveBriefBody>({
    id: 'eb-p-a', kind: 'executive_brief', projectId: PROJECT_A.id, body: worldBrief.body,
  })
  const briefB = object<ExecutiveBriefBody>({
    id: 'eb-p-b', kind: 'executive_brief', projectId: PROJECT_B.id, body: worldBrief.body,
  })

  it('denies an unauthenticated principal', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A }),
      userId: null,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result).toEqual({ brief: null, status: 'no_principal' })
  })

  it('returns a project brief the principal owns', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A, projectId: PROJECT_A.id,
      store: new FakeStore([briefA, briefB]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result.status).toBe('ok')
    expect(result.brief?.id).toBe('eb-p-a')
  })

  it('denies another principal’s project brief', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A, projectId: PROJECT_B.id,
      store: new FakeStore([briefA, briefB]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result.status).toBe('project_denied')
    expect(result.brief).toBeNull()
  })

  // ── EI-S1.2R1 regression ────────────────────────────────────────────────────
  // The world brief is synthesised from platform-wide signals, so it can carry
  // conclusions drawn from project B. Owner A must never receive it — and that
  // must hold even when the caller injects a user-scoped, RLS-filtered client,
  // which is exactly the case that would make a naive check tautological.
  it('denies the world brief to a principal who does not own the whole platform', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result.status).toBe('portfolio_denied')
    expect(result.brief).toBeNull()
  })

  it('denies the world brief identically under a service-role caller client', async () => {
    // The caller's privilege must not be able to change the answer.
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'service_role' }),
      userId: OWNER_A,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result.status).toBe('portfolio_denied')
  })

  it('allows the world brief only when the principal owns every project', async () => {
    const soleOwner = [PROJECT_A, { id: 'p-a2', owner_id: OWNER_A }]
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: soleOwner, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader(soleOwner),
    })
    expect(result.status).toBe('ok')
    expect(result.brief?.id).toBe('eb-world')
  })

  it('denies the world brief when a project has no owner at all', async () => {
    const orphaned = [PROJECT_A, { id: 'p-orphan', owner_id: '' }]
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: orphaned, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader(orphaned),
    })
    expect(result.status).toBe('portfolio_denied')
  })

  it('denies the world brief on an empty platform — authority must be positively held', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: [], privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader([]),
    })
    expect(result.status).toBe('portfolio_denied')
  })

  it('fails closed when the authority enumeration errors', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      store: new FakeStore([worldBrief]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS, true),
    })
    expect(result.status).toBe('portfolio_denied')
    expect(result.brief).toBeNull()
  })

  it('fails closed when the allow-list lookup errors', async () => {
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A, throwOnProjects: true }),
      userId: OWNER_A, projectId: PROJECT_A.id,
      store: new FakeStore([briefA]),
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result.status).toBe('project_denied')
    expect(result.brief).toBeNull()
  })

  it('reports a missing brief honestly rather than falling back to another scope', async () => {
    const soleOwner = [PROJECT_A]
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: soleOwner, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      // Only a project-scoped brief exists; the world read must NOT return it.
      store: new FakeStore([briefA]),
      portfolioAuthorityReader: portfolioReader(soleOwner),
    })
    expect(result.status).toBe('not_produced')
    expect(result.brief).toBeNull()
  })

  it('never reaches the store when authorization fails', async () => {
    const store = new FakeStore([worldBrief])
    const spy = { queries: 0 }
    const watched = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === 'query') { spy.queries += 1 }
        return Reflect.get(target, prop, receiver)
      },
    }) as typeof store
    const result = await readExecutiveBriefForPrincipal({
      db: rlsDb({ projects: BOTH_PROJECTS, privilege: 'user', asUser: OWNER_A }),
      userId: OWNER_A,
      store: watched,
      portfolioAuthorityReader: portfolioReader(BOTH_PROJECTS),
    })
    expect(result.status).toBe('portfolio_denied')
    expect(spy.queries).toBe(0)
  })

  it('proves portfolio authority without using the caller-supplied client', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/principal-read.ts'), 'utf8',
    )
    // The authority proof must not be an RLS-filtered enumeration of the very
    // rows that RLS hides, so it must not run through `request.db`.
    expect(source).toContain('provePortfolioAuthority(')
    expect(source).not.toMatch(/isAuthorizedForWholePortfolio\s*\(\s*db/)
    // Server-only, so the service-role seam can never reach a client bundle.
    expect(source).toContain("import 'server-only'")
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

// ────────────────────────────────────────────────────────────────────────────
// EI-S1.5A — the shared-secret Executive Brief read surface is retired
// ────────────────────────────────────────────────────────────────────────────

describe('EI-S1.5A — no shared-secret Executive Brief read surface exists', () => {
  const APP = resolve(REPO_ROOT, 'apps/web/app')
  const LIB = resolve(REPO_ROOT, 'apps/web/lib')

  /** Every file under a root, so a guard cannot miss a new directory. */
  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  it('the route file is gone', () => {
    expect(existsSync(resolve(APP, 'api/atlas/intelligence/brief/route.ts'))).toBe(false)
    expect(existsSync(resolve(APP, 'api/atlas/intelligence/brief'))).toBe(false)
  })

  /**
   * Executable code only.
   *
   * The retirement is DOCUMENTED in several module headers — that prose has to
   * name the route it retired to be worth reading. A guard that matched comment
   * text would force the explanation to be deleted to stay green, which is the
   * wrong trade: the point is that no code CALLS it, not that no one may
   * mention it.
   */
  const codeOf = (file: string): string =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

  it('no live code references the retired read path', () => {
    const offenders = [...walk(APP), ...walk(LIB)]
      .filter(f => !f.endsWith('executive-brief-apex.test.ts'))
      .filter(f => /['"`][^'"`]*\/api\/atlas\/intelligence\/brief(?!-)/.test(codeOf(f)))
    expect(offenders).toEqual([])
  })

  it('no fetch anywhere targets it', () => {
    const offenders = [...walk(APP), ...walk(LIB)]
      .filter(f => /fetch\([^)]*intelligence\/brief(?!-)/.test(codeOf(f)))
    expect(offenders).toEqual([])
  })

  /**
   * THE NARROW GUARD (EI-S1.5A gate N).
   *
   * `CRON_SECRET` is legitimate scheduler authentication and is NOT banned —
   * generation routes still use it. What must never return is an Executive
   * Intelligence READ surface whose authorization is the shared secret, because
   * a reusable infrastructure secret is not a principal, project ownership or
   * portfolio authority. Scoped to Executive Intelligence read routes only.
   */
  it('no Executive Intelligence READ route authorizes on the shared secret', () => {
    const eiRoutes = walk(resolve(APP, 'api/atlas/intelligence'))
      .filter(f => f.endsWith('route.ts'))
    expect(eiRoutes.length).toBeGreaterThan(0)

    for (const file of eiRoutes) {
      const text = readFileSync(file, 'utf8')
      const usesSharedSecret = /CRON_SECRET/.test(text)
      const isGenerationRoute = /\/cron\//.test(file)
      // A shared-secret route under this tree may only be a generation route.
      if (usesSharedSecret) {
        expect(isGenerationRoute, `${file} authorizes on CRON_SECRET but is not a cron route`).toBe(true)
      }
      // And no route here may read intelligence without a principal.
      if (/queryIntelligence\s*\(/.test(text)) {
        expect(
          /resolveProjectAccess|readExecutiveBriefForPrincipal|assertProjectAllowed/.test(text),
          `${file} reads intelligence without the principal boundary`,
        ).toBe(true)
      }
    }
  })

  it('the GENERATION cron route is untouched and still shared-secret authenticated', () => {
    const cron = resolve(APP, 'api/atlas/intelligence/cron/brief/route.ts')
    expect(existsSync(cron)).toBe(true)
    const text = readFileSync(cron, 'utf8')
    expect(text).toContain('CRON_SECRET')
    expect(text).toContain('runExecutiveBriefProducer')
    // It generates; it is not a read surface.
    expect(text).not.toMatch(/queryIntelligence\s*\(/)
  })

  it('the pg_cron schedule still targets the generation path, not the read path', () => {
    const sql = readFileSync(
      resolve(REPO_ROOT, 'supabase/migrations/20260629_200000_atlas_intelligence_cron.sql'), 'utf8')
    expect(sql).toContain('/api/atlas/intelligence/cron/brief')
    expect(sql).not.toMatch(/call_vercel\('\/api\/atlas\/intelligence\/brief'\)/)
  })

  it('no Vercel cron entry references any intelligence brief endpoint', () => {
    const vercelJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'apps/web/vercel.json'), 'utf8'))
    const paths: string[] = (vercelJson.crons ?? []).map((c: { path: string }) => c.path)
    expect(paths.some(p => p.includes('intelligence/brief'))).toBe(false)
  })

  /**
   * Gate G, stated as a test. Retiring one route must not turn into a repo-wide
   * purge: `CRON_SECRET` is the scheduler's legitimate authentication for
   * dozens of unrelated jobs, and generation is one of them. What EI-S1.5A
   * removed is the use of that secret to authorize a user-facing DATA READ.
   */
  it('leaves CRON_SECRET intact for unrelated scheduler routes', () => {
    const users = walk(resolve(APP, 'api'))
      .filter(f => f.endsWith('route.ts') && /CRON_SECRET/.test(readFileSync(f, 'utf8')))
    expect(users.length).toBeGreaterThan(20)
    // ...including scheduler routes with nothing to do with Executive Intelligence.
    expect(users.some(f => f.includes('media/cron/heartbeat'))).toBe(true)
    expect(users.some(f => f.includes('bugscanner/scan-all'))).toBe(true)
  })

  it('introduces no Executive Intelligence write or external side effect', () => {
    // The retirement deleted a GET. Nothing in the read boundary may write.
    const code = codeOf(resolve(LIB, 'atlas/intelligence/principal-read.ts'))
    expect(code).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
    expect(code).not.toMatch(/\bfetch\(/)
    expect(code).not.toMatch(/persistIntelligence|writeIntelligence/)
  })

  it('no replacement shared-secret / system-principal model was introduced', () => {
    const code = codeOf(resolve(LIB, 'atlas/intelligence/principal-read.ts'))
    expect(code).not.toMatch(/CRON_SECRET/)
    expect(code).not.toMatch(/API_KEY|api_key|systemPrincipal|SYSTEM_PRINCIPAL/)
    // Still the real principal boundary.
    expect(code).toMatch(/resolveProjectAccess|getAllowedProjectIds/)
  })
})
