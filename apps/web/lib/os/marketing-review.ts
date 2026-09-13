/**
 * Marknadsgranskning — the operator's review of campaign drafts.
 *
 * WHAT THIS ANSWERS, and out of which source:
 *   what is in the month window      → `getMarketingReview`, reused unchanged
 *   what needs a decision            → `draft_posts.status = 'guard_passed'`
 *   what the Guard said              → `guard_reports` score, verdict, violations
 *   what may be decided, and how     → the helper's `can_approve`, `critical`, blocking gaps
 *   what sits outside the window     → `campaign_plans` → `campaign_briefs` → `draft_posts`
 *
 * WHAT IT DOES NOT DO: write. Decisions go from the card controls to the
 * existing `POST /api/marketing/approvals`; this module only reads.
 *
 * REUSE, AND WHAT IT HID. `getMarketingReview` is the canonical review — the
 * legacy page and `GET /api/marketing/approvals` both serve it — and it is
 * called here unchanged. It reads `{ data }` and never looks at `error`, so a
 * failed read inside it produces an empty section that looks exactly like
 * "nothing to review". `observeReads` hands it the same client with one
 * addition: it notices when a read failed. No query and no result changes.
 *
 * ISOLATION. Both chains hang off one root lookup: the marketing project's
 * hard-coded slug, authorised against the session's allow-list through
 * `scopeProjectFilter`. Everything below it is derived from that project id,
 * so an operator who does not own the project gets nothing past the root. The
 * outside read also re-checks the root id against the allow-list, and the
 * assembler re-checks every row against that id, so a regression in one layer
 * cannot move a foreign row onto this page.
 *
 * A source that cannot be read says so. It is never rendered as an empty review.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { getMarketingReview, type ReviewCard, type ReviewData } from '@/lib/marketing/review'
import {
  DRAFT_STATUSES,
  OUTSIDE_LIMITS,
  UNDECIDED_STATUSES,
  draftActionPlan,
  isDraftStatus,
  landingUrlDraft,
  needsLandingUrl,
  planKeyLabel,
  type DraftActionPlan,
  type DraftStatus,
  type SectionState,
} from '@/lib/os/marketing-review-shared'

/** The one project the marketing engine serves — the slug `getMarketingReview` resolves. */
export const MARKETING_PROJECT_SLUG = 'familje-stunden'

// ─────────────────────────────────────────────────────────────────────────────
// The model
// ─────────────────────────────────────────────────────────────────────────────

export interface WindowMonth {
  planKey: string
  label: string
  hasPlan: boolean
  themeName: string | null
  planStatus: string | null
}

/** `awaiting` is a `drafted` draft; `missing` is a draft no Guard report belongs to. */
export type GuardState = 'reported' | 'awaiting' | 'missing'

export interface MarketingDraftCard {
  id: string
  draftKey: string
  status: string
  version: number | null
  channelLabel: string
  formatLabel: string
  beat: string | null
  planKey: string | null
  monthLabel: string | null
  themeName: string | null
  captionPreview: string
  captionFull: string
  captionTruncated: boolean
  guard: { state: GuardState; score: number | null; verdict: string | null }
  critical: boolean
  canApprove: boolean
  blockingGaps: string[]
  primaryReason: { text: string; tone: 'critical' | 'warning' } | null
  violations: Array<{ severity: string; explanation: string }>
  warnings: Array<{ severity: string; explanation: string }>
  cta: { label: string | null; type: string | null; landingUrl: string | null; needsLandingUrl: boolean }
  assets: Array<{ ref: string | null; status: string }>
  audit: Array<{ label: string; runId: string | null; at: string | null; runStatus: string | null }>
  createdAt: string | null
  actions: DraftActionPlan
}

export interface MarketingLane {
  status: string
  known: boolean
  cards: MarketingDraftCard[]
}

export interface OutsidePlan {
  planKey: string
  label: string
  themeName: string | null
  planStatus: string | null
  drafts: number
  undecided: number
  byStatus: Array<{ status: string; count: number }>
}

export interface OutsideSummary {
  state: SectionState
  plans: OutsidePlan[]
  drafts: number
  undecided: number
  truncated: boolean
}

export type MarketingAttention =
  | { kind: 'ready'; count: number }
  | { kind: 'no_plan'; months: string[] }
  | { kind: 'outside_undecided'; count: number; plans: number }
  | { kind: 'outside_unreadable' }
  | { kind: 'outside_truncated' }

/** `unavailable`: the session owns no marketing project. `error`: the review could not be read whole. */
export type MarketingState = 'ok' | 'unavailable' | 'error'

export type DraftCounts = Record<DraftStatus, number> & { unknown: number; total: number }

export interface MarketingReviewModel {
  state: MarketingState
  window: WindowMonth[]
  counts: DraftCounts | null
  lanes: MarketingLane[]
  attention: MarketingAttention[]
  outside: OutsideSummary
  /** True only when the window holds drafts and none of them lacks an operator decision. */
  nothingWaiting: boolean
  limits: typeof OUTSIDE_LIMITS
}

/** The outside-the-window read, as it came back. */
export interface OutsideRead {
  ok: boolean
  projectId: string | null
  plans: any[]
  briefs: any[]
  drafts: any[]
  truncated: boolean
}

export interface AssembleMarketingInput {
  review: ReviewData
  /** False when any read inside `getMarketingReview` failed, or it threw. */
  reviewReadOk: boolean
  outside: OutsideRead
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly — pure
// ─────────────────────────────────────────────────────────────────────────────

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

const EMPTY_OUTSIDE: OutsideSummary = { state: 'ok', plans: [], drafts: 0, undecided: 0, truncated: false }

const isUndecided = (status: string) => (UNDECIDED_STATUSES as readonly string[]).includes(status)

/** One review card, as the helper built it, in the surface's terms. Nothing is recomputed. */
export function toCard(card: ReviewCard): MarketingDraftCard {
  const blockingGaps = (Array.isArray(card.blocking_gaps) ? card.blocking_gaps : [])
    .filter((gap): gap is string => typeof gap === 'string')
  const score = typeof card.score === 'number' ? card.score : null
  const verdict = text(card.verdict)
  const guardState: GuardState =
    card.status === 'drafted' ? 'awaiting' : score !== null || verdict !== null ? 'reported' : 'missing'
  const ctaType = text(card.cta?.type)
  const landing = landingUrlDraft(card.cta?.landing_url_slot ?? null)
  const planKey = text(card.plan_key)

  return {
    id: card.draft_id,
    draftKey: card.draft_key,
    status: card.status,
    version: typeof card.version === 'number' ? card.version : null,
    channelLabel: card.channel_label,
    formatLabel: card.format_label,
    beat: text(card.beat),
    planKey,
    monthLabel: planKey ? planKeyLabel(planKey) : null,
    themeName: text(card.theme_name),
    captionPreview: card.caption_preview,
    captionFull: card.caption_full,
    captionTruncated: card.caption_full.length > card.caption_preview.length,
    guard: { state: guardState, score, verdict },
    critical: card.critical,
    canApprove: card.can_approve,
    blockingGaps,
    primaryReason: card.primary_reason,
    violations: card.violations,
    warnings: card.warnings,
    cta: {
      label: text(card.cta?.label),
      type: ctaType,
      landingUrl: landing || null,
      needsLandingUrl: needsLandingUrl(ctaType),
    },
    assets: card.asset_refs,
    audit: card.audit.map((step) => ({ label: step.label, runId: step.run_id, at: step.at, runStatus: step.status })),
    createdAt: text(card.created_at),
    actions: draftActionPlan({
      status: card.status,
      critical: card.critical,
      fixable: blockingGaps.length > 0,
      canApprove: card.can_approve,
    }),
  }
}

function orderedStatusCounts(byStatus: Map<string, number>): Array<{ status: string; count: number }> {
  const known = DRAFT_STATUSES.filter((s) => byStatus.has(s)).map((s) => ({ status: s, count: byStatus.get(s)! }))
  const unknown = [...byStatus.keys()]
    .filter((s) => !isDraftStatus(s))
    .sort()
    .map((s) => ({ status: s, count: byStatus.get(s)! }))
  return [...known, ...unknown]
}

/**
 * Plans outside the window, counted on the latest version per brief. Every row
 * is re-checked against the one authorised project, so a regression in a
 * query's scope cannot move a foreign row into these counts.
 */
export function summariseOutside(read: OutsideRead, windowKeys: ReadonlySet<string>): OutsideSummary {
  if (!read.ok) return { ...EMPTY_OUTSIDE, state: 'error' }
  const projectId = read.projectId
  if (!projectId) return EMPTY_OUTSIDE

  const plans = read.plans.filter(
    (p) => p?.project_id === projectId && text(p?.id) !== null && text(p?.plan_key) !== null && !windowKeys.has(p.plan_key),
  )
  const planIds = new Set(plans.map((p) => p.id as string))

  const briefPlan = new Map<string, string>()
  for (const b of read.briefs) {
    if (b?.project_id === projectId && text(b?.id) !== null && planIds.has(b?.plan_id)) briefPlan.set(b.id, b.plan_id)
  }

  const latest = new Map<string, any>()
  for (const d of read.drafts) {
    if (d?.project_id !== projectId || text(d?.id) === null || !briefPlan.has(d?.brief_id)) continue
    const current = latest.get(d.brief_id)
    if (!current || Number(d.version) > Number(current.version)) latest.set(d.brief_id, d)
  }

  const perPlan = new Map<string, { drafts: number; undecided: number; byStatus: Map<string, number> }>()
  for (const d of latest.values()) {
    const planId = briefPlan.get(d.brief_id) as string
    const entry = perPlan.get(planId) ?? { drafts: 0, undecided: 0, byStatus: new Map<string, number>() }
    const status = typeof d.status === 'string' ? d.status : ''
    entry.drafts += 1
    if (isUndecided(status)) entry.undecided += 1
    entry.byStatus.set(status, (entry.byStatus.get(status) ?? 0) + 1)
    perPlan.set(planId, entry)
  }

  const summaries: OutsidePlan[] = plans
    .map((p) => {
      const entry = perPlan.get(p.id) ?? { drafts: 0, undecided: 0, byStatus: new Map<string, number>() }
      return {
        planKey: p.plan_key as string,
        label: planKeyLabel(p.plan_key),
        themeName: text(p.theme_name),
        planStatus: text(p.status),
        drafts: entry.drafts,
        undecided: entry.undecided,
        byStatus: orderedStatusCounts(entry.byStatus),
      }
    })
    .sort((a, b) => b.planKey.localeCompare(a.planKey))

  return {
    state: 'ok',
    plans: summaries,
    drafts: summaries.reduce((n, p) => n + p.drafts, 0),
    undecided: summaries.reduce((n, p) => n + p.undecided, 0),
    truncated: read.truncated,
  }
}

function outsideAttention(outside: OutsideSummary): MarketingAttention[] {
  if (outside.state === 'error') return [{ kind: 'outside_unreadable' }]
  const items: MarketingAttention[] = []
  if (outside.undecided > 0) {
    items.push({ kind: 'outside_undecided', count: outside.undecided, plans: outside.plans.filter((p) => p.undecided > 0).length })
  }
  if (outside.truncated) items.push({ kind: 'outside_truncated' })
  return items
}

export function assembleMarketingReview(input: AssembleMarketingInput): MarketingReviewModel {
  const window: WindowMonth[] = input.review.months.map((m) => ({
    planKey: m.plan_key,
    label: planKeyLabel(m.plan_key),
    // `campaign_plans.status` is NOT NULL, so a stored status is exactly a stored plan.
    hasPlan: m.plan_status !== null,
    themeName: text(m.theme_name),
    planStatus: text(m.plan_status),
  }))

  if (!input.reviewReadOk) {
    const outside = summariseOutside(input.outside, new Set(window.map((m) => m.planKey)))
    return {
      state: 'error', window, counts: null, lanes: [], attention: outsideAttention(outside), outside,
      nothingWaiting: false, limits: OUTSIDE_LIMITS,
    }
  }

  // The helper returns no month only when its root lookup found no project this
  // session owns. Nothing past that root is shown — not even outside counts.
  if (window.length === 0) {
    return {
      state: 'unavailable', window, counts: null, lanes: [], attention: [], outside: EMPTY_OUTSIDE,
      nothingWaiting: false, limits: OUTSIDE_LIMITS,
    }
  }

  const outside = summariseOutside(input.outside, new Set(window.map((m) => m.planKey)))
  const cards = input.review.cards.map(toCard)

  const counts: DraftCounts = {
    guard_passed: 0, drafted: 0, needs_input: 0, guard_failed: 0, returned: 0, rejected: 0, approved: 0,
    unknown: 0, total: cards.length,
  }
  for (const card of cards) {
    if (isDraftStatus(card.status)) counts[card.status] += 1
    else counts.unknown += 1
  }

  const anyPlan = window.some((m) => m.hasPlan)
  const lanes: MarketingLane[] = []
  for (const status of DRAFT_STATUSES) {
    const laneCards = cards.filter((c) => c.status === status)
    // The decision lane stands whenever the window has a plan; the others when they hold a draft.
    if (laneCards.length > 0 || (status === 'guard_passed' && anyPlan)) lanes.push({ status, known: true, cards: laneCards })
  }
  for (const status of [...new Set(cards.filter((c) => !isDraftStatus(c.status)).map((c) => c.status))]) {
    lanes.push({ status, known: false, cards: cards.filter((c) => c.status === status) })
  }

  const attention: MarketingAttention[] = []
  if (counts.guard_passed > 0) attention.push({ kind: 'ready', count: counts.guard_passed })
  const planless = window.filter((m) => !m.hasPlan).map((m) => m.label)
  if (planless.length > 0) attention.push({ kind: 'no_plan', months: planless })
  attention.push(...outsideAttention(outside))

  const waiting = cards.filter((c) => !isDraftStatus(c.status) || isUndecided(c.status)).length

  return {
    state: 'ok',
    window,
    counts,
    lanes,
    attention,
    outside,
    nothingWaiting: cards.length > 0 && waiting === 0,
    limits: OUTSIDE_LIMITS,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The same client, with one addition: it records whether any read failed.
 *
 * Every builder method is called on the real builder, and every result is
 * passed through untouched — the proxy only looks at a settled result's
 * `error`, or at a rejection. `getMarketingReview` reaches the database only
 * through `db.from(…)`, so this sees every read it makes.
 */
export function observeReads<T>(db: T): { db: T; failed: () => boolean } {
  let failed = false

  const wrap = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value
    return new Proxy(value, {
      get(target, prop) {
        const member = Reflect.get(target, prop, target)
        if (typeof member !== 'function') return member
        if (prop === 'then') {
          return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            member.call(
              target,
              (result: unknown) => {
                if (result && typeof result === 'object' && (result as { error?: unknown }).error) failed = true
                return onFulfilled ? onFulfilled(result) : result
              },
              (reason: unknown) => {
                failed = true
                if (onRejected) return onRejected(reason)
                throw reason
              },
            )
        }
        return (...args: unknown[]) => wrap(member.apply(target, args))
      },
    })
  }

  const observed = { from: (table: string) => wrap((db as any).from(table)) } as unknown as T
  return { db: observed, failed: () => failed }
}

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

async function readOne(query: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = (await query) as { data?: unknown; error?: unknown } | null
    if (!res || res.error) return { ok: false, data: null }
    return { ok: true, data: res.data ?? null }
  } catch {
    return { ok: false, data: null }
  }
}

/**
 * Plans, briefs and drafts of the marketing project, for the counts outside the
 * window. The same authorised root as the review; every read below it is keyed
 * on that project id.
 */
export async function readOutside(db: any, scope: string[]): Promise<OutsideRead> {
  const failed: OutsideRead = { ok: false, projectId: null, plans: [], briefs: [], drafts: [], truncated: false }

  const root = await readOne(
    db.from('projects').select('id').eq('slug', MARKETING_PROJECT_SLUG).in('id', scope).maybeSingle(),
  )
  if (!root.ok) return failed
  const projectId = text(root.data?.id)
  if (!projectId || !scope.includes(projectId)) return { ...failed, ok: true }

  const [plans, briefs, drafts] = await Promise.all([
    read(
      db.from('campaign_plans')
        .select('id, project_id, plan_key, theme_name, status, target_month')
        .eq('project_id', projectId)
        .order('target_month', { ascending: false })
        .limit(OUTSIDE_LIMITS.plans),
    ),
    read(
      db.from('campaign_briefs')
        .select('id, project_id, plan_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(OUTSIDE_LIMITS.briefs),
    ),
    read(
      db.from('draft_posts')
        .select('id, project_id, brief_id, status, version')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(OUTSIDE_LIMITS.drafts),
    ),
  ])
  if (!plans.ok || !briefs.ok || !drafts.ok) return failed

  return {
    ok: true,
    projectId,
    plans: plans.data,
    briefs: briefs.data,
    drafts: drafts.data,
    truncated:
      plans.data.length >= OUTSIDE_LIMITS.plans ||
      briefs.data.length >= OUTSIDE_LIMITS.briefs ||
      drafts.data.length >= OUTSIDE_LIMITS.drafts,
  }
}

const EMPTY_REVIEW: ReviewData = { months: [], counts: { pending: 0, approved: 0, rejected: 0, needs_input: 0 }, cards: [] }

/**
 * Loads the review for the signed-in session. Returns null when the scope
 * cannot be resolved — a redirect, never an empty review that reads like
 * nothing to decide.
 */
export async function loadMarketingReview(now: Date = new Date()): Promise<MarketingReviewModel | null> {
  const access = await resolveProjectAccess()
  if (!access.ok) return null

  const db = createAdminClient()
  const scope = scopeProjectFilter(access.allowedProjectIds)
  const observed = observeReads(db)

  const [review, outside] = await Promise.all([
    getMarketingReview(observed.db, access.allowedProjectIds, now).then(
      (data) => ({ data, ok: !observed.failed() }),
      () => ({ data: EMPTY_REVIEW, ok: false }),
    ),
    readOutside(db, scope),
  ])

  return assembleMarketingReview({ review: review.data, reviewReadOk: review.ok, outside })
}
