/**
 * Content Center — the operator's editorial queue.
 *
 * WHAT THIS ANSWERS, and out of which column:
 *   what is waiting for a person  → `website_content.status = 'pending_review'`
 *   what failed to publish        → `status = 'failed'`, `publish_error`
 *   what is published or rejected → `status`, as Atlas stored it
 *   what the generator thought    → `qa` (its own self-assessment)
 *   what it cost to generate      → `cost_usd` (an estimate saved at generation)
 *   where it was published        → `destination_url`, `published_at` — recorded, not observed
 *   what can be generated next    → `media_news_items` with `status = 'new'`
 *
 * WHAT IT DOES NOT DO: approve, reject, publish, regenerate or render hero
 * images. Those already exist — on the article's own page, behind their own
 * routes — and the cards link there. The one action this surface offers is the
 * existing Generate Article drawer, mounted unchanged.
 *
 * ISOLATION. The read keeps the boundary the replaced page already had and CI
 * already pins: `resolveProjectAccess()` on the session, `scopeProjectFilter`
 * inside all three queries, and a second filter in the assembler so a
 * regression in one layer cannot move a row onto this page. `website_content`
 * does carry an owner RLS policy, but its production state is not verifiable
 * from the repository, and a policy regression under the RLS client would
 * silently empty the queue — indistinguishable from "nothing to review". The
 * scoped read cannot fail that way, and its scope is tested.
 *
 * A source that cannot be read says so. It is never rendered as an empty queue.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { destinationBasePath } from '@/lib/nav/registry'
import type { NewsItemForPicker } from '@/app/(platform)/atlas/content/GenerateArticleDrawer'
import {
  CONTENT_LIMITS,
  CONTENT_STATUSES,
  isContentStatus,
  type ContentStatus,
  type QaVerdict,
  type SectionState,
} from '@/lib/os/content-center-shared'

// ─────────────────────────────────────────────────────────────────────────────
// The model
// ─────────────────────────────────────────────────────────────────────────────

export type ContentSource = 'content' | 'news' | 'projects'

export interface ContentProject {
  id: string
  name: string | null
  slug: string | null
  color: string | null
}

export interface ContentCard {
  id: string
  title: string | null
  summary: string | null
  contentType: string | null
  /** Exactly as stored — never rewritten by any flag below. */
  status: string
  statusReason: string | null
  project: ContentProject | null
  createdAt: string | null
  updatedAt: string | null
  reviewedAt: string | null
  publishedAt: string | null
  publishOperation: string | null
  publishError: string | null
  rejectionReason: string | null
  scheduledAt: string | null
  /** A recorded http(s) address. Anything else is withheld — see `destinationUnsafe`. */
  destinationUrl: string | null
  /** An address was stored but is not http(s), so it is never rendered as a link. */
  destinationUnsafe: boolean
  model: string | null
  estimatedCostUsd: number | null
  qa: { verdict: QaVerdict; confidence: string | null; issues: number | null }
  heroImageStatus: string | null
  /** A publish is recorded on a row whose status is not `published`. */
  publishRecordedWithoutPublishedStatus: boolean
  /** The existing article page, from the registry's base path. */
  href: string | null
}

export interface ContentLane {
  status: string
  /** False for a stored value outside the six the schema allows. */
  known: boolean
  cards: ContentCard[]
}

export type ContentAttention =
  | { kind: 'pending_review'; count: number }
  | { kind: 'publish_failed'; card: ContentCard }
  | { kind: 'status_disagreement'; card: ContentCard }
  | { kind: 'truncated'; limit: number }
  | { kind: 'source_unreadable'; source: ContentSource }

export interface ContentCenterModel {
  /** `error` when the queue itself could not be read. */
  state: SectionState
  sources: Record<ContentSource, SectionState>
  /** Every owned row, newest first. */
  cards: ContentCard[]
  lanes: ContentLane[]
  /** Null when the queue could not be read — never zeros for "unknown". */
  counts: (Record<ContentStatus, number> & { unknown: number; total: number }) | null
  /** The Generate Article picker's rows, owned and `new` only. */
  newsItems: NewsItemForPicker[]
  attention: ContentAttention[]
  /** The read reached its cap, so counts are a floor. */
  truncated: boolean
  /** Atlas view awareness: the rows on screen, as the replaced page published them. */
  visibleRefs: Array<{ domain: 'website_content'; id: string; label: string }>
  limits: typeof CONTENT_LIMITS
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure assembly
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembleContentInput {
  /** The owned project ids. Every row is re-filtered by it. */
  scopeIds: string[]
  content: { ok: boolean; rows: any[] }
  news: { ok: boolean; rows: any[] }
  projects: { ok: boolean; rows: any[] }
}

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function truncate(s: string | null, n: number): string | null {
  if (!s) return null
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

/**
 * A stored address is only ever rendered as a link when it is http or https.
 * `destination_url` comes from the publisher's response; a `javascript:` or
 * `data:` value there would otherwise become a clickable script on this page.
 */
export function safeHttpUrl(value: unknown): string | null {
  const s = text(value)
  if (!s) return null
  try {
    const url = new URL(s)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** The generator's verdict. Anything but an explicit boolean is `absent`, never a pass. */
export function qaVerdict(qa: unknown): QaVerdict {
  if (!qa || typeof qa !== 'object') return 'absent'
  const pass = (qa as { pass?: unknown }).pass
  if (pass === true) return 'pass'
  if (pass === false) return 'fail'
  return 'absent'
}

function cardHref(id: string): string | null {
  const base = destinationBasePath('content_queue')
  return base ? `${base}/${id}` : null
}

const byCreatedDesc = (a: ContentCard, b: ContentCard) => {
  if (!a.createdAt && !b.createdAt) return 0
  if (!a.createdAt) return 1
  if (!b.createdAt) return -1
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
}

/**
 * The project label table — owned projects only.
 *
 * A card is filtered by ownership BEFORE it looks its project up, so a foreign
 * row here could not label a card today. The table is kept clean anyway, as
 * its own tested contract, so no later consumer of it — a per-project count, a
 * filter — can inherit a foreign project's name.
 */
export function ownedProjects(rows: any[], scopeIds: string[]): Map<string, ContentProject> {
  const owned = new Set(scopeIds)
  const table = new Map<string, ContentProject>()
  for (const row of rows ?? []) {
    const id = text(row?.id)
    if (!id || !owned.has(id)) continue
    table.set(id, { id, name: text(row?.name), slug: text(row?.slug), color: text(row?.color) })
  }
  return table
}

export function assembleContentCenter(input: AssembleContentInput): ContentCenterModel {
  const owned = new Set(input.scopeIds)
  const sources: Record<ContentSource, SectionState> = {
    content: input.content.ok ? 'ok' : 'error',
    news: input.news.ok ? 'ok' : 'error',
    projects: input.projects.ok ? 'ok' : 'error',
  }

  const projectById = input.projects.ok
    ? ownedProjects(input.projects.rows, input.scopeIds)
    : new Map<string, ContentProject>()

  const cards: ContentCard[] = []
  if (input.content.ok) {
    for (const row of input.content.rows ?? []) {
      const id = text(row?.id)
      const pid = text(row?.project_id)
      if (!id || pid === null || !owned.has(pid)) continue
      const status = text(row?.status) ?? ''
      const storedUrl = text(row?.destination_url)
      const destinationUrl = safeHttpUrl(storedUrl)
      const publishedAt = text(row?.published_at)
      const qa = row?.qa && typeof row.qa === 'object' ? row.qa : null
      cards.push({
        id,
        title: text(row?.title),
        summary: truncate(text(row?.summary), CONTENT_LIMITS.summary),
        contentType: text(row?.content_type),
        status,
        statusReason: truncate(text(row?.status_reason), CONTENT_LIMITS.reason),
        project: projectById.get(pid) ?? { id: pid, name: null, slug: null, color: null },
        createdAt: text(row?.created_at),
        updatedAt: text(row?.updated_at),
        reviewedAt: text(row?.reviewed_at),
        publishedAt,
        publishOperation: text(row?.publish_operation),
        publishError: truncate(text(row?.publish_error), CONTENT_LIMITS.reason),
        rejectionReason: truncate(text(row?.rejection_reason), CONTENT_LIMITS.reason),
        scheduledAt: text(row?.scheduled_at),
        destinationUrl,
        destinationUnsafe: storedUrl !== null && destinationUrl === null,
        model: text(row?.model),
        estimatedCostUsd: num(row?.cost_usd),
        qa: {
          verdict: qaVerdict(qa),
          confidence: text(qa?.confidence),
          issues: Array.isArray(qa?.issues) ? qa.issues.length : null,
        },
        heroImageStatus: text(row?.hero_image_status),
        publishRecordedWithoutPublishedStatus: status !== 'published' && (storedUrl !== null || publishedAt !== null),
        href: cardHref(id),
      })
    }
  }
  cards.sort(byCreatedDesc)

  // One lane per canonical status that holds rows — the review queue always —
  // then one per stored value the schema does not know, shown raw.
  const lanes: ContentLane[] = []
  for (const status of CONTENT_STATUSES) {
    const laneCards = cards.filter((c) => c.status === status)
    if (laneCards.length > 0 || status === 'pending_review') lanes.push({ status, known: true, cards: laneCards })
  }
  const unknownStatuses = [...new Set(cards.filter((c) => !isContentStatus(c.status)).map((c) => c.status))].sort()
  for (const status of unknownStatuses) {
    lanes.push({ status, known: false, cards: cards.filter((c) => c.status === status) })
  }

  const counts = input.content.ok
    ? {
        ...(Object.fromEntries(CONTENT_STATUSES.map((s) => [s, cards.filter((c) => c.status === s).length])) as Record<ContentStatus, number>),
        unknown: cards.filter((c) => !isContentStatus(c.status)).length,
        total: cards.length,
      }
    : null

  const newsItems: NewsItemForPicker[] = input.news.ok
    ? (input.news.rows ?? [])
        .filter((row) => {
          const pid = text(row?.project_id)
          return pid !== null && owned.has(pid) && text(row?.id) !== null
        })
        .map((row) => ({
          id: text(row.id)!,
          title: text(row?.title) ?? 'Utan titel',
          source_name: text(row?.source_name),
          virality_score: num(row?.virality_score),
          created_at: text(row?.created_at) ?? '',
        }))
    : []

  const truncated = input.content.ok && (input.content.rows ?? []).length >= CONTENT_LIMITS.rows

  const attention: ContentAttention[] = []
  const pending = counts?.pending_review ?? 0
  if (pending > 0) attention.push({ kind: 'pending_review', count: pending })
  for (const card of cards) {
    if (card.status === 'failed') attention.push({ kind: 'publish_failed', card })
  }
  for (const card of cards) {
    if (card.publishRecordedWithoutPublishedStatus) attention.push({ kind: 'status_disagreement', card })
  }
  if (truncated) attention.push({ kind: 'truncated', limit: CONTENT_LIMITS.rows })
  for (const source of Object.keys(sources) as ContentSource[]) {
    if (sources[source] === 'error') attention.push({ kind: 'source_unreadable', source })
  }

  return {
    state: sources.content === 'error' ? 'error' : 'ok',
    sources,
    cards,
    lanes,
    counts,
    newsItems,
    attention,
    truncated,
    visibleRefs: cards.slice(0, CONTENT_LIMITS.visibleRefs).map((c) => ({
      domain: 'website_content' as const,
      id: c.id,
      label: c.title ?? `(${c.contentType ?? 'content'})`,
    })),
    limits: CONTENT_LIMITS,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The read
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT_SELECT =
  'id, project_id, content_type, title, summary, status, status_reason, model, cost_usd, qa, created_at, updated_at, reviewed_at, published_at, publish_operation, publish_error, rejection_reason, scheduled_at, destination_url, hero_image_status'

const NEWS_SELECT = 'id, project_id, title, source_name, virality_score, created_at'

/** A read that never throws: an error is a state, not an exception. */
async function read(query: unknown): Promise<{ ok: boolean; data: any[] }> {
  try {
    const res = (await query) as { data?: unknown; error?: unknown } | null
    if (!res || res.error) return { ok: false, data: [] }
    return { ok: true, data: Array.isArray(res.data) ? res.data : [] }
  } catch {
    return { ok: false, data: [] }
  }
}

/**
 * Loads the queue for the signed-in session. Returns null when the scope cannot
 * be resolved — a redirect, never an empty queue that reads like nothing to do.
 */
export async function loadContentCenter(): Promise<ContentCenterModel | null> {
  const access = await resolveProjectAccess()
  if (!access.ok) return null

  const db = createAdminClient() as any
  const scope = scopeProjectFilter(access.allowedProjectIds)

  const [content, news, projects] = await Promise.all([
    read(
      db.from('website_content')
        .select(CONTENT_SELECT)
        .in('project_id', scope)
        .order('created_at', { ascending: false })
        .limit(CONTENT_LIMITS.rows),
    ),
    read(
      db.from('media_news_items')
        .select(NEWS_SELECT)
        .in('project_id', scope)
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(CONTENT_LIMITS.news),
    ),
    read(db.from('projects').select('id, name, slug, color').in('id', scope)),
  ])

  return assembleContentCenter({
    scopeIds: scope,
    content: { ok: content.ok, rows: content.data },
    news: { ok: news.ok, rows: news.data },
    projects: { ok: projects.ok, rows: projects.data },
  })
}
