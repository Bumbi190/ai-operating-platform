/**
 * vNext Phase 16 — Marknadsgranskning (`/atlas/marketing`).
 *
 * Five risks carry this surface, and the suite is organised around them:
 *
 *   1. FOLDING STATE. `draft_posts.status` holds seven values. The page this
 *      replaces grouped them into four queues, so a draft sent back to the
 *      Drafter and a draft the Guard rejected both read as the operator's own
 *      rejection. Every stored status needs its own lane, raw when unknown.
 *
 *   2. CLAIMING WHAT IS NOT TRUE. The page this replaces said "Allt granskat ✓"
 *      whenever its month window held no card — on 2026-09-13 neither month had
 *      a plan while 13 drafts from June and July had no decision — and "Guard
 *      körs…" for a draft nothing was evaluating. Approving publishes nothing.
 *
 *   3. GROWING A PARALLEL ACTION PATH. The controls are the ones that existed —
 *      approve where `can_approve` holds, edit and return everywhere — posting
 *      the same bodies to the same `POST /api/marketing/approvals`. `reject` was
 *      never offered and still is not. A refusal is shown as a refusal.
 *
 *   4. A FAILED READ THAT LOOKS EMPTY. The canonical helper ignores `error`; the
 *      surface must notice and say the review could not be read.
 *
 *   5. LEAKING ACROSS THE OWNER BOUNDARY, and LOSING THE ROLLBACK.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { ReviewCard, ReviewData } from '@/lib/marketing/review'
import {
  MARKETING_PROJECT_SLUG,
  assembleMarketingReview,
  observeReads,
  summariseOutside,
  toCard,
  type AssembleMarketingInput,
  type MarketingReviewModel,
  type OutsideRead,
} from '@/lib/os/marketing-review'
import {
  DECISION_ENDPOINT,
  DONE_MESSAGES,
  DRAFT_ACTION_NOTES,
  DRAFT_STATUSES,
  DRAFT_STATUS_LABELS,
  OUTSIDE_LIMITS,
  UNKNOWN_STATUS_LABEL,
  UNREADABLE_LABEL,
  decisionBody,
  decisionOutcome,
  draftActionPlan,
  landingUrlDraft,
  needsLandingUrl,
  planKeyLabel,
} from '@/lib/os/marketing-review-shared'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { destinationLabel } from '@/lib/nav/registry'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
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
/** Rendered text only — hashed CSS-module class names carry digits of their own. */
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2026-09-13T12:00:00.000Z')

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
  draft_id: 'dp-1',
  draft_key: 'draft-sep-1-v1',
  channel: 'instagram',
  channel_label: 'Instagram',
  format: 'reel',
  format_label: 'Reel',
  beat: 'teaser',
  status: 'guard_passed',
  version: 1,
  queue: 'pending',
  month_label: 'September',
  theme_name: 'Höstmys',
  plan_key: 'fs-2026-09',
  score: 95,
  verdict: 'approved',
  critical: false,
  can_approve: true,
  caption_preview: 'Nova och Pling upptäcker hösten',
  caption_full: 'Nova och Pling upptäcker hösten',
  cta: { label: 'Följ oss', type: 'follow', landing_url_slot: null },
  asset_refs: [{ ref: 'fs-sep-hero', status: 'available' }],
  violations: [],
  warnings: [{ severity: 'LOW', explanation: 'Paletten är inte verifierad.' }],
  blocking_gaps: [],
  primary_reason: null,
  audit: [
    { label: 'Planner', run_id: 'run-p', at: '2026-09-01T08:00:00.000Z', status: 'done' },
    { label: 'Drafter', run_id: 'run-d', at: '2026-09-01T08:05:00.000Z', status: 'done' },
    { label: 'Guard', run_id: 'run-g', at: '2026-09-01T08:06:00.000Z', status: 'done' },
  ],
  created_at: '2026-09-01T08:05:00.000Z',
  ...over,
})

const months = (plans: { sep?: boolean; oct?: boolean } = { sep: true }) => [
  { label: 'September', plan_key: 'fs-2026-09', theme_name: plans.sep ? 'Höstmys' : null, plan_status: plans.sep ? 'draft' : null },
  { label: 'Oktober', plan_key: 'fs-2026-10', theme_name: plans.oct ? 'Spökhöst' : null, plan_status: plans.oct ? 'draft' : null },
]

const review = (over: Partial<ReviewData> = {}): ReviewData => ({
  months: months(),
  counts: { pending: 1, approved: 0, rejected: 0, needs_input: 0 },
  cards: [card()],
  ...over,
})

/** Production's shape on 2026-09-13: two past plans, one draft superseded by an approved version. */
const outsideRead = (over: Partial<OutsideRead> = {}): OutsideRead => ({
  ok: true,
  projectId: MINE,
  plans: [
    { id: 'cp-jun', project_id: MINE, plan_key: 'fs-2026-06', theme_name: 'Familje-Stunden (varumärke)', status: 'draft' },
    { id: 'cp-jul', project_id: MINE, plan_key: 'fs-2026-07', theme_name: 'Sagosommar', status: 'draft' },
  ],
  briefs: [
    { id: 'cb-jun-1', project_id: MINE, plan_id: 'cp-jun' },
    { id: 'cb-jul-1', project_id: MINE, plan_id: 'cp-jul' },
    { id: 'cb-jul-2', project_id: MINE, plan_id: 'cp-jul' },
  ],
  drafts: [
    { id: 'd-jun-1', project_id: MINE, brief_id: 'cb-jun-1', status: 'guard_passed', version: 1 },
    { id: 'd-jul-1-v1', project_id: MINE, brief_id: 'cb-jul-1', status: 'returned', version: 1 },
    { id: 'd-jul-1-v2', project_id: MINE, brief_id: 'cb-jul-1', status: 'approved', version: 2 },
    { id: 'd-jul-2', project_id: MINE, brief_id: 'cb-jul-2', status: 'guard_passed', version: 1 },
  ],
  truncated: false,
  ...over,
})

const input = (over: Partial<AssembleMarketingInput> = {}): AssembleMarketingInput => ({
  review: review(),
  reviewReadOk: true,
  outside: outsideRead(),
  ...over,
})

const render = async (model: MarketingReviewModel) => {
  const { MarketingReview } = await import('@/components/platform/vnext/MarketingReview')
  return renderToStaticMarkup(React.createElement(MarketingReview, { model }))
}

/** One lane's markup, by its stored status. */
const lane = (html: string, status: string) => {
  const i = html.indexOf(`data-lane="${status}"`)
  return i < 0 ? '' : html.slice(i, html.indexOf('</section>', i))
}

const SHARED = read('lib/os/marketing-review-shared.ts')
const LOADER = read('lib/os/marketing-review.ts')
const COMPONENT = read('components/platform/vnext/MarketingReview.tsx')
const ISLAND = read('components/platform/vnext/MarketingDraftActions.tsx')

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Status — every stored value, never folded
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · every stored status is shown', () => {
  it('each of the seven stored statuses gets its own lane and its own count', () => {
    const cards = DRAFT_STATUSES.map((status, i) => card({ draft_id: `dp-${i}`, status, can_approve: status === 'guard_passed' }))
    const model = assembleMarketingReview(input({ review: review({ cards }) }))
    expect(model.lanes.map((l) => l.status)).toEqual([...DRAFT_STATUSES])
    for (const status of DRAFT_STATUSES) expect(model.counts![status], status).toBe(1)
    expect(model.counts!.total).toBe(7)
    expect(model.counts!.unknown).toBe(0)
  })

  it('a draft sent back and a draft the Guard rejected are not the operator\'s rejection', async () => {
    const model = assembleMarketingReview(input({
      review: review({
        cards: [
          card({ draft_id: 'r', status: 'returned', can_approve: false }),
          card({ draft_id: 'g', status: 'guard_failed', can_approve: false, verdict: 'rejected', score: 40 }),
          card({ draft_id: 'x', status: 'rejected', can_approve: false }),
        ],
      }),
    }))
    expect(model.lanes.filter((l) => l.cards.length > 0).map((l) => l.status)).toEqual(['guard_failed', 'returned', 'rejected'])
    const html = await render(model)
    expect(lane(html, 'returned')).toContain(DRAFT_STATUS_LABELS.returned)
    expect(lane(html, 'guard_failed')).toContain(DRAFT_STATUS_LABELS.guard_failed)
    expect(lane(html, 'returned')).not.toContain(DRAFT_STATUS_LABELS.rejected)
    // The replaced page's folded queue name is gone.
    expect(textOf(html)).not.toContain('Avvisade')
  })

  it('a value outside the schema is shown raw, never dropped', async () => {
    const model = assembleMarketingReview(input({ review: review({ cards: [card(), card({ draft_id: 'm', status: 'mystery', can_approve: false })] }) }))
    expect(model.counts!.unknown).toBe(1)
    const unknown = model.lanes.find((l) => !l.known)!
    expect(unknown.status).toBe('mystery')
    expect(unknown.cards.map((c) => c.id)).toEqual(['m'])
    const html = await render(model)
    expect(html).toContain(UNKNOWN_STATUS_LABEL)
    expect(html).toContain('mystery')
  })

  it('the decision lane stands whenever the window has a plan, and says so when empty', async () => {
    const model = assembleMarketingReview(input({ review: review({ cards: [] }) }))
    expect(model.lanes.map((l) => l.status)).toEqual(['guard_passed'])
    expect(lane(await render(model), 'guard_passed')).toContain('Inget utkast i fönstret är redo för beslut.')
  })

  it('other lanes appear only when they hold a draft', () => {
    const model = assembleMarketingReview(input({ review: review({ cards: [card({ status: 'approved', can_approve: false })] }) }))
    expect(model.lanes.map((l) => l.status)).toEqual(['guard_passed', 'approved'])
  })

  it('cards keep the helper\'s order inside a lane', () => {
    const model = assembleMarketingReview(input({
      review: review({ cards: [card({ draft_id: 'newer' }), card({ draft_id: 'older' })] }),
    }))
    expect(model.lanes[0].cards.map((c) => c.id)).toEqual(['newer', 'older'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · The window — what it holds, and what it does not
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · the month window tells the truth', () => {
  it('a month without a plan says so, instead of "tema ej satt"', async () => {
    const model = assembleMarketingReview(input())
    expect(model.window.map((m) => [m.planKey, m.hasPlan])).toEqual([['fs-2026-09', true], ['fs-2026-10', false]])
    expect(model.attention).toContainEqual({ kind: 'no_plan', months: ['Oktober 2026'] })
    const html = await render(model)
    expect(html).toContain('Ingen kampanjplan')
    expect(html).toContain('Ingen kampanjplan för Oktober 2026')
    expect(textOf(html)).not.toContain('tema ej satt')
  })

  it('a plan whose theme is not set is still a plan', async () => {
    const model = assembleMarketingReview(input({
      review: review({ months: [{ label: 'September', plan_key: 'fs-2026-09', theme_name: null, plan_status: 'draft' }] }),
    }))
    expect(model.window[0].hasPlan).toBe(true)
    expect(await render(model)).toContain('Tema ej satt')
  })

  it('never says the review is done when the window has no plan — production on 2026-09-13', async () => {
    const model = assembleMarketingReview(input({ review: review({ months: months({}), cards: [] }) }))
    expect(model.state).toBe('ok')
    expect(model.lanes).toEqual([])
    expect(model.nothingWaiting).toBe(false)
    expect(model.attention).toContainEqual({ kind: 'no_plan', months: ['September 2026', 'Oktober 2026'] })
    expect(model.attention).toContainEqual({ kind: 'outside_undecided', count: 2, plans: 2 })
    const text = textOf(await render(model))
    expect(text).not.toMatch(/Allt granskat|Inget i fönstret väntar på beslut|Inget väntar på beslut/)
    expect(text).toContain('Ingen kampanjplan för September 2026 och Oktober 2026')
    expect(text).toContain('2 utkast utanför fönstret saknar operatörsbeslut')
  })

  it('"nothing waiting" is said only when the window holds drafts and every one is settled', async () => {
    const settled = assembleMarketingReview(input({
      review: review({ cards: [card({ draft_id: 'a', status: 'approved', can_approve: false }), card({ draft_id: 'b', status: 'returned', can_approve: false })] }),
      outside: outsideRead({ drafts: [] }),
    }))
    expect(settled.nothingWaiting).toBe(true)
    expect(textOf(await render(assembleMarketingReview(input({
      review: review({ months: months({ sep: true, oct: true }), cards: [card({ status: 'approved', can_approve: false })] }),
      outside: outsideRead({ drafts: [] }),
    }))))).toContain('Inget i fönstret väntar på beslut.')

    for (const status of ['guard_passed', 'drafted', 'needs_input', 'guard_failed', 'mystery']) {
      const model = assembleMarketingReview(input({
        review: review({ cards: [card({ status: 'approved', can_approve: false }), card({ draft_id: 'w', status, can_approve: false })] }),
      }))
      expect(model.nothingWaiting, status).toBe(false)
    }
    expect(assembleMarketingReview(input({ review: review({ cards: [] }) })).nothingWaiting).toBe(false)
  })

  it('an empty window plan is not reported as everything reviewed', async () => {
    const model = assembleMarketingReview(input({
      review: review({ months: months({ sep: true, oct: true }), cards: [] }),
      outside: outsideRead({ drafts: [] }),
    }))
    expect(model.attention).toEqual([])
    expect(textOf(await render(model))).toContain('Planerna i fönstret har inga utkast ännu.')
  })

  it('month labels carry the plan key\'s year, and an unexpected key is shown as stored', () => {
    expect(planKeyLabel('fs-2026-09')).toBe('September 2026')
    expect(planKeyLabel('fs-2027-01')).toBe('Januari 2027')
    expect(planKeyLabel('fs-2026-13')).toBe('fs-2026-13')
    expect(planKeyLabel('custom-plan')).toBe('custom-plan')
  })

  it('the window rule is the canonical helper\'s — reused, not recomputed', () => {
    for (const [name, src] of [['loader', LOADER], ['shared', SHARED]] as const) {
      expect(codeOnly(src), name).not.toMatch(/getUTCMonth|monthKeys|setUTCMonth/)
    }
    expect(codeOnly(LOADER)).toMatch(/getMarketingReview\(observed\.db, access\.allowedProjectIds, now\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · The Guard — stored, never animated
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · the Guard is shown as stored', () => {
  it('a drafted draft waits for an evaluation — it is never shown as running', async () => {
    const drafted = toCard(card({ status: 'drafted', can_approve: false, score: 80, verdict: 'warning' }))
    expect(drafted.guard).toEqual({ state: 'awaiting', score: 80, verdict: 'warning' })
    const fresh = toCard(card({ status: 'drafted', can_approve: false, score: null, verdict: null }))
    expect(fresh.guard.state).toBe('awaiting')

    const html = await render(assembleMarketingReview(input({
      review: review({ cards: [card({ status: 'drafted', can_approve: false, score: 80, verdict: 'warning' })] }),
    })))
    expect(html).toContain('väntar på bedömning · föregående rapport 80/100 · varning')
    expect(textOf(html)).not.toMatch(/Guard körs|körs…/)
  })

  it('a draft with no report says so', async () => {
    const needs = toCard(card({ status: 'needs_input', can_approve: false, score: null, verdict: null }))
    expect(needs.guard.state).toBe('missing')
    const html = await render(assembleMarketingReview(input({
      review: review({ cards: [card({ status: 'needs_input', can_approve: false, score: null, verdict: null })] }),
    })))
    expect(html).toContain('ingen rapport')
  })

  it('score and verdict are the stored ones', async () => {
    expect(toCard(card()).guard).toEqual({ state: 'reported', score: 95, verdict: 'approved' })
    expect(await render(assembleMarketingReview(input()))).toContain('95/100 · godkänt')
  })

  it('the one reason on the card surface is the helper\'s, with its tone', async () => {
    const html = await render(assembleMarketingReview(input({
      review: review({
        cards: [card({ blocking_gaps: ['cta.landing_url'], verdict: 'warning', score: 80, primary_reason: { text: 'Landningssida saknas', tone: 'warning' } })],
      }),
    })))
    expect(html).toMatch(/data-tone="warning"[^>]*>Landningssida saknas</)
  })

  it('a critical draft is marked as not approvable', async () => {
    const html = await render(assembleMarketingReview(input({
      review: review({ cards: [card({ critical: true, can_approve: false, verdict: 'rejected', score: 40, status: 'guard_failed' })] }),
    })))
    expect(html).toContain('Kan ej godkännas')
  })

  it('approving is never presented as publishing', async () => {
    const text = textOf(await render(assembleMarketingReview(input())))
    expect(text).toContain('Ingenting publiceras')
    expect(text).not.toMatch(/publicerat|publiceras nu|schemalagt|skickat till Meta/i)
    expect(DONE_MESSAGES.approve).toContain('Ingenting publicerades')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Actions — the replaced page's rule, the replaced page's route
// ─────────────────────────────────────────────────────────────────────────────

const ALL_INPUTS = (() => {
  const out: Array<{ status: string; critical: boolean; fixable: boolean; canApprove: boolean }> = []
  for (const status of [...DRAFT_STATUSES, 'mystery'])
    for (const critical of [false, true])
      for (const fixable of [false, true])
        for (const canApprove of [false, true]) out.push({ status, critical, fixable, canApprove })
  return out
})()

const actionsOf = (plan: ReturnType<typeof draftActionPlan>) =>
  [plan.primary, ...plan.secondary].filter(Boolean).map((e) => e!.action)

describe('marketing review · the controls are the ones that existed', () => {
  it('approve is offered exactly where can_approve holds; edit and return always', () => {
    for (const i of ALL_INPUTS) {
      const actions = actionsOf(draftActionPlan(i))
      expect(actions.includes('approve'), JSON.stringify(i)).toBe(i.canApprove)
      expect(actions, JSON.stringify(i)).toContain('edit')
      expect(actions, JSON.stringify(i)).toContain('return')
      expect(new Set(actions).size, JSON.stringify(i)).toBe(actions.length)
    }
  })

  it('the primary is the replaced page\'s: critical → return, fixable → Åtgärda, approvable → Godkänn, else → return', () => {
    const lead = (o: Partial<{ critical: boolean; fixable: boolean; canApprove: boolean }>) =>
      draftActionPlan({ status: 'guard_passed', critical: false, fixable: false, canApprove: false, ...o }).primary
    expect(lead({ critical: true, fixable: true, canApprove: true })).toEqual({ action: 'return', label: 'Skicka tillbaka' })
    expect(lead({ fixable: true, canApprove: true })).toEqual({ action: 'edit', label: 'Åtgärda' })
    expect(lead({ canApprove: true })).toEqual({ action: 'approve', label: 'Godkänn' })
    expect(lead({})).toEqual({ action: 'return', label: 'Skicka tillbaka' })
  })

  it('"Godkänn ändå" and "Åtgärda" come as a pair, and never otherwise', () => {
    const fixing = draftActionPlan({ status: 'guard_passed', critical: false, fixable: true, canApprove: true })
    expect(fixing.secondary).toEqual([{ action: 'return', label: 'Skicka tillbaka' }, { action: 'approve', label: 'Godkänn ändå' }])
    const clean = draftActionPlan({ status: 'guard_passed', critical: false, fixable: false, canApprove: true })
    expect(clean.secondary).toEqual([{ action: 'edit', label: 'Redigera' }, { action: 'return', label: 'Skicka tillbaka' }])
    const critical = draftActionPlan({ status: 'guard_failed', critical: true, fixable: true, canApprove: false })
    expect(critical.secondary).toEqual([{ action: 'edit', label: 'Redigera' }])
  })

  it('a draft an operator already acted on keeps its controls, but none leads', () => {
    for (const status of ['approved', 'rejected', 'returned']) {
      const plan = draftActionPlan({ status, critical: false, fixable: false, canApprove: false })
      expect(plan.primary, status).toBeNull()
      expect(actionsOf(plan), status).toEqual(['edit', 'return'])
    }
    for (const status of ['guard_passed', 'drafted', 'needs_input', 'guard_failed', 'mystery']) {
      expect(draftActionPlan({ status, critical: false, fixable: false, canApprove: false }).primary, status).not.toBeNull()
    }
  })

  it('reject is never offered — the replaced page never offered it', () => {
    for (const i of ALL_INPUTS) expect(actionsOf(draftActionPlan(i))).not.toContain('reject' as never)
    for (const [name, src] of [['island', ISLAND], ['shared', SHARED], ['component', COMPONENT]] as const) {
      expect(codeOnly(src), name).not.toMatch(/'reject'/)
    }
  })

  it('the bodies are the replaced page\'s, action for action', () => {
    expect(decisionBody('d-1', 'approve')).toEqual({ draft_id: 'd-1', action: 'approve' })
    expect(decisionBody('d-1', 'return', { caption: 'ignored', landingUrl: 'ignored' })).toEqual({ draft_id: 'd-1', action: 'return' })
    expect(decisionBody('d-1', 'edit', { caption: 'Ny text', landingUrl: 'https://x.test/a' }))
      .toEqual({ draft_id: 'd-1', action: 'edit', caption_rendered: 'Ny text', landing_url: 'https://x.test/a' })

    const legacy = read('app/(platform)/atlas/marketing/MarketingReviewClient.tsx')
    expect(legacy).toMatch(/JSON\.stringify\(\{ draft_id: draftId, action, \.\.\.extra \}\)/)
    expect(legacy).toMatch(/onAct\(card\.draft_id, 'edit', \{ caption_rendered: editCaption, landing_url: editUrl \}\)/)
    const legacyActions = new Set([...legacy.matchAll(/onAct\(card\.draft_id, '([a-z]+)'/g)].map((m) => m[1]))
    expect(legacyActions).toEqual(new Set(['approve', 'return', 'edit']))
  })

  it('every decision goes to the one existing route — no second mutation path', () => {
    expect(DECISION_ENDPOINT).toBe('/api/marketing/approvals')
    const code = codeOnly(ISLAND)
    expect(code.match(/fetch\(/g) ?? []).toHaveLength(1)
    expect(code).toMatch(/fetch\(DECISION_ENDPOINT, \{/)
    expect(code).toMatch(/method: 'POST'/)
    expect(code).toMatch(/body: JSON\.stringify\(decisionBody\(draftId, action, \{ caption, landingUrl: url \}\)\)/)
    for (const forbidden of [/createClient/, /createAdminClient/, /from\('/, /rpc\(/, /'use server'/, /\/api\/marketing\/(drafts|guard|plans)/]) {
      expect(code, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('never renders a refused decision as success', () => {
    expect(decisionOutcome('approve', 200, { ok: true })).toEqual({ kind: 'done', message: DONE_MESSAGES.approve })
    expect(decisionOutcome('approve', 409, { error: 'Får inte godkännas (Guard underkänd eller CRITICAL).' }))
      .toEqual({ kind: 'refused', message: 'Får inte godkännas (Guard underkänd eller CRITICAL).' })
    expect(decisionOutcome('approve', 409, null).kind).toBe('refused')
    expect(decisionOutcome('return', 404, { error: 'Utkast hittades inte' })).toEqual({ kind: 'error', message: 'Utkast hittades inte' })
    expect(decisionOutcome('edit', 401, { error: 'Unauthorized' }).message).toContain('Logga in')
    expect(decisionOutcome('edit', 500, { error: '   ' })).toEqual({ kind: 'error', message: 'Beslutet gick inte igenom.' })
    expect(decisionOutcome('approve', 302, null).kind).toBe('error')
    expect(decisionOutcome('approve', 199, null).kind).toBe('error')

    const code = codeOnly(ISLAND)
    const handler = code.slice(code.indexOf('const send = useCallback'), code.indexOf('const startEdit'))
    expect(handler.indexOf('if (!res.ok)')).toBeGreaterThan(-1)
    expect(handler.indexOf('if (!res.ok)')).toBeLessThan(handler.indexOf('setEditing(false)'))
    expect(handler).toMatch(/if \(!res\.ok\) \{[\s\S]*?return\s*\}/)
  })

  it('the consequence of each control is written beside it', async () => {
    const html = await render(assembleMarketingReview(input()))
    expect(html).toContain(DRAFT_ACTION_NOTES.approve)
    expect(html).toContain(DRAFT_ACTION_NOTES.return)
    expect(DRAFT_ACTION_NOTES.return).toMatch(/Drafter-körning/)
    expect(DRAFT_ACTION_NOTES.return).toMatch(/språkmodell/)
  })

  it('the landing-page rules are the replaced page\'s', () => {
    expect(needsLandingUrl('trial')).toBe(true)
    expect(needsLandingUrl('subscribe')).toBe(true)
    expect(needsLandingUrl('follow')).toBe(false)
    expect(needsLandingUrl(null)).toBe(false)
    expect(landingUrlDraft('<landing_url>')).toBe('')
    expect(landingUrlDraft('https://familje-stunden.se/prova')).toBe('https://familje-stunden.se/prova')
    expect(landingUrlDraft(null)).toBe('')
    expect(toCard(card({ cta: { label: 'Prova', type: 'trial', landing_url_slot: '<landing_url>' } })).cta)
      .toEqual({ label: 'Prova', type: 'trial', landingUrl: null, needsLandingUrl: true })
  })

  it('an edit starts from the stored values, and a placeholder is not an address', () => {
    const code = codeOnly(ISLAND)
    const start = code.slice(code.indexOf('const startEdit'), code.indexOf('const working'))
    expect(start).toMatch(/setCaption\(captionFull\)/)
    expect(start).toMatch(/setUrl\(landingUrl \?\? ''\)/)
    expect(code).toMatch(/\{needsLandingUrl && \(/)
  })

  it('the controls are rendered on every card', async () => {
    const html = await render(assembleMarketingReview(input({
      review: review({ cards: [card({ draft_id: 'a' }), card({ draft_id: 'b', status: 'approved', can_approve: false })] }),
    })))
    expect(html.match(/aria-label="Beslut"/g) ?? []).toHaveLength(2)
    expect(lane(html, 'approved')).toContain('Åtgärder')
    expect(lane(html, 'approved')).not.toContain('data-emphasis="primary"')
    expect(lane(html, 'guard_passed')).toContain('data-emphasis="primary"')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Reads that fail are not empty
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · a failed read is unreadable, not empty', () => {
  const builder = (result: unknown, reject = false) => {
    const ops: string[] = []
    const q: any = {
      select: (...a: unknown[]) => { ops.push(`select:${a.join(',')}`); return q },
      eq: (c: string, v: unknown) => { ops.push(`eq:${c}=${v}`); return q },
      maybeSingle: () => { ops.push('maybeSingle'); return q },
      then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
        (reject ? Promise.reject(new Error('socket')) : Promise.resolve(result)).then(ok, err),
    }
    return { db: { from: (t: string) => { ops.push(`from:${t}`); return q } }, ops }
  }

  it('passes every call and every result through unchanged', async () => {
    const raw = builder({ data: [{ id: 'x' }], error: null })
    const observed = observeReads(raw.db)
    const res = await (observed.db as any).from('projects').select('id').eq('slug', 's').maybeSingle()
    expect(res).toEqual({ data: [{ id: 'x' }], error: null })
    expect(raw.ops).toEqual(['from:projects', 'select:id', 'eq:slug=s', 'maybeSingle'])
    expect(observed.failed()).toBe(false)
  })

  it('notices a result that carries an error', async () => {
    const observed = observeReads(builder({ data: null, error: { message: 'boom' } }).db)
    await (observed.db as any).from('guard_reports').select('*')
    expect(observed.failed()).toBe(true)
  })

  it('notices a rejection, and still rejects', async () => {
    const observed = observeReads(builder(null, true).db)
    await expect((observed.db as any).from('runs').select('*')).rejects.toThrow('socket')
    expect(observed.failed()).toBe(true)
  })

  it('observes a promise-returning terminal too', async () => {
    const observed = observeReads({ from: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'x' } }) }) })
    await (observed.db as any).from('projects').maybeSingle()
    expect(observed.failed()).toBe(true)
  })

  it('the canonical helper reaches the database only through db.from, so every read is observed', () => {
    const helper = codeOnly(read('lib/marketing/review.ts'))
    const calls = helper.match(/\bdb\.[a-zA-Z_]+\(/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    expect(new Set(calls)).toEqual(new Set(['db.from(']))
  })

  it('a review that could not be read whole shows no drafts and claims nothing', async () => {
    const model = assembleMarketingReview(input({ reviewReadOk: false, review: review({ cards: [] }) }))
    expect(model.state).toBe('error')
    expect(model.counts).toBeNull()
    expect(model.lanes).toEqual([])
    expect(model.nothingWaiting).toBe(false)
    const html = await render(model)
    expect(html).toContain(UNREADABLE_LABEL)
    expect(html).toContain('inte samma sak som att inget väntar')
    expect(textOf(html)).not.toMatch(/Inget i fönstret väntar på beslut|Planerna i fönstret har inga utkast/)
  })

  it('an outside read that failed is labelled unreadable, not "no plans"', async () => {
    const model = assembleMarketingReview(input({ outside: outsideRead({ ok: false, plans: [], briefs: [], drafts: [] }) }))
    expect(model.outside.state).toBe('error')
    expect(model.attention).toContainEqual({ kind: 'outside_unreadable' })
    const html = await render(model)
    expect(html).toContain('Planerna utanför fönstret kunde inte läsas')
    expect(textOf(html)).not.toContain('Det finns inga planer utanför fönstret.')
  })

  it('a truncated outside read says its counts are a lower bound', async () => {
    const model = assembleMarketingReview(input({ outside: outsideRead({ truncated: true }) }))
    expect(model.attention).toContainEqual({ kind: 'outside_truncated' })
    expect(await render(model)).toContain('Antalen där är en undre gräns.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Outside the window — counted, owned, latest version only
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · plans outside the window', () => {
  it('counts the latest version per brief, by version rather than row order', () => {
    const shuffled = outsideRead()
    shuffled.drafts = [...shuffled.drafts].reverse()
    const summary = summariseOutside(shuffled, new Set(['fs-2026-09', 'fs-2026-10']))
    const jul = summary.plans.find((p) => p.planKey === 'fs-2026-07')!
    expect(jul.drafts).toBe(2)
    expect(jul.byStatus).toEqual([{ status: 'guard_passed', count: 1 }, { status: 'approved', count: 1 }])
    expect(summary.undecided).toBe(2)
    expect(summary.drafts).toBe(3)
  })

  it('plans inside the window are not counted twice', () => {
    const withWindowPlan = outsideRead({
      plans: [...outsideRead().plans, { id: 'cp-sep', project_id: MINE, plan_key: 'fs-2026-09', theme_name: 'Höstmys', status: 'draft' }],
      briefs: [...outsideRead().briefs, { id: 'cb-sep', project_id: MINE, plan_id: 'cp-sep' }],
      drafts: [...outsideRead().drafts, { id: 'd-sep', project_id: MINE, brief_id: 'cb-sep', status: 'guard_passed', version: 1 }],
    })
    const summary = summariseOutside(withWindowPlan, new Set(['fs-2026-09', 'fs-2026-10']))
    expect(summary.plans.map((p) => p.planKey)).toEqual(['fs-2026-07', 'fs-2026-06'])
    expect(summary.undecided).toBe(2)
  })

  it('a foreign plan, brief or draft never reaches a count', () => {
    const tainted = outsideRead({
      plans: [...outsideRead().plans, { id: 'cp-x', project_id: THEIRS, plan_key: 'fs-2026-05', theme_name: 'SECRET-THEME', status: 'draft' }],
      briefs: [
        ...outsideRead().briefs,
        { id: 'cb-x', project_id: THEIRS, plan_id: 'cp-jun' },
        { id: 'cb-orphan', project_id: MINE, plan_id: 'cp-x' },
      ],
      drafts: [
        ...outsideRead().drafts,
        // A foreign draft on an owned brief, with a higher version: it must not become "the latest".
        { id: 'd-x', project_id: THEIRS, brief_id: 'cb-jun-1', status: 'approved', version: 9 },
        { id: 'd-x2', project_id: MINE, brief_id: 'cb-x', status: 'guard_passed', version: 1 },
        { id: 'd-x3', project_id: MINE, brief_id: 'cb-orphan', status: 'guard_passed', version: 1 },
      ],
    })
    const summary = summariseOutside(tainted, new Set())
    expect(summary.plans.map((p) => p.planKey)).toEqual(['fs-2026-07', 'fs-2026-06'])
    expect(summary.drafts).toBe(3)
    expect(summary.undecided).toBe(2)
    expect(summary.plans.find((p) => p.planKey === 'fs-2026-06')!.byStatus).toEqual([{ status: 'guard_passed', count: 1 }])
    expect(JSON.stringify(summary)).not.toContain('SECRET')
  })

  it('an unknown status is counted and named, never assumed decided or undecided', () => {
    const summary = summariseOutside(outsideRead({
      drafts: [{ id: 'd', project_id: MINE, brief_id: 'cb-jun-1', status: 'mystery', version: 1 }],
    }), new Set())
    const jun = summary.plans.find((p) => p.planKey === 'fs-2026-06')!
    expect(jun.byStatus).toEqual([{ status: 'mystery', count: 1 }])
    expect(jun.undecided).toBe(0)
  })

  it('a plan with no drafts is listed as having none', async () => {
    const model = assembleMarketingReview(input({ outside: outsideRead({ drafts: [] }) }))
    expect(model.outside.plans.map((p) => p.drafts)).toEqual([0, 0])
    expect(await render(model)).toContain('Inga utkast')
  })

  it('renders each plan with its counts in words', async () => {
    const html = await render(assembleMarketingReview(input()))
    expect(html).toContain('Juli 2026 · Sagosommar')
    expect(html).toContain('2 utkast, varav 1 utan operatörsbeslut')
    expect(html).toContain(`${DRAFT_STATUS_LABELS.guard_passed} 1 · ${DRAFT_STATUS_LABELS.approved} 1`)
  })

  it('when the session owns no marketing project, nothing past the root is shown', async () => {
    const model = assembleMarketingReview(input({
      review: { months: [], counts: { pending: 0, approved: 0, rejected: 0, needs_input: 0 }, cards: [] },
      outside: outsideRead({ plans: [{ id: 'p', project_id: MINE, plan_key: 'fs-2026-01', theme_name: 'SECRET-THEME', status: 'draft' }] }),
    }))
    expect(model.state).toBe('unavailable')
    expect(model.outside.plans).toEqual([])
    const html = await render(model)
    expect(html).toContain('Ingen marknadsgranskning är tillgänglig')
    expect(html).not.toMatch(/SECRET|Familje-Stunden|Sagosommar/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Generation — the rollback branch returns before the vNext read
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · generation branch', () => {
  beforeEach(() => { vi.resetModules() })

  const mountPage = async (cookie: string | null) => {
    let loaderCalls = 0
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookie && n === 'omnira_ui' ? { value: cookie } : undefined) }),
    }))
    vi.doMock('@/lib/os/marketing-review', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/marketing-review')>()),
      loadMarketingReview: async () => { loaderCalls += 1; return assembleMarketingReview(input()) },
    }))
    vi.doMock('@/app/(platform)/atlas/marketing/MarketingLegacy', () => ({
      MarketingLegacy: () => React.createElement('div', null, 'LEGACY BODY'),
    }))
    const mod = await import('@/app/(platform)/atlas/marketing/page')
    const el = await mod.default()
    return { html: renderToStaticMarkup(el as React.ReactElement), loaderCalls: () => loaderCalls }
  }

  it('legacy renders the moved body and never reaches the vNext loader', async () => {
    const { html, loaderCalls } = await mountPage('legacy')
    expect(html).toContain('LEGACY BODY')
    expect(loaderCalls()).toBe(0)
  })

  it('the default generation is vNext', async () => {
    const { html } = await mountPage(null)
    expect(html).not.toContain('LEGACY BODY')
  })

  it('the page branches before it constructs the loader', () => {
    const src = codeOnly(read('app/(platform)/atlas/marketing/page.tsx'))
    const branch = src.indexOf('<MarketingLegacy />')
    const load = src.indexOf('loadMarketingReview(')
    expect(branch).toBeGreaterThan(-1)
    expect(load).toBeGreaterThan(branch)
    expect(src).toMatch(/if \(!model\) redirect\('\/login'\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8 · The read — session-scoped, derived, fail-closed
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · the loader', () => {
  beforeEach(() => {
    vi.doUnmock('@/lib/os/marketing-review')
    vi.doUnmock('next/headers')
    vi.doUnmock('@/app/(platform)/atlas/marketing/MarketingLegacy')
    vi.resetModules()
  })

  const draft = (o: Record<string, unknown>) => ({
    channel: 'instagram', format: 'reel', beat: 'teaser', draft_payload: { caption_rendered: 'Copy' }, run_id: null,
    created_at: '2026-06-04T00:00:00.000Z', ...o,
  })

  const TABLES = () => ({
    projects: [
      { id: MINE, slug: MARKETING_PROJECT_SLUG, name: 'Familje-Stunden' },
      { id: THEIRS, slug: 'another-project', name: 'SECRET-PROJECT' },
    ] as any[],
    campaign_plans: [
      { id: 'cp-jun', project_id: MINE, plan_key: 'fs-2026-06', target_month: '2026-06-01', theme_name: 'Varumärke', status: 'draft', run_id: null },
      { id: 'cp-jul', project_id: MINE, plan_key: 'fs-2026-07', target_month: '2026-07-01', theme_name: 'Sagosommar', status: 'draft', run_id: null },
      { id: 'cp-theirs', project_id: THEIRS, plan_key: 'fs-2026-09', target_month: '2026-09-01', theme_name: 'SECRET-THEME', status: 'draft', run_id: null },
    ] as any[],
    campaign_briefs: [
      { id: 'cb-jun', project_id: MINE, plan_id: 'cp-jun', brief_key: 'jun-1', created_at: '2026-06-04T00:00:00.000Z' },
      { id: 'cb-jul-a', project_id: MINE, plan_id: 'cp-jul', brief_key: 'jul-1', created_at: '2026-06-04T00:00:00.000Z' },
      { id: 'cb-jul-b', project_id: MINE, plan_id: 'cp-jul', brief_key: 'jul-2', created_at: '2026-06-04T00:00:00.000Z' },
      { id: 'cb-theirs', project_id: THEIRS, plan_id: 'cp-theirs', brief_key: 'x', created_at: '2026-09-01T00:00:00.000Z' },
    ] as any[],
    draft_posts: [
      draft({ id: 'dp-jun', project_id: MINE, brief_id: 'cb-jun', draft_key: 'draft-jun-1-v1', status: 'guard_passed', version: 1 }),
      draft({ id: 'dp-jul-a1', project_id: MINE, brief_id: 'cb-jul-a', draft_key: 'draft-jul-1-v1', status: 'returned', version: 1 }),
      draft({ id: 'dp-jul-a2', project_id: MINE, brief_id: 'cb-jul-a', draft_key: 'draft-jul-1-v2', status: 'approved', version: 2 }),
      draft({ id: 'dp-jul-b', project_id: MINE, brief_id: 'cb-jul-b', draft_key: 'draft-jul-2-v1', status: 'guard_passed', version: 1 }),
      draft({ id: 'dp-theirs', project_id: THEIRS, brief_id: 'cb-theirs', draft_key: 'SECRET-DRAFT', status: 'guard_passed', version: 1, draft_payload: { caption_rendered: 'SECRET-CAPTION' } }),
    ] as any[],
    guard_reports: [
      { draft_id: 'dp-theirs', project_id: THEIRS, run_id: null, verdict: 'approved', score: 99, score_breakdown: {}, violations: [], warnings: [], gap_flags: [], evaluated_at: '2026-09-01T00:00:00.000Z' },
    ] as any[],
    runs: [] as any[],
  })

  /** Hands the marketing project a plan inside the window, with one draft and its report. */
  const withWindowPlan = (t: ReturnType<typeof TABLES>) => {
    t.campaign_plans.push({ id: 'cp-sep', project_id: MINE, plan_key: 'fs-2026-09', target_month: '2026-09-01', theme_name: 'Höstmys', status: 'draft', run_id: null })
    t.campaign_briefs.push({ id: 'cb-sep', project_id: MINE, plan_id: 'cp-sep', brief_key: 'sep-1', created_at: '2026-09-01T00:00:00.000Z' })
    t.draft_posts.push(draft({ id: 'dp-sep', project_id: MINE, brief_id: 'cb-sep', draft_key: 'draft-sep-1-v1', status: 'guard_passed', version: 1, created_at: '2026-09-01T00:00:00.000Z' }))
    t.guard_reports.push({ draft_id: 'dp-sep', project_id: MINE, run_id: null, verdict: 'approved', score: 94, score_breakdown: {}, violations: [], warnings: [], gap_flags: [], evaluated_at: '2026-09-01T00:00:00.000Z' })
    return t
  }

  type Call = { table: string; ops: string[] }

  const fakeAdmin = (
    tables: Record<string, any[]>,
    fail: (table: string, ops: string[]) => boolean,
    o: { unscoped?: string } = {},
  ) => {
    const calls: Call[] = []
    const from = (table: string) => {
      const rec: Call = { table, ops: [] }
      calls.push(rec)
      let rows = [...(tables[table] ?? [])]
      let single = false
      const q: any = {
        select: () => { rec.ops.push('select'); return q },
        eq: (c: string, v: unknown) => { rec.ops.push(`eq:${c}=${v}`); rows = rows.filter((r) => r[c] === v); return q },
        in: (c: string, v: unknown[]) => {
          rec.ops.push(`in:${c}=${v.join(',')}`)
          if (o.unscoped !== table) rows = rows.filter((r) => v.includes(r[c]))
          return q
        },
        order: (c: string, o?: { ascending?: boolean }) => {
          rec.ops.push(`order:${c}`)
          const dir = o?.ascending === false ? -1 : 1
          rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * dir)
          return q
        },
        limit: (n: number) => { rec.ops.push(`limit:${n}`); rows = rows.slice(0, n); return q },
        maybeSingle: () => { rec.ops.push('maybeSingle'); single = true; return q },
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(
            fail(table, rec.ops)
              ? { data: null, error: { message: 'boom' } }
              : { data: single ? rows[0] ?? null : rows, error: null },
          ).then(ok, err),
      }
      return q
    }
    return { db: { from }, calls }
  }

  const mountLoader = async (o: {
    allowed?: string[]
    accessOk?: boolean
    tables?: ReturnType<typeof TABLES>
    fail?: (table: string, ops: string[]) => boolean
  } = {}) => {
    const fake = fakeAdmin(o.tables ?? TABLES(), o.fail ?? (() => false))
    vi.doMock('@/lib/auth/project-access', () => ({
      resolveProjectAccess: async () =>
        o.accessOk === false ? { ok: false, response: null } : { ok: true, userId: 'user-me', allowedProjectIds: o.allowed ?? [MINE] },
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.db }))
    const { loadMarketingReview } = await import('@/lib/os/marketing-review')
    const model = await loadMarketingReview(NOW)
    return { model, calls: fake.calls }
  }

  const of = (calls: Call[], table: string) => calls.filter((c) => c.table === table)
  const roots = (calls: Call[]) => of(calls, 'projects').filter((c) => c.ops.includes(`eq:slug=${MARKETING_PROJECT_SLUG}`))

  it('returns null — and reads nothing — when the scope cannot be resolved', async () => {
    const { model, calls } = await mountLoader({ accessOk: false })
    expect(model).toBeNull()
    expect(calls).toEqual([])
  })

  it('both chains start at the slug, authorised against the allow-list', async () => {
    const { calls } = await mountLoader()
    const r = roots(calls)
    expect(r).toHaveLength(2)
    for (const root of r) expect(root.ops).toEqual(['select', `eq:slug=${MARKETING_PROJECT_SLUG}`, `in:id=${MINE}`, 'maybeSingle'])
  })

  it('every outside read is keyed on the authorised project and bounded', async () => {
    const { calls } = await mountLoader()
    expect(of(calls, 'campaign_plans').map((c) => c.ops)).toContainEqual(
      ['select', `eq:project_id=${MINE}`, 'order:target_month', `limit:${OUTSIDE_LIMITS.plans}`])
    expect(of(calls, 'campaign_briefs').map((c) => c.ops)).toContainEqual(
      ['select', `eq:project_id=${MINE}`, 'order:created_at', `limit:${OUTSIDE_LIMITS.briefs}`])
    expect(of(calls, 'draft_posts').map((c) => c.ops)).toContainEqual(
      ['select', `eq:project_id=${MINE}`, 'order:version', `limit:${OUTSIDE_LIMITS.drafts}`])
  })

  it('production\'s shape end to end: no plan in the window, undecided drafts outside it', async () => {
    const { model } = await mountLoader()
    expect(model!.state).toBe('ok')
    expect(model!.window.map((m) => [m.planKey, m.hasPlan])).toEqual([['fs-2026-09', false], ['fs-2026-10', false]])
    expect(model!.lanes).toEqual([])
    expect(model!.attention).toEqual([
      { kind: 'no_plan', months: ['September 2026', 'Oktober 2026'] },
      { kind: 'outside_undecided', count: 2, plans: 2 },
    ])
    expect(model!.outside.plans.map((p) => [p.planKey, p.drafts, p.undecided])).toEqual([['fs-2026-07', 2, 1], ['fs-2026-06', 1, 1]])
  })

  it('the window\'s drafts come through the canonical helper and its derived chain', async () => {
    const { model, calls } = await mountLoader({ tables: withWindowPlan(TABLES()) })
    expect(model!.lanes.map((l) => [l.status, l.cards.map((c) => c.id)])).toEqual([['guard_passed', ['dp-sep']]])
    expect(model!.lanes[0].cards[0].guard).toEqual({ state: 'reported', score: 94, verdict: 'approved' })
    expect(of(calls, 'campaign_plans').map((c) => c.ops)).toContainEqual(
      ['select', `eq:project_id=${MINE}`, 'in:plan_key=fs-2026-09,fs-2026-10'])
    expect(of(calls, 'campaign_briefs').some((c) => c.ops.includes('in:plan_id=cp-sep'))).toBe(true)
    expect(of(calls, 'draft_posts').some((c) => c.ops.includes('in:brief_id=cb-sep'))).toBe(true)
    expect(of(calls, 'guard_reports').some((c) => c.ops.includes('in:draft_id=dp-sep'))).toBe(true)
    expect(model!.outside.plans.map((p) => p.planKey)).toEqual(['fs-2026-07', 'fs-2026-06'])
  })

  it('foreign rows never reach the model through the real read path', async () => {
    const { model } = await mountLoader({ tables: withWindowPlan(TABLES()) })
    expect(JSON.stringify(model)).not.toMatch(/SECRET/)
  })

  it('a slug the session does not own yields no review and no read past the root', async () => {
    const t = TABLES()
    t.projects = [{ id: THEIRS, slug: MARKETING_PROJECT_SLUG, name: 'SECRET-PROJECT' }]
    const { model, calls } = await mountLoader({ tables: t })
    expect(model!.state).toBe('unavailable')
    for (const table of ['campaign_plans', 'campaign_briefs', 'draft_posts', 'guard_reports', 'runs']) {
      expect(of(calls, table), table).toHaveLength(0)
    }
    expect(JSON.stringify(model)).not.toMatch(/SECRET/)
  })

  it('an empty allow-list carries the impossible id into both root lookups, with no fallback', async () => {
    const { model, calls } = await mountLoader({ allowed: [] })
    const r = roots(calls)
    expect(r).toHaveLength(2)
    for (const root of r) expect(root.ops).toContain(`in:id=${IMPOSSIBLE_PROJECT_ID}`)
    expect(model!.state).toBe('unavailable')
  })

  it('a root row outside the allow-list is refused again before anything below it is read', async () => {
    const { readOutside } = await import('@/lib/os/marketing-review')
    const t = TABLES()
    t.projects = [{ id: THEIRS, slug: MARKETING_PROJECT_SLUG, name: 'SECRET-PROJECT' }]
    // A root lookup whose scope regressed: `in` is recorded but filters nothing,
    // so the database hands back the foreign project. The id check refuses it.
    const fake = fakeAdmin(t, () => false, { unscoped: 'projects' })
    const out = await readOutside(fake.db, [MINE])
    expect(out).toEqual({ ok: true, projectId: null, plans: [], briefs: [], drafts: [], truncated: false })
    expect(fake.calls.map((c) => c.table)).toEqual(['projects'])
  })

  it('a failed read inside the canonical helper makes the review unreadable, not empty', async () => {
    const { model } = await mountLoader({ tables: withWindowPlan(TABLES()), fail: (table) => table === 'guard_reports' })
    expect(model!.state).toBe('error')
    expect(model!.lanes).toEqual([])
    expect(model!.counts).toBeNull()
  })

  it('a failed outside read is unreadable there, and the window still stands', async () => {
    const { model } = await mountLoader({
      tables: withWindowPlan(TABLES()),
      fail: (table, ops) => table === 'draft_posts' && ops.includes(`limit:${OUTSIDE_LIMITS.drafts}`),
    })
    expect(model!.state).toBe('ok')
    expect(model!.lanes[0].cards.map((c) => c.id)).toEqual(['dp-sep'])
    expect(model!.outside.state).toBe('error')
    expect(model!.attention).toContainEqual({ kind: 'outside_unreadable' })
  })

  it('a failed root lookup makes the review unreadable, never "not available"', async () => {
    const { model } = await mountLoader({ fail: (table) => table === 'projects' })
    expect(model!.state).toBe('error')
    expect(model!.outside.state).toBe('error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Static boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · boundaries the surface must not cross', () => {
  const all = [['loader', LOADER], ['component', COMPONENT], ['island', ISLAND], ['shared', SHARED]] as const

  it('the read side writes nothing — no action, no mutation, no rpc', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/'use server'|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/)
    }
  })

  it('resolves the scope server-side and fails closed', () => {
    const code = codeOnly(LOADER)
    expect(code).toMatch(/resolveProjectAccess\(\)/)
    expect(code).toMatch(/if \(!access\.ok\) return null/)
    expect(code).toMatch(/scopeProjectFilter\(access\.allowedProjectIds\)/)
    expect(code).not.toMatch(/allowedProjectIds\[0\]|projects\[0\]/)
  })

  it('uses the canonical helper\'s slug, not a second one', () => {
    const helperSlug = /const FAMILJE_SLUG = '([^']+)'/.exec(read('lib/marketing/review.ts'))?.[1]
    expect(helperSlug).toBe(MARKETING_PROJECT_SLUG)
    expect(codeOnly(LOADER).match(/'familje-stunden'/g) ?? []).toHaveLength(1)
  })

  it('reads no environment and triggers no drafting, Guard run, publishing, Memory or Dream', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(
        /process\.env|runStep|getAnthropic|channelDrafterHandler|brandGuardHandler|MARKETING_HANDLERS|evaluateGuard|recordMemoryEvent|atlas\/memory|runDreamCycleForProject/,
      )
    }
  })

  it('the shared half stays client-safe', () => {
    expect(codeOnly(SHARED)).not.toMatch(/server-only|supabase|createClient|from\('/)
  })

  it('the loader stays server-only', () => {
    expect(LOADER).toMatch(/^import 'server-only'/m)
  })

  it('the surface is a server component; only the card controls are client code', () => {
    expect(COMPONENT).not.toMatch(/'use client'/)
    expect(codeOnly(COMPONENT)).not.toMatch(/addEventListener|onClick|onChange|useEffect|useState|fetch\(/)
    expect(ISLAND).toMatch(/^'use client'/)
    expect(codeOnly(ISLAND)).not.toMatch(/addEventListener|onKeyDown|useEffect/)
    expect(codeOnly(ISLAND)).not.toMatch(/from '@\/lib\/os\/marketing-review'/)
  })

  it('the stop authority is nowhere near this surface', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/PauseToggle|toggleAutomationPause|toggleProjectExecutionPause/)
    }
  })

  it('the destination is labelled Marknadsgranskning, one identity with the nav', () => {
    expect(destinationLabel('marketing_queue')).toBe('Marknadsgranskning')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Rollback — the legacy body is byte-identical
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · the rollback body is the body it replaced', () => {
  const LEGACY = read('app/(platform)/atlas/marketing/MarketingLegacy.tsx')

  it('is pinned by hash, its own doc comment included', () => {
    const body = LEGACY.slice(LEGACY.indexOf('/**\n * Marketing Review — Action Center för Familje-Stundens Marketing Engine (Fas 4).'))
    expect(createHash('sha256').update(body).digest('hex'))
      .toBe('a94f3da9b2f03d5f46e83224d98a8e1e82154fe0dc23360ad437b3142f7cae6b')
  })

  it('keeps its own scoped service-role read and the same client component', () => {
    expect(LEGACY).toMatch(/getAllowedProjectIds\(db, user\.id\)/)
    expect(LEGACY).toMatch(/getMarketingReview\(db, allowedProjectIds\)/)
    expect(LEGACY).toMatch(/<MarketingReviewClient initial=\{review\} \/>/)
    expect(LEGACY).toMatch(/from '\.\/MarketingReviewClient'/)
  })

  it('the client component it renders is untouched', () => {
    const client = readFileSync(resolve(WEB_ROOT, 'app/(platform)/atlas/marketing/MarketingReviewClient.tsx'))
    expect(createHash('sha256').update(client).digest('hex'))
      .toBe('181067f762523f8e447d1e349bf7c99e33e3a2653d0aa750e0344815a674e62e')
  })

  it('the segment config moved to the page, which owns it for both generations', () => {
    expect(LEGACY).not.toMatch(/export const dynamic/)
    expect(read('app/(platform)/atlas/marketing/page.tsx')).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11 · Render + layout
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing review · rendered surface and layout', () => {
  const CSS = read('components/platform/vnext/MarketingReview.module.css')

  it('the loading state claims nothing about the data', async () => {
    const { MarketingReviewLoading } = await import('@/components/platform/vnext/MarketingReview')
    const html = renderToStaticMarkup(React.createElement(MarketingReviewLoading))
    expect(textOf(html)).not.toMatch(/\d/)
    expect(html).toContain('Marknadsgranskning')
  })

  it('prints no invented reach, engagement, conversion or revenue figure', async () => {
    const html = await render(assembleMarketingReview(input()))
    expect(textOf(html)).not.toMatch(/%|engagemang|räckvidd|visningar|klickfrekvens|konvertering|intäkt|ROI/i)
  })

  it('explains where each figure comes from', async () => {
    const html = await render(assembleMarketingReview(input()))
    expect(html).toContain('Hur uppgifterna är framtagna')
    expect(html).toContain('räknat i UTC')
    expect(html).toContain('regelmotor')
  })

  it('declares its own font, rem sizes, no sideways scroll, wrapping text', () => {
    expect(CSS).toMatch(/font-family: var\(--font-geist-sans\)/)
    expect(CSS).not.toMatch(/font-size:\s*\d+px/)
    expect(CSS).toMatch(/overflow-x: hidden/)
    expect(CSS).toMatch(/overflow-wrap: anywhere/)
  })

  it('reflows on a phone with touch-sized controls, honours reduced motion and keeps focus visible', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\)/)
    expect(CSS).toMatch(/min-height: 2\.75rem/)
    // The card head stacks on a phone; its identity column must not keep the
    // row's flex basis, which would turn into sixteen rem of empty height.
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 768px)'), CSS.indexOf('@media (prefers-reduced-motion'))
    expect(phone).toMatch(/\.cardIdentity \{ flex: 0 1 auto; \}/)
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    for (const selector of ['.action:focus-visible', '.summary:focus-visible', '.moreSummary:focus-visible', '.textarea:focus-visible']) {
      expect(CSS, selector).toContain(selector)
    }
  })

  it('the controls stay visible without the shared foreground token', () => {
    // These controls were given a cyan outline while `--foreground-rgb` was still
    // undefined and a border built on it was dropped whole. The token is defined
    // now; the outline stays as shipped, and this pins that it did not change.
    const block = (selector: string) => {
      const i = CSS.indexOf(`${selector} {`)
      expect(i, selector).toBeGreaterThan(-1)
      return CSS.slice(i, CSS.indexOf('}', i))
    }
    for (const selector of ['.action', '.moreSummary', '.input,\n.textarea']) {
      expect(block(selector), selector).toMatch(/border: 1px solid rgb\(var\(--omnira-cyan-rgb\)/)
    }
    // The overflow toggle keeps its native disclosure marker.
    expect(block('.moreSummary')).not.toMatch(/list-style: none|display: inline-block/)
    expect(CSS).not.toMatch(/::-webkit-details-marker/)
    // A label never breaks mid-word beside a long value.
    expect(CSS).toMatch(/\.metaLabel \{ flex: none;/)
  })

  it('every form control is labelled', () => {
    const code = codeOnly(ISLAND)
    expect(code).toMatch(/htmlFor=\{`caption-\$\{draftId\}`\}/)
    expect(code).toMatch(/id=\{`caption-\$\{draftId\}`\}/)
    expect(code).toMatch(/htmlFor=\{`landing-\$\{draftId\}`\}/)
    expect(code).toMatch(/id=\{`landing-\$\{draftId\}`\}/)
    expect(code).toMatch(/role="status"/)
  })
})
