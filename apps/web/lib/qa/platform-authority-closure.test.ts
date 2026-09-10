/**
 * Phase 9AC — platform authority closure (closure audit #6: A6-1, A6-2, A6-3).
 *
 * The audit found three places where an ordinary signed-in session, even one
 * that owns a project, reached something only platform authority may reach:
 *
 *   A6-1  POST /api/manager {action:'daily_plan'} built a plan from EVERY
 *         tenant's runs, failures, approvals, agents and tasks, paid for it on
 *         the platform's budget, and cached it as the platform's plan, which
 *         GET /api/manager then served to anyone. Naming your own project did
 *         not help: `buildContext(projectId)` scoped nothing.
 *   A6-2  /atlas?ui=legacy read the platform bug digest (every project's scan
 *         findings and open critical reports) through the service-role client
 *         for any session. `?ui=` chooses a UI. It has never been authority.
 *   A6-3  A project owner could post to the platform's Instagram, Facebook and
 *         YouTube: directly through /api/media/publish/instagram, through the
 *         breaking chain's machine hops (which also posted the OLDEST ready
 *         script on the platform instead of the one just made), and through
 *         the scheduled machine publishers, which posted any tenant's approved
 *         video.
 *
 * The rule is the one the platform already had:
 *
 *   PROJECT OWNER  ≠  PORTFOLIO / PLATFORM OPERATOR  ≠  MACHINE PRINCIPAL
 *
 * One multi-tenant world drives everything: User A owns Project A, User B owns
 * Project B, User C is signed in and owns nothing, and the Operator is the
 * configured platform operator who owns the platform social project. Production
 * today has one user who owns every project, which hides all three findings,
 * so nothing here is allowed to lean on that.
 *
 * A denial is proven by what did NOT happen, not by a status code alone: zero
 * service-role clients, zero context or digest reads, zero model calls, zero
 * cache writes, zero tokens read and zero posts. The fake database applies its
 * filters (including `!inner` embedded filters, and NOT applying them when the
 * embed is a plain left join), so a guard that only looks right cannot pass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'

// Server components in the legacy Atlas page use the classic JSX runtime.
;(globalThis as unknown as { React: typeof React }).React = React

// ═══ The world ═══════════════════════════════════════════════════════════════

const USER_A = 'user-a'
const USER_B = 'user-b'
const USER_C = 'user-c'
const OPERATOR = 'user-operator'
const EMAIL: Record<string, string> = {
  [USER_A]: 'owner-a@tenant-a.test',
  [USER_B]: 'owner-b@tenant-b.test',
  [USER_C]: 'nobody@no-project.test',
  [OPERATOR]: 'ops@omnira.test',
}
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
/** The platform social project: the one whose accounts the publishers post to. */
const SOCIAL = '99999999-9999-4999-8999-999999999999'
const SOCIAL_SLUG = 'ai-media-automation'
const CRON = 'test-cron-secret'

type Row = Record<string, any>

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function project(id: string, ownerId: string, name: string, slug: string): Row {
  return { id, owner_id: ownerId, name, slug, color: '#888888', settings: {}, created_at: minutesAgo(50_000) }
}

/** One project's operational rows. Every one carries that project's marker. */
function operations(projectId: string, tag: string) {
  return {
    runs: [{
      id: `run-${tag}-000001`, project_id: projectId, workflow_id: `wf-${tag}`, status: 'failed',
      error: `${tag}-SECRET-ERROR credential rejected`, created_at: minutesAgo(60), finished_at: minutesAgo(59),
      workflows: { name: `${tag}-SECRET-WORKFLOW` },
    }],
    agents: [{
      id: `agent-${tag}`, project_id: projectId, name: `${tag}-SECRET-AGENT`, model: 'claude-sonnet-4-6',
      system_prompt: 'You are an agent.',
    }],
    approvals: [{
      id: `appr-${tag}-000001`, project_id: projectId, output_key: `out-${tag}`, content: `${tag}-SECRET-CONTENT`,
      status: 'pending', created_at: minutesAgo(30), runs: { workflows: { name: `${tag}-SECRET-APPROVAL-WF` } },
    }],
    manager_tasks: [{
      id: `task-${tag}`, project_id: projectId, title: `${tag}-SECRET-TASK`, description: null,
      status: 'pending', priority: 'high', source: null, created_at: minutesAgo(20),
    }],
  }
}

function mediaScript(id: string, projectId: string, over: Row = {}): Row {
  return {
    id, project_id: projectId, news_item_id: null,
    hook: `${id}-HOOK`, script: 'body', cta: null, hashtags: [], captions: [], tone: 'insider',
    status: 'approved', voice_status: 'ready', video_status: 'ready',
    video_url: `https://cdn.test/${id}.mp4`, render_id: null, render_bucket: null,
    audio_url: `https://cdn.test/${id}.mp3`, timing_url: `https://cdn.test/${id}.json`,
    duration_ms: 20_000, images: [], composition: 'SimpleNewsReel', retry_count: 0, breaking: false,
    instagram_creation_id: null, instagram_creation_id_at: null, instagram_media_id: null, instagram_url: null,
    facebook_post_id: null, facebook_url: null, youtube_video_id: null, youtube_url: null,
    published_at: null, generated_at: minutesAgo(180), updated_at: minutesAgo(180),
    media_news_items: null,
    ...over,
  }
}

/**
 * The multi-tenant world. Ready, approved scripts exist in all three projects,
 * and the OLDEST belongs to User B: a publisher that picks "the oldest ready
 * script on the platform" posts another tenant's video.
 */
function tenantWorld(): Record<string, Row[]> {
  const a = operations(PROJECT_A, 'A')
  const b = operations(PROJECT_B, 'B')
  const s = operations(SOCIAL, 'S')
  return {
    projects: [
      project(PROJECT_A, USER_A, 'A-SECRET-PROJECT', 'tenant-a'),
      project(PROJECT_B, USER_B, 'B-SECRET-PROJECT', 'tenant-b'),
      project(SOCIAL, OPERATOR, 'S-SECRET-PROJECT', SOCIAL_SLUG),
    ],
    runs: [...a.runs, ...b.runs, ...s.runs],
    agents: [...a.agents, ...b.agents, ...s.agents],
    approvals: [...a.approvals, ...b.approvals, ...s.approvals],
    manager_tasks: [...a.manager_tasks, ...b.manager_tasks, ...s.manager_tasks],
    run_logs: [],
    agent_messages: [],
    media_news_items: [],
    media_scripts: [
      mediaScript('script-b-old', PROJECT_B, { generated_at: minutesAgo(360) }),
      mediaScript('script-a', PROJECT_A, { generated_at: minutesAgo(300) }),
      mediaScript('script-social', SOCIAL, { generated_at: minutesAgo(180) }),
    ],
    bugscan_runs: [{
      id: 'bsr-1', started_at: minutesAgo(300), finished_at: minutesAgo(299),
      ok: 10, warnings: 0, errors: 1, summary: {}, created_at: minutesAgo(300),
    }],
    bugscan_findings: [{
      id: 'bf-a', run_id: 'bsr-1', project_id: PROJECT_A, project_name: 'A-SECRET-SITE',
      check_name: 'A-SECRET-CHECK', status: 'error', message: 'A-SECRET-FINDING-MESSAGE', is_new: true,
      fix_prompt: 'A-SECRET-FINDING-FIX', created_at: minutesAgo(299),
    }],
    bug_reports: [{
      id: 'br-a', project_id: PROJECT_A, source: 'system', severity: 'critical',
      title: 'A-SECRET-REPORT-TITLE', detail: 'A-SECRET-REPORT-DETAIL', area: 'checkout',
      repro: 'A-SECRET-REPRO', fix_prompt: 'A-SECRET-REPORT-FIX', status: 'open',
      dedupe_key: 'a-1', emailed_at: null, created_at: minutesAgo(60), resolved_at: null,
    }],
  }
}

/** The production shape: the operator owns every project. */
function operatorWorld(): Record<string, Row[]> {
  const world = tenantWorld()
  world.projects = world.projects.map(p => ({ ...p, owner_id: OPERATOR }))
  return world
}

// ═══ A PostgREST-shaped fake that APPLIES what it is asked ═══════════════════

interface Logged { table: string; op: string; columns: string; filters: string[] }

const getPath = (row: any, path: string): unknown =>
  path.split('.').reduce((acc: any, key) => (acc == null ? acc : acc[key]), row)

/** `name!inner ( … )` / `name ( … )` → embed name → inner join? */
function embedsOf(columns: string): Map<string, boolean> {
  const embeds = new Map<string, boolean>()
  for (const m of columns.matchAll(/([A-Za-z_][A-Za-z0-9_]*)(!inner)?\s*\(/g)) embeds.set(m[1], !!m[2])
  return embeds
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

/** One `col.op.value` term of a PostgREST `or=(…)`. NULL never equals, and `neq` on NULL is not true. */
function orTerm(row: Row, term: string): boolean {
  const m = term.match(/^([A-Za-z0-9_.]+?)\.(eq|neq|is|lt|lte|gt|gte|in)\.(.*)$/)
  if (!m) throw new Error(`fake db: unsupported or() term ${term}`)
  const [, col, op, raw] = m
  const v = getPath(row, col)
  switch (op) {
    case 'is':  return raw === 'null' ? v == null : String(v) === raw
    case 'eq':  return v != null && String(v) === raw
    case 'neq': return v != null && String(v) !== raw
    case 'lt':  return v != null && compare(v, raw) < 0
    case 'lte': return v != null && compare(v, raw) <= 0
    case 'gt':  return v != null && compare(v, raw) > 0
    case 'gte': return v != null && compare(v, raw) >= 0
    case 'in':  return v != null && raw.replace(/^\(|\)$/g, '').split(',').includes(String(v))
  }
  return false
}

function splitTopLevel(expr: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of expr) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

const stripUndefined = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined))

class FakeDb {
  tables: Record<string, Row[]>
  log: Logged[] = []
  private seq = 0

  constructor(seed: Record<string, Row[]>) {
    this.tables = JSON.parse(JSON.stringify(seed))
  }

  nextId(table: string): string {
    this.seq += 1
    return `${table}-new-${this.seq}`
  }

  from(table: string): any {
    return queryBuilder(this, table)
  }

  async rpc(fn: string, args?: Record<string, unknown>) {
    this.log.push({ table: `rpc:${fn}`, op: 'rpc', columns: '', filters: [] })
    if (fn !== 'stop_state') return { data: null, error: { message: `unexpected rpc ${fn}` } }
    const wants = args?.p_project_id != null
    return {
      data: [{
        global_paused: false, global_paused_at: null, global_paused_reason: null,
        project_requested: wants, project_found: wants, project_paused: wants ? false : null,
        project_paused_at: null, project_paused_reason: null,
      }],
      error: null,
    }
  }

  selects(...tables: string[]): Logged[] {
    return this.log.filter(l => l.op === 'select' && tables.includes(l.table))
  }

  mutations(table: string): Logged[] {
    return this.log.filter(l => l.table === table && ['insert', 'update', 'upsert', 'delete'].includes(l.op))
  }
}

const DROP = Symbol('drop')

function queryBuilder(db: FakeDb, table: string): any {
  let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  let columns = '*'
  let returning = false
  let head = false
  let payload: any
  let limitN: number | undefined
  const filters: { label: string; col: string; test: (v: unknown) => boolean }[] = []
  const ors: string[] = []
  const orders: [string, boolean][] = []

  /** The row as PostgREST would shape it for this select: embeds attached, inner joins enforced. */
  const view = (row: Row, embeds: Map<string, boolean>): Row | typeof DROP => {
    const v: Row = { ...row }
    for (const [name, inner] of embeds) {
      if (name === 'projects' && 'project_id' in row && row.projects === undefined) {
        const p = (db.tables.projects ?? []).find(x => x.id === row.project_id)
        v.projects = p ? { ...p } : null
      }
      if (inner && v[name] == null) return DROP
    }
    return v
  }

  const passes = (v: Row, embeds: Map<string, boolean>): boolean => {
    for (const f of filters) {
      if (f.col.includes('.')) {
        const embed = f.col.split('.')[0]
        if (!embeds.has(embed)) throw new Error(`fake db: filter on ${f.col} but ${embed} is not selected`)
        const ok = f.test(getPath(v, f.col))
        if (embeds.get(embed)) { if (!ok) return false }
        // A plain (left) embed: the filter shapes the embed, never the parent row.
        else if (!ok) v[embed] = null
        continue
      }
      if (!f.test(getPath(v, f.col))) return false
    }
    for (const expr of ors) {
      if (!splitTopLevel(expr).some(term => orTerm(v, term))) return false
    }
    return true
  }

  const shape = (data: Row[] | null, mode: 'many' | 'single' | 'maybe') => {
    if (mode === 'many' || data === null) return { data, error: null, count: data?.length ?? null }
    if (mode === 'single') {
      return data.length === 1
        ? { data: data[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
    }
    if (data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } }
    return { data: data[0] ?? null, error: null }
  }

  const execute = (mode: 'many' | 'single' | 'maybe') => {
    db.log.push({
      table, op, columns,
      filters: [...filters.map(f => f.label), ...ors.map(o => `or:${o}`)],
    })
    const base = (db.tables[table] ??= [])
    const embeds = embedsOf(columns)

    if (op === 'insert' || op === 'upsert') {
      const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({
        id: db.nextId(table), created_at: new Date().toISOString(), ...stripUndefined(r),
      }))
      for (const r of rows) {
        const at = op === 'upsert' ? base.findIndex(x => x.id === r.id) : -1
        if (at >= 0) base[at] = { ...base[at], ...r }
        else base.push(r)
      }
      const out = rows.map(r => view(r, embeds)).filter((r): r is Row => r !== DROP)
      return shape(returning ? out : null, mode)
    }

    const matched: { row: Row; v: Row }[] = []
    for (const row of base) {
      const v = view(row, embeds)
      if (v === DROP) continue
      if (passes(v, embeds)) matched.push({ row, v })
    }

    if (op === 'update') {
      for (const m of matched) Object.assign(m.row, stripUndefined(payload ?? {}))
      const out = matched.map(m => view(m.row, embeds)).filter((r): r is Row => r !== DROP)
      return shape(returning ? out : null, mode)
    }
    if (op === 'delete') {
      db.tables[table] = base.filter(r => !matched.some(m => m.row === r))
      return shape(returning ? matched.map(m => m.v) : null, mode)
    }

    let rows = matched.map(m => m.v)
    if (orders.length > 0) {
      rows = [...rows].sort((x, y) => {
        for (const [col, asc] of orders) {
          const a = getPath(x, col)
          const b = getPath(y, col)
          if (a == null && b == null) continue
          if (a == null) return asc ? 1 : -1
          if (b == null) return asc ? -1 : 1
          const c = compare(a, b)
          if (c !== 0) return asc ? c : -c
        }
        return 0
      })
    }
    if (limitN !== undefined) rows = rows.slice(0, limitN)
    if (head) return { data: null, error: null, count: rows.length }
    return shape(rows, mode)
  }

  const filter = (label: string, col: string, test: (v: unknown) => boolean) => {
    filters.push({ label: `${label}:${col}`, col, test })
    return b
  }

  const b: any = {
    select(cols = '*', opts?: { head?: boolean }) {
      if (op === 'select') { columns = cols; if (opts?.head) head = true }
      else { returning = true; columns = cols }
      return b
    },
    insert(p: unknown) { op = 'insert'; payload = p; return b },
    upsert(p: unknown) { op = 'upsert'; payload = p; return b },
    update(p: unknown) { op = 'update'; payload = p; return b },
    delete() { op = 'delete'; return b },
    eq: (c: string, v: unknown) => filter('eq', c, x => x != null && x === v),
    neq: (c: string, v: unknown) => filter('neq', c, x => x != null && x !== v),
    in: (c: string, vs: unknown[]) => filter('in', c, x => x != null && vs.includes(x)),
    is: (c: string, v: unknown) => filter('is', c, x => (v === null ? x == null : x === v)),
    not: (c: string, o: string, v: unknown) => filter('not', c, x =>
      o === 'is' ? (v === null ? x != null : x !== v)
        : o === 'eq' ? x !== v
          : o === 'in' ? !(v as unknown[]).includes(x)
            : true),
    gt: (c: string, v: unknown) => filter('gt', c, x => x != null && compare(x, v) > 0),
    gte: (c: string, v: unknown) => filter('gte', c, x => x != null && compare(x, v) >= 0),
    lt: (c: string, v: unknown) => filter('lt', c, x => x != null && compare(x, v) < 0),
    lte: (c: string, v: unknown) => filter('lte', c, x => x != null && compare(x, v) <= 0),
    or: (expr: string) => { ors.push(expr); return b },
    order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return b },
    limit: (n: number) => { limitN = n; return b },
    single: async () => execute('single'),
    maybeSingle: async () => execute('maybe'),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve().then(() => execute('many')).then(ok, err),
  }
  return b
}

// ═══ Seams: session, service role, model, publishers ═════════════════════════

let DB: FakeDb
let ADMIN_CLIENTS = 0
let CURRENT_USER: { id: string; email: string } | null = null

/** Every Anthropic client built and every prompt sent. */
let MODEL_CLIENTS: { operation: string; project: unknown }[] = []
let PROMPTS: { operation: string; prompt: string }[] = []
/** Every packet that left for Instagram, Facebook, YouTube or Lambda. */
let EXTERNAL: string[] = []
let TOKEN_READS: string[] = []
/** Every cron-authenticated sub-request a route made. */
let HOPS: string[] = []
let COOKIE: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: CURRENT_USER }, error: null }) },
    // The RLS client can only ever see the caller's own projects.
    from: (t: string) => new FakeDb({
      projects: (DB.tables.projects ?? []).filter(p => p.owner_id === CURRENT_USER?.id),
    }).from(t),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { ADMIN_CLIENTS += 1; return DB },
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) },
  notFound: () => { throw new Error('NOT_FOUND') },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (COOKIE ? { value: COOKIE } : undefined) }),
}))

/** A model that does what it is asked: it repeats every marker it was shown. */
function modelReply(prompt: string): string {
  const markers = [...new Set(prompt.match(/\b[ABS]-SECRET-[A-Z-]+[A-Z]\b/g) ?? [])]
  if (prompt.includes('Analyze this article')) {
    return JSON.stringify({ title: 'Breaking', summary: 'S', key_insight: 'K', virality_score: 9,
      target_audience: 'intermediate', content_angle: 'educational', source_name: 'Src' })
  }
  if (prompt.includes('Write a short-form video script')) {
    return JSON.stringify({ hook: 'BREAKING-HOOK', script: 'B', captions: ['c'], hashtags: ['#ai'],
      cta: 'x', tone: 'insider', estimated_duration: '~20s' })
  }
  if (prompt.includes("Generate today's operational priorities")) {
    return JSON.stringify({ priorities: [{ title: markers.join(' ') || 'nothing', reason: 'r', urgency: 'high' }],
      concerns: markers, opportunities: [], summary: 'plan' })
  }
  if (prompt.includes('Break this goal into')) {
    return JSON.stringify(markers.map(m => ({ title: m, description: m, priority: 'high' })))
  }
  return `seen: ${markers.join(' ')}`
}

vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: (opts: { operation?: string; project?: unknown }) => {
    MODEL_CLIENTS.push({ operation: String(opts?.operation), project: opts?.project })
    return {
      messages: {
        create: async (params: { messages?: { content: unknown }[] }) => {
          const prompt = (params.messages ?? [])
            .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n')
          PROMPTS.push({ operation: String(opts?.operation), prompt })
          return { content: [{ type: 'text', text: modelReply(prompt) }], usage: { input_tokens: 1, output_tokens: 1 } }
        },
      },
    }
  },
}))

vi.mock('@/lib/media/instagram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/instagram')>()
  return {
    ...actual,
    postReelToInstagram: async (videoUrl: string) => {
      EXTERNAL.push(`instagram.publish:${videoUrl}`)
      return { mediaId: `ig:${videoUrl}`, permalink: `https://instagram.test/${encodeURIComponent(videoUrl)}` }
    },
    createReelContainer: async (videoUrl: string) => {
      EXTERNAL.push(`instagram.container:${videoUrl}`)
      return `container:${videoUrl}`
    },
    pollUntilReady: async () => {},
    publishContainer: async (creationId: string) => {
      EXTERNAL.push(`instagram.publish:${creationId.replace(/^container:/, '')}`)
      return { mediaId: `ig:${creationId}`, permalink: `https://instagram.test/p/${encodeURIComponent(creationId)}` }
    },
    getContainerStatus: async () => 'FINISHED' as const,
    resolvePublishedMedia: async () => null,
  }
})
vi.mock('@/lib/media/facebook', () => ({
  postReelToFacebook: async (videoUrl: string) => {
    EXTERNAL.push(`facebook.publish:${videoUrl}`)
    return { postId: `fb:${videoUrl}`, url: `https://facebook.test/${encodeURIComponent(videoUrl)}` }
  },
}))
vi.mock('@/lib/media/youtube', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/youtube')>()
  return {
    ...actual,
    isYouTubeConfigured: () => true,
    uploadShort: async (o: { videoUrl: string }) => {
      EXTERNAL.push(`youtube.upload:${o.videoUrl}`)
      return { videoId: `yt:${o.videoUrl}`, url: `https://youtube.test/${encodeURIComponent(o.videoUrl)}` }
    },
  }
})
vi.mock('@/lib/media/token-store', () => ({
  getToken: async (platform: string) => {
    TOKEN_READS.push(platform)
    return { accessToken: 'PLATFORM-TOKEN', accountId: null, expiresAt: null, source: 'env' }
  },
  setToken: async (platform: string) => { EXTERNAL.push(`token.set:${platform}`) },
}))
vi.mock('@/lib/media/lambda-render', () => ({
  getLambdaRenderProgress: async (renderId: string) =>
    ({ done: true, progress: 1, videoUrl: `https://cdn.test/render/${renderId}.mp4` }),
  startLambdaRender: async (scriptId: string) => {
    EXTERNAL.push(`lambda.render:${scriptId}`)
    return { renderId: `render-${scriptId}`, bucketName: 'bucket' }
  },
}))
vi.mock('@/lib/media/video-props', () => ({ buildVideoInputProps: async () => ({}) }))
vi.mock('@/lib/media/alert', () => ({ sendPipelineAlert: async () => {}, sendRunReport: async () => {} }))
vi.mock('@/lib/media/run-log', () => ({ logRun: async () => null }))
/** Every call the legacy page makes into the digest, and the authority it passed. */
let DIGEST_CALLS: unknown[] = []
vi.mock('@/lib/bugs/digest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bugs/digest')>()
  return {
    ...actual,
    getMorningBugDigest: (db: unknown, operator: Parameters<typeof actual.getMorningBugDigest>[1]) => {
      DIGEST_CALLS.push(operator)
      return actual.getMorningBugDigest(db, operator)
    },
  }
})
vi.mock('@/lib/media/quality', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/quality')>()),
  scoreScript: async () => ({ overall: 9, hook_strength: 9, verdict: 'ok', weak_spots: [] }),
}))

/**
 * The breaking chain's cron-authenticated sub-requests, dispatched IN-PROCESS to
 * the real handlers for step4, publish and youtube. step2 (voice) and step3
 * (render start) are simulated — 9W owns their authority; here they only move
 * the script along so the real render poll and the real publishers run.
 */
async function internalFetch(input: unknown, init?: { method?: string; headers?: Record<string, string> }) {
  const url = new URL(String(typeof input === 'string' ? input : (input as { url: string }).url))
  HOPS.push(`${url.pathname}${url.search}`)
  const request = new Request(url.toString(), { method: init?.method ?? 'GET', headers: init?.headers })
  const machine = request.headers.get('authorization') === `Bearer ${CRON}`
  const scriptId = url.searchParams.get('scriptId')
  switch (url.pathname) {
    case '/api/media/cron/step2':
      return machine ? Response.json({ status: 'voice_done' }) : Response.json({ error: 'Unauthorized' }, { status: 401 })
    case '/api/media/cron/step3': {
      if (!machine) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const row = DB.tables.media_scripts.find(r => r.id === scriptId)
      if (row) Object.assign(row, { voice_status: 'ready', video_status: 'rendering', render_id: `render-${scriptId}`, render_bucket: 'bucket' })
      return Response.json({ status: 'render_started' })
    }
    case '/api/media/cron/step4':
      return (await import('@/app/api/media/cron/step4/route')).GET(request)
    case '/api/media/cron/publish':
      return (await import('@/app/api/media/cron/publish/route')).GET(request)
    case '/api/media/cron/youtube':
      return (await import('@/app/api/media/cron/youtube/route')).GET(request)
    default:
      throw new Error(`unexpected internal hop ${url.pathname}`)
  }
}

// ═══ Helpers ═════════════════════════════════════════════════════════════════

function as(userId: string | null) {
  CURRENT_USER = userId ? { id: userId, email: EMAIL[userId] } : null
}

function world(seed: () => Record<string, Row[]>) {
  DB = new FakeDb(seed())
}

const ENV_KEYS = ['PLATFORM_OPERATOR_EMAILS', 'BREVO_ADMIN_EMAIL', 'CRON_SECRET', 'NEXT_PUBLIC_SITE_URL',
  'INSTAGRAM_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'] as const
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.resetModules()
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))
  process.env.PLATFORM_OPERATOR_EMAILS = EMAIL[OPERATOR]
  delete process.env.BREVO_ADMIN_EMAIL
  process.env.CRON_SECRET = CRON
  process.env.NEXT_PUBLIC_SITE_URL = 'https://omnira.test'
  process.env.INSTAGRAM_ACCESS_TOKEN = 'IG-PLATFORM-TOKEN'
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'FB-PLATFORM-TOKEN'
  process.env.FACEBOOK_PAGE_ID = 'platform-page'
  world(tenantWorld)
  as(USER_A)
  ADMIN_CLIENTS = 0
  MODEL_CLIENTS = []
  PROMPTS = []
  EXTERNAL = []
  TOKEN_READS = []
  HOPS = []
  COOKIE = null
  DIGEST_CALLS = []
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const allPrompts = () => PROMPTS.map(p => p.prompt).join('\n')
const markersIn = (text: string, tag: 'A' | 'B' | 'S') => text.match(new RegExp(`\\b${tag}-SECRET-[A-Z-]+[A-Z]\\b`, 'g')) ?? []

// ─── /api/manager ────────────────────────────────────────────────────────────

async function managerPost(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/manager/route')
  return POST(new Request('https://omnira.test/api/manager', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any)
}
async function managerGet(): Promise<Response> {
  const { GET } = await import('@/app/api/manager/route')
  return GET(new Request('https://omnira.test/api/manager') as any)
}

const CONTEXT_TABLES = ['runs', 'agents', 'approvals', 'manager_tasks', 'run_logs']
const planCacheReads = () => DB.selects('agent_messages')
const planCacheWrites = () => DB.mutations('agent_messages')

/** Nothing privileged happened: no service-role client, no query, no model, no cache. */
function expectZeroCost() {
  expect(ADMIN_CLIENTS, 'a service-role client was created for a denied caller').toBe(0)
  expect(DB.log, 'the database was queried for a denied caller').toEqual([])
  expect(MODEL_CLIENTS, 'an Anthropic client was built for a denied caller').toEqual([])
  expect(PROMPTS, 'the model was called for a denied caller').toEqual([])
}

/** A cached platform plan, as the operator would have produced it earlier today. */
function seedCachedPlatformPlan() {
  DB.tables.agent_messages.push({
    id: 'plan-cached', from_agent: 'manager', to_agent: 'human', message_type: 'daily_plan',
    content: JSON.stringify({ priorities: [{ title: 'S-SECRET-CACHED-PLAN', reason: 'r', urgency: 'high' }],
      concerns: ['A-SECRET-CACHED-CONCERN'], opportunities: [], summary: 'B-SECRET-CACHED-SUMMARY' }),
    metadata: { date: new Date().toISOString().slice(0, 10) }, created_at: new Date().toISOString(),
  })
}

// ─── legacy /atlas ───────────────────────────────────────────────────────────

function collect(node: any, out: string[], depth = 0) {
  if (node == null || depth > 80) return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const c of node) collect(c, out, depth + 1); return }
  if (typeof node !== 'object') return
  for (const [k, v] of Object.entries(node.props ?? node)) {
    if (k === 'className' || k === 'icon') continue
    collect(v, out, depth + 1)
  }
}

async function renderAtlas(searchParams?: { ui?: string }): Promise<string> {
  const { default: AtlasHome } = await import('@/app/(platform)/atlas/page')
  const element = await AtlasHome({ searchParams })
  const out: string[] = []
  collect(element, out)
  return out.join(' | ')
}

const BUG_TABLES = ['bugscan_runs', 'bugscan_findings', 'bug_reports']

// ─── media ───────────────────────────────────────────────────────────────────

const jsonRequest = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

async function publishInstagram(scriptId: string): Promise<Response> {
  const { POST } = await import('@/app/api/media/publish/instagram/route')
  return POST(jsonRequest('https://omnira.test/api/media/publish/instagram', { scriptId }))
}

/** The SSE body, parsed. The stream closes itself when the route is done. */
async function events(res: Response): Promise<Row[]> {
  const text = await res.text()
  return text.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5).trim()) as Row)
}

async function breaking(body: Record<string, unknown>, machine = false): Promise<Response> {
  vi.stubGlobal('fetch', internalFetch)
  // The route sleeps 12 s per render poll; collapse the wait, not the logic.
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
  const { POST } = await import('@/app/api/media/breaking/route')
  return POST(jsonRequest('https://omnira.test/api/media/breaking', body,
    machine ? { authorization: `Bearer ${CRON}` } : {}))
}

async function cronHandler(route: 'publish' | 'youtube' | 'step4' | 'pipeline-retry') {
  switch (route) {
    case 'publish':        return (await import('@/app/api/media/cron/publish/route')).GET
    case 'youtube':        return (await import('@/app/api/media/cron/youtube/route')).GET
    case 'step4':          return (await import('@/app/api/media/cron/step4/route')).GET
    case 'pipeline-retry': return (await import('@/app/api/media/cron/pipeline-retry/route')).GET
  }
}

async function cron(route: 'publish' | 'youtube' | 'step4' | 'pipeline-retry', query = ''): Promise<Response> {
  const GET = await cronHandler(route)
  return GET(new Request(`https://omnira.test/api/media/cron/${route}${query}`, {
    headers: { authorization: `Bearer ${CRON}` },
  }))
}

const posted = (scriptId: string) => EXTERNAL.filter(e => e.includes(scriptId))
const publishCalls = () => EXTERNAL.filter(e => /^(instagram|facebook|youtube)\./.test(e))
const scriptsInsertedBy = () => DB.tables.media_scripts.filter(r => String(r.id).startsWith('media_scripts-new-'))

// ═══════════════════════════════════════════════════════════════════════════════
// A6-1 — the Manager's daily plan
// ═══════════════════════════════════════════════════════════════════════════════

describe('A6-1 · an ordinary session gets no part of the platform daily plan', () => {
  it('1 · unauthenticated → 401, and nothing is read or paid for', async () => {
    as(null)
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(401)
    expectZeroCost()
  })

  it('2 · a signed-in user who owns no project → 403 at zero cost', async () => {
    as(USER_C)
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ denied: 'platform_authority_required' })
    expectZeroCost()
    expect(planCacheWrites()).toEqual([])
  })

  it('3 · the owner of one project → 403 at zero cost', async () => {
    as(USER_A)
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(403)
    expectZeroCost()
    expect(planCacheWrites()).toEqual([])
  })

  it('4 · naming a FOREIGN project → 403 before that project is ever looked up', async () => {
    as(USER_A)
    const res = await managerPost({ action: 'daily_plan', project_id: PROJECT_B, force: true })
    expect(res.status).toBe(403)
    expectZeroCost()
  })

  it('5 · naming their OWN project does not buy a plan — project_id cannot widen authority', async () => {
    as(USER_A)
    for (const force of [true, false]) {
      const res = await managerPost({ action: 'daily_plan', project_id: PROJECT_A, force })
      expect(res.status).toBe(403)
    }
    expectZeroCost()
  })

  it('the operator alone is not enough while another tenant exists — the plan would be built from their data', async () => {
    as(OPERATOR)   // tenantWorld: A and B are other people's projects
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(403)
    // The only thing read is the authority proof itself: ids and owners of the
    // portfolio. No context table, no model, no cache.
    expect(DB.log.map(l => `${l.table}:${l.columns}`)).toEqual(['projects:id, owner_id'])
    expect(DB.selects(...CONTEXT_TABLES)).toEqual([])
    expect(PROMPTS).toEqual([])
    expect(planCacheWrites()).toEqual([])
  })

  it('owning every project is not enough without platform operator authority', async () => {
    DB = new FakeDb({ ...tenantWorld(), projects: [project(PROJECT_A, USER_A, 'A-SECRET-PROJECT', 'tenant-a')] })
    as(USER_A)   // sole owner of the whole portfolio, but not the operator
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(403)
    expectZeroCost()
  })

  it('no configured operator fails closed — even for the would-be operator', async () => {
    world(operatorWorld)
    delete process.env.PLATFORM_OPERATOR_EMAILS
    delete process.env.BREVO_ADMIN_EMAIL
    as(OPERATOR)
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(403)
    expectZeroCost()
  })
})

describe('A6-1 · the portfolio principal keeps the plan', () => {
  beforeEach(() => { world(operatorWorld); as(OPERATOR) })

  it('6 · the platform operator who owns every project → 200', async () => {
    const res = await managerPost({ action: 'daily_plan', force: true })
    expect(res.status).toBe(200)
  })

  it('7 · …and receives the plan built from the whole portfolio, charged to the platform', async () => {
    const res = await managerPost({ action: 'daily_plan', force: true })
    const { plan } = await res.json()
    const prompt = allPrompts()
    for (const tag of ['A', 'B', 'S'] as const) {
      expect(markersIn(prompt, tag), `the portfolio plan must see project ${tag}`).toEqual(expect.arrayContaining([
        `${tag}-SECRET-PROJECT`, `${tag}-SECRET-WORKFLOW`, `${tag}-SECRET-ERROR`,
        `${tag}-SECRET-APPROVAL-WF`, `${tag}-SECRET-AGENT`, `${tag}-SECRET-TASK`,
      ]))
    }
    expect(plan.priorities[0].title).toContain('A-SECRET-ERROR')
    expect(MODEL_CLIENTS).toEqual([expect.objectContaining({ operation: 'Daily Plan', project: { projectSlug: SOCIAL_SLUG } })])
    // Cached as the PLATFORM plan: no project on the row.
    const cached = planCacheWrites()
    expect(cached).toHaveLength(1)
    expect(DB.tables.agent_messages.find(m => m.message_type === 'daily_plan')?.project_id ?? null).toBeNull()
  })

  it('8 · …and can read the cached plan back, without paying again (POST and GET)', async () => {
    await managerPost({ action: 'daily_plan', force: true })
    expect(PROMPTS).toHaveLength(1)

    const again = await (await managerPost({ action: 'daily_plan' })).json()
    expect(PROMPTS, 'a cached plan must not call the model again').toHaveLength(1)
    expect(again.plan.priorities[0].title).toContain('S-SECRET-')

    const snapshot = await (await managerGet()).json()
    expect(snapshot.daily_plan?.priorities?.[0]?.title).toContain('B-SECRET-')
  })

  it('a project-scoped plan reads THAT project only — the context scope is explicit, never "undefined = everything"', async () => {
    const res = await managerPost({ action: 'daily_plan', project_id: PROJECT_A, force: true })
    expect(res.status).toBe(200)
    const prompt = allPrompts()
    expect(markersIn(prompt, 'A').length).toBeGreaterThan(0)
    expect(markersIn(prompt, 'B'), 'a plan FOR project A read project B').toEqual([])
    expect(markersIn(prompt, 'S'), 'a plan FOR project A read the social project').toEqual([])
    // Billed to, and cached under, the project it is for.
    expect(MODEL_CLIENTS[0]?.project).toEqual({ projectId: PROJECT_A })
    expect(DB.tables.agent_messages.find(m => m.message_type === 'daily_plan')?.project_id).toBe(PROJECT_A)
  })

  it('a project plan is never served as the platform plan', async () => {
    await managerPost({ action: 'daily_plan', project_id: PROJECT_A, force: true })
    const snapshot = await (await managerGet()).json()
    expect(snapshot.daily_plan, 'GET serves the PLATFORM plan; project A’s plan is not it').toBeNull()
  })
})

describe('A6-1 · the cached plan is not a shared artifact', () => {
  it('9 · an ordinary session never reads the cached platform plan — not via GET, not via POST', async () => {
    seedCachedPlatformPlan()
    // The route's own check, not just the Manager's backstop: an ordinary
    // session's request never even asks the Manager for the platform plan.
    const { ManagerAgent } = await import('@/lib/ai/manager')
    const asked = vi.spyOn(ManagerAgent.prototype, 'getTodaysPlan')
    for (const who of [USER_A, USER_B, USER_C]) {
      as(who)
      DB.log = []
      const snapshot = await (await managerGet()).json()
      expect(snapshot.daily_plan, `${who} was served the platform plan`).toBeNull()
      expect(JSON.stringify(snapshot)).not.toMatch(/SECRET-CACHED/)
      expect(planCacheReads().filter(l => l.filters.includes('eq:message_type')),
        `${who}'s GET queried the plan cache`).toEqual([])

      const post = await managerPost({ action: 'daily_plan' })
      expect(post.status).toBe(403)
      expect(JSON.stringify(await post.json())).not.toMatch(/SECRET-CACHED/)
    }
    expect(asked, 'the route asked the Manager for the platform plan for an ordinary session').not.toHaveBeenCalled()
    expect(PROMPTS).toEqual([])
  })

  it('the snapshot a user CAN see is still their own tasks and messages', async () => {
    as(USER_A)
    const snapshot = await (await managerGet()).json()
    expect(snapshot.tasks.map((t: Row) => t.title)).toEqual(['A-SECRET-TASK'])
    expect(JSON.stringify(snapshot)).not.toMatch(/B-SECRET|S-SECRET/)
  })
})

describe('A6-1 · ordering — authority before context, model and cache', () => {
  it('10 · a denial happens before buildContext: no run, agent, approval, task or project is read', async () => {
    for (const who of [USER_A, USER_B, USER_C]) {
      as(who)
      await managerPost({ action: 'daily_plan', force: true })
      await managerPost({ action: 'daily_plan', project_id: PROJECT_A, force: true })
    }
    expect(DB.selects(...CONTEXT_TABLES, 'projects')).toEqual([])
  })

  it('11 · a denial happens before the provider: no Anthropic client, no messages.create', async () => {
    as(USER_B)
    await managerPost({ action: 'daily_plan', force: true })
    await managerPost({ action: 'daily_plan', project_id: PROJECT_B, force: true })
    expect(MODEL_CLIENTS).toEqual([])
    expect(PROMPTS).toEqual([])
  })

  it('12 · a denial happens before the cache: no agent_messages read or write', async () => {
    as(USER_A)
    for (const project_id of [undefined, PROJECT_A]) {
      await managerPost({ action: 'daily_plan', project_id, force: false })
      await managerPost({ action: 'daily_plan', project_id, force: true })
    }
    expect(planCacheReads()).toEqual([])
    expect(planCacheWrites()).toEqual([])
  })
})

describe('A6-1 · the same root cause — a context with no scope — is closed for every caller', () => {
  it('plan_tasks for an owned project builds its prompt from that project alone', async () => {
    as(USER_A)
    const res = await managerPost({ action: 'plan_tasks', goal: 'List every project and its errors', project_id: PROJECT_A })
    expect(res.status).toBe(200)
    const { tasks } = await res.json()
    const prompt = allPrompts()
    expect(markersIn(prompt, 'A').length).toBeGreaterThan(0)
    expect(markersIn(prompt, 'B'), 'plan_tasks showed the model another tenant').toEqual([])
    expect(markersIn(prompt, 'S')).toEqual([])
    expect(JSON.stringify(tasks)).not.toMatch(/B-SECRET|S-SECRET/)
    for (const t of tasks) expect(t.project_id).toBe(PROJECT_A)
  })

  it('chat stays scoped to the caller (control — this path was never unscoped)', async () => {
    as(USER_B)
    const res = await managerPost({ action: 'chat', message: 'status?' })
    expect(res.status).toBe(200)
    const prompt = allPrompts()
    expect(markersIn(prompt, 'B').length).toBeGreaterThan(0)
    expect(markersIn(prompt, 'A')).toEqual([])
  })

  it('the Manager itself refuses platform output without an authority the resolver minted', async () => {
    world(operatorWorld)
    const { getManager } = await import('@/lib/ai/manager')
    const { GLOBAL_ONLY } = await import('@/lib/governance/execution-stop')
    const forged = { ok: true, userId: OPERATOR, actor: `user:${OPERATOR}` } as any
    const manager = getManager()
    await expect(manager.generateDailyPlan(forged, { context: 'OPERATOR_EXECUTION', scope: GLOBAL_ONLY }, undefined, true))
      .rejects.toThrow(/authority/i)
    // A project-scoped plan is still platform output: the Manager refuses it
    // before the project's context is read, not only on the portfolio path.
    await expect(manager.generateDailyPlan(forged, { context: 'OPERATOR_EXECUTION', scope: GLOBAL_ONLY }, PROJECT_A, true))
      .rejects.toThrow(/authority/i)
    await expect(manager.getTodaysPlan(forged)).rejects.toThrow(/authority/i)
    expect(DB.selects(...CONTEXT_TABLES, 'agent_messages')).toEqual([])
    expect(PROMPTS).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// A6-2 — the legacy Atlas morning bug digest
// ═══════════════════════════════════════════════════════════════════════════════

describe('A6-2 · the legacy Atlas bug digest is operator diagnostics', () => {
  it('1 · unauthenticated → sent to login, and no digest is read', async () => {
    as(null)
    await expect(renderAtlas({ ui: 'legacy' })).rejects.toThrow('REDIRECT:/login')
    expect(DB.selects(...BUG_TABLES)).toEqual([])
  })

  it('2 · a signed-in user who owns nothing gets no digest, and no bug table is read', async () => {
    as(USER_C)
    const text = await renderAtlas({ ui: 'legacy' })
    expect(text).not.toMatch(/SECRET/)
    expect(DB.selects(...BUG_TABLES)).toEqual([])
  })

  it('3 · a project owner gets no digest — not even for their own project', async () => {
    as(USER_A)
    const text = await renderAtlas({ ui: 'legacy' })
    expect(text).not.toMatch(/A-SECRET-(SITE|CHECK|FINDING|REPORT)/)
    expect(DB.selects(...BUG_TABLES)).toEqual([])
  })

  it('4 · ?ui=legacy — as a query or a cookie — chooses a UI, not authority', async () => {
    as(USER_B)
    const viaQuery = await renderAtlas({ ui: 'legacy' })
    COOKIE = 'legacy'
    const viaCookie = await renderAtlas()
    for (const text of [viaQuery, viaCookie]) expect(text).not.toMatch(/A-SECRET/)
    expect(DB.selects(...BUG_TABLES)).toEqual([])
  })

  it('5 · the platform operator → the digest is read and rendered', async () => {
    as(OPERATOR)
    const text = await renderAtlas({ ui: 'legacy' })
    expect(text).toContain('A-SECRET-CHECK')
    expect(DIGEST_CALLS).toEqual([expect.objectContaining({ ok: true, userId: OPERATOR })])
    expect(DB.selects(...BUG_TABLES).map(l => l.table)).toEqual(expect.arrayContaining(BUG_TABLES))
  })

  it('6 · no digest read happens without authority — while the page’s own scoped reads still run', async () => {
    for (const who of [USER_A, USER_B, USER_C]) {
      as(who)
      await renderAtlas({ ui: 'legacy' })
    }
    expect(DB.selects(...BUG_TABLES)).toEqual([])
    // The page's own gate, not only the digest's backstop: it never even asks.
    expect(DIGEST_CALLS, 'the page asked for the digest on an ordinary session’s behalf').toEqual([])
    // Control: the legacy render really ran (its scoped context reads happened),
    // so "no digest read" is the gate, not a page that never got that far.
    expect(DB.selects('cost_events').length).toBeGreaterThan(0)
  })

  it('the digest itself reads nothing unless it is handed a resolved operator', async () => {
    const { getMorningBugDigest } = await import('@/lib/bugs/digest')
    for (const denied of [undefined, null, { ok: false, reason: 'not_platform_operator' }]) {
      expect(await getMorningBugDigest(DB, denied as any)).toEqual({ findings: [], reports: [], runAt: null })
    }
    expect(DB.selects(...BUG_TABLES)).toEqual([])
  })

  it('7 · no cross-tenant marker reaches an ordinary user', async () => {
    as(USER_B)
    const text = await renderAtlas({ ui: 'legacy' })
    for (const marker of ['A-SECRET-SITE', 'A-SECRET-CHECK', 'A-SECRET-FINDING-MESSAGE', 'A-SECRET-FINDING-FIX',
      'A-SECRET-REPORT-TITLE', 'A-SECRET-REPORT-DETAIL', 'A-SECRET-REPORT-FIX', 'A-SECRET-REPRO']) {
      expect(text, `${marker} reached user B`).not.toContain(marker)
    }
  })

  it('8 · the operator still sees every project’s findings and open critical reports', async () => {
    as(OPERATOR)
    const text = await renderAtlas({ ui: 'legacy' })
    for (const marker of ['A-SECRET-SITE', 'A-SECRET-CHECK', 'A-SECRET-FINDING-MESSAGE', 'A-SECRET-FINDING-FIX',
      'A-SECRET-REPORT-TITLE', 'A-SECRET-REPORT-DETAIL', 'A-SECRET-REPORT-FIX']) {
      expect(text, `the operator lost ${marker}`).toContain(marker)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// A6-3 — publishing to the platform's Instagram, Facebook and YouTube
// ═══════════════════════════════════════════════════════════════════════════════

describe('A6-3 · direct publish is platform destination authority, not project ownership', () => {
  it('1 · unauthenticated → 401, nothing read, nothing posted', async () => {
    as(null)
    const res = await publishInstagram('script-a')
    expect(res.status).toBe(401)
    expect(ADMIN_CLIENTS).toBe(0)
    expect(publishCalls()).toEqual([])
  })

  it('2 · a signed-in user with no project → 403 before any read, token or post', async () => {
    as(USER_C)
    const res = await publishInstagram('script-a')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ denied: 'platform_operator_required' })
    expect(ADMIN_CLIENTS).toBe(0)
    expect(DB.log).toEqual([])
    expect(TOKEN_READS).toEqual([])
    expect(publishCalls()).toEqual([])
  })

  it('3 · the owner of Project A cannot publish Project B’s script', async () => {
    as(USER_A)
    const res = await publishInstagram('script-b-old')
    expect([403, 404]).toContain(res.status)
    expect(posted('script-b-old')).toEqual([])
  })

  it('5 + 6 · the owner of Project A cannot post Project A’s own script to the platform Instagram or Facebook', async () => {
    as(USER_A)
    const res = await publishInstagram('script-a')
    expect(res.status).toBe(403)
    expect(EXTERNAL.filter(e => e.startsWith('instagram.')), 'Instagram').toEqual([])
    expect(EXTERNAL.filter(e => e.startsWith('facebook.')), 'Facebook').toEqual([])
    expect(ADMIN_CLIENTS, 'a denied publish must not open the service-role client').toBe(0)
    expect(DB.mutations('media_scripts'), 'no publication state may be written').toEqual([])
  })

  it('8 · the operator publishes a script in a project they own — Instagram and Facebook both go out', async () => {
    as(OPERATOR)
    const res = await publishInstagram('script-social')
    expect(res.status).toBe(200)
    const stream = await events(res)
    expect(stream.at(-1)).toMatchObject({ step: 'done' })
    expect(EXTERNAL).toEqual([
      'instagram.publish:https://cdn.test/script-social.mp4',
      'facebook.publish:https://cdn.test/script-social.mp4',
    ])
    expect(DB.tables.media_scripts.find(r => r.id === 'script-social')?.status).toBe('published')
  })

  it('operator authority does not replace content ownership — another tenant’s script is still not theirs', async () => {
    as(OPERATOR)
    const res = await publishInstagram('script-a')
    expect(res.status).toBe(404)
    expect(publishCalls()).toEqual([])
  })

  it('13 + 14 · authorization precedes the service-role client, every token and every provider call', async () => {
    for (const who of [USER_A, USER_B, USER_C]) {
      as(who)
      await publishInstagram(who === USER_B ? 'script-b-old' : 'script-a')
    }
    expect(ADMIN_CLIENTS).toBe(0)
    expect(TOKEN_READS).toEqual([])
    expect(publishCalls()).toEqual([])
  })

  it('an unset operator allow-list fails closed for publishing too', async () => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    as(OPERATOR)
    const res = await publishInstagram('script-social')
    expect(res.status).toBe(403)
    expect(publishCalls()).toEqual([])
  })
})

describe('A6-3 · project content stays the owner’s to manage', () => {
  it('4 · the owner of Project A can still render Project A’s script', async () => {
    as(USER_A)
    const { POST } = await import('@/app/api/media/render/start/route')
    const res = await POST(jsonRequest('https://omnira.test/api/media/render/start', { scriptId: 'script-a' }))
    expect(res.status).toBe(200)
    expect(EXTERNAL).toEqual(['lambda.render:script-a'])
  })

  it('…and still cannot render Project B’s', async () => {
    as(USER_A)
    const { POST } = await import('@/app/api/media/render/start/route')
    const res = await POST(jsonRequest('https://omnira.test/api/media/render/start', { scriptId: 'script-b-old' }))
    expect(res.status).toBe(404)
    expect(EXTERNAL).toEqual([])
  })

  it('9 · the channel-token endpoint stays the social project owner’s alone', async () => {
    const { POST } = await import('@/app/api/media/token/route')
    const body = { platform: 'instagram', token: 'x'.repeat(64) }
    as(USER_A)
    const denied = await POST(jsonRequest('https://omnira.test/api/media/token', body))
    expect(denied.status).toBe(403)
    expect(EXTERNAL).toEqual([])
    as(OPERATOR)
    const allowed = await POST(jsonRequest('https://omnira.test/api/media/token', body))
    expect(allowed.status).toBe(200)
    expect(EXTERNAL).toEqual(['token.set:instagram'])
  })
})

describe('A6-3 · the breaking chain cannot turn a project owner into the platform publisher', () => {
  it('10 · the owner of Project A: the video is made and rendered in A, and nothing is posted anywhere', async () => {
    as(USER_A)
    const res = await breaking({ project_id: PROJECT_A, text: 'an article' })
    expect(res.status).toBe(200)
    const body = await res.json()
    const [made] = scriptsInsertedBy()
    expect(made?.project_id).toBe(PROJECT_A)
    expect(made?.video_status, 'the render still completes — the owner keeps their media').toBe('ready')
    // No machine hop towards a platform destination…
    expect(HOPS.filter(h => /cron\/(publish|youtube)/.test(h)), 'entered the platform publish path').toEqual([])
    // …no post, no container, no token, for this script or anyone else's.
    expect(publishCalls()).toEqual([])
    expect(EXTERNAL.filter(e => e.startsWith('instagram.container'))).toEqual([])
    expect(TOKEN_READS).toEqual([])
    expect(body.steps.publish).toMatchObject({ skipped: 'platform_operator_required' })
  })

  it('10 · every hop the owner’s chain did make is bound to the script it just wrote', async () => {
    as(USER_A)
    await breaking({ project_id: PROJECT_A, text: 'an article' })
    const [made] = scriptsInsertedBy()
    expect(HOPS.length).toBeGreaterThan(0)
    for (const hop of HOPS) expect(hop).toContain(`scriptId=${made.id}`)
  })

  it('16 · the operator’s chain posts exactly the script it made — not the oldest ready one on the platform', async () => {
    as(OPERATOR)
    const res = await breaking({ project_id: SOCIAL, text: 'an article' })
    expect(res.status).toBe(200)
    const [made] = scriptsInsertedBy()
    expect(HOPS).toEqual(expect.arrayContaining([
      `/api/media/cron/publish?scriptId=${made.id}`,
      `/api/media/cron/youtube?scriptId=${made.id}`,
    ]))
    const publications = publishCalls()
    expect(publications.length).toBeGreaterThanOrEqual(3)   // Instagram, Facebook, YouTube
    for (const p of publications) expect(p, 'the chain posted a different script').toContain(made.id)
    expect(posted('script-b-old'), 'the chain posted another tenant’s older video').toEqual([])
    expect(posted('script-social'), 'the chain posted an older platform video instead').toEqual([])
  })

  it('the unattended machine branch keeps its platform authority, bound to its own script', async () => {
    as(null)
    const res = await breaking({ text: 'an article' }, true)
    expect(res.status).toBe(200)
    const [made] = scriptsInsertedBy()
    expect(made?.project_id).toBe(SOCIAL)
    const publications = publishCalls()
    expect(publications.length).toBeGreaterThanOrEqual(3)
    for (const p of publications) expect(p).toContain(made.id)
  })
})

describe('A6-3 · the machine publishers post only the platform social project’s content', () => {
  it('11 · scheduled cron/publish still publishes — the platform’s oldest ready script, not another tenant’s', async () => {
    const res = await cron('publish')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'published', scriptId: 'script-social' })
    expect(publishCalls()).toEqual([
      'instagram.container:https://cdn.test/script-social.mp4',
      'instagram.publish:https://cdn.test/script-social.mp4',
      'facebook.publish:https://cdn.test/script-social.mp4',
    ])
    expect(posted('script-b-old')).toEqual([])
    expect(posted('script-a')).toEqual([])
  })

  it('12 · a tenant’s approved, rendered video never reaches the platform token or accounts', async () => {
    DB.tables.media_scripts = DB.tables.media_scripts.filter(r => r.project_id !== SOCIAL)
    const res = await cron('publish')
    expect(await res.json()).toMatchObject({ status: 'nothing_to_publish' })
    expect(publishCalls()).toEqual([])
    expect(DB.mutations('media_scripts').filter(m => m.filters.includes('eq:id')),
      'another tenant’s script was claimed').toEqual([])
  })

  it('17 · a named ?scriptId is honoured — that script or nothing, never the oldest in the queue', async () => {
    DB.tables.media_scripts.push(mediaScript('script-social-older', SOCIAL, { generated_at: minutesAgo(600) }))
    const res = await cron('publish', '?scriptId=script-social')
    expect(await res.json()).toMatchObject({ scriptId: 'script-social' })
    expect(posted('script-social-older')).toEqual([])

    EXTERNAL = []
    const foreign = await cron('publish', '?scriptId=script-a')
    expect(await foreign.json()).toMatchObject({ status: 'nothing_to_publish' })
    expect(publishCalls()).toEqual([])
  })

  it('7 · YouTube: the schedule uploads only the platform’s videos, and a named foreign script is refused', async () => {
    const scheduled = await cron('youtube')
    expect(scheduled.status).toBe(200)
    expect(EXTERNAL).toEqual(['youtube.upload:https://cdn.test/script-social.mp4'])

    EXTERNAL = []
    const named = await cron('youtube', '?scriptId=script-a')
    expect(await named.json()).toMatchObject({ status: 'nothing_to_upload' })
    expect(EXTERNAL).toEqual([])
  })

  it('step4: the scheduled pass prepares the platform’s post, not a newer tenant video', async () => {
    DB.tables.media_scripts = [
      mediaScript('script-a-fresh', PROJECT_A, { generated_at: minutesAgo(10) }),
      mediaScript('script-social-fresh', SOCIAL, { generated_at: minutesAgo(40) }),
    ]
    const res = await cron('step4')
    expect(await res.json()).toMatchObject({ status: 'step4_done', scriptId: 'script-social-fresh' })
    expect(EXTERNAL).toEqual(['instagram.container:https://cdn.test/script-social-fresh.mp4'])
  })

  it('step4: a named tenant script is still render-polled for its owner, but gets no platform container', async () => {
    DB.tables.media_scripts = [mediaScript('script-a-rendering', PROJECT_A, {
      video_status: 'rendering', video_url: null, render_id: 'render-a', render_bucket: 'bucket', generated_at: minutesAgo(5),
    })]
    const res = await cron('step4', '?scriptId=script-a-rendering')
    expect(res.status).toBe(200)
    const row = DB.tables.media_scripts[0]
    expect(row.video_status).toBe('ready')
    expect(row.instagram_creation_id ?? null).toBeNull()
    expect(EXTERNAL.filter(e => e.startsWith('instagram.'))).toEqual([])
  })

  it('pipeline-retry dispatches only the platform’s breaking videos to the publishers', async () => {
    DB.tables.media_scripts = [
      mediaScript('breaking-a', PROJECT_A, { breaking: true, generated_at: minutesAgo(30) }),
      mediaScript('breaking-social', SOCIAL, { breaking: true, generated_at: minutesAgo(20) }),
    ]
    vi.stubGlobal('fetch', async (url: string) => {
      HOPS.push(new URL(url).pathname + new URL(url).search)
      return Response.json({ ok: true })
    })
    const res = await cron('pipeline-retry')
    expect(res.status).toBe(200)
    const publishHops = HOPS.filter(h => /cron\/(publish|youtube)/.test(h))
    expect(publishHops).toEqual([
      '/api/media/cron/publish?scriptId=breaking-social',
      '/api/media/cron/youtube?scriptId=breaking-social',
    ])
  })

  it('15 · across every denied path in this world, nothing was posted anywhere', async () => {
    as(USER_A)
    await publishInstagram('script-a')
    await breaking({ project_id: PROJECT_A, text: 'an article' })
    as(USER_B)
    await publishInstagram('script-b-old')
    as(USER_C)
    await publishInstagram('script-a')
    expect(publishCalls()).toEqual([])
  })
})
