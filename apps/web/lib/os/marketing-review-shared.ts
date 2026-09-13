/**
 * Marknadsgranskning — the client-safe half of the contract.
 *
 * Vocabulary, labels and the pure decision helpers the card controls use.
 * `lib/os/marketing-review.ts` is `server-only` because it reaches the
 * database, so anything a component needs at runtime lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, project scoping.
 *
 * THE REVIEW TRUTH MODEL. Each rule was re-derived from canonical code and
 * read-only production data (2026-09-13), not assumed:
 *
 *   STATUS IS THE DRAFT'S OWN COLUMN. `draft_posts.status` is CHECK-constrained
 *   to seven values, and each has one kind of writer: the Channel Drafter
 *   (`drafted`, or `needs_input` when the plan's theme is not established), the
 *   Brand Guard (`guard_passed` for an approved or warning verdict,
 *   `guard_failed` for a rejected one) and an operator decision (`approved`,
 *   `rejected`, `returned`, and `drafted` again after an edit). The page this
 *   replaces folded them into four queues, so a draft sent back to the Drafter
 *   and a draft the Guard rejected both read as "Avvisade" — the operator's own
 *   rejection. Every stored status gets its own lane here, and a value outside
 *   the seven is shown raw rather than dropped.
 *
 *   THE WINDOW IS THE ACTIVE AND NEXT CALENDAR MONTH, IN UTC. That is
 *   `getMarketingReview`'s rule, reused unchanged. The page this replaces said
 *   "Allt granskat ✓" whenever the window held no card — including when neither
 *   month has a plan while drafts in other plans never received a decision.
 *   Production on 2026-09-13: no plan for September or October, and 13 latest
 *   drafts from June and July without an operator decision.
 *
 *   ONLY THE LATEST VERSION PER BRIEF IS REVIEWED. A returned draft leaves the
 *   review once the Drafter writes the next version; while it is still the
 *   latest, no new version exists yet.
 *
 *   THE GUARD IS A RULE ENGINE. Its score and verdict are stored on
 *   `guard_reports` and shown as stored. A `drafted` draft is waiting for a
 *   Guard evaluation — nothing observes one "running" — and an edited draft
 *   keeps its previous report until the Guard has evaluated it again.
 *
 *   A DECISION PUBLISHES NOTHING. The marketing engine has no publishing,
 *   scheduling or Meta path. Approved means approved in Atlas.
 *
 *   THE ACTIONS ARE THE ONES THAT EXISTED, under the same conditions. Godkänn,
 *   Åtgärda/Redigera and Skicka tillbaka post to the existing
 *   `POST /api/marketing/approvals`: approve only where the review helper's
 *   `can_approve` holds — the route refuses otherwise, and that refusal is shown
 *   as one — and edit and return on every card. The route also accepts
 *   `reject`; this page never offered it and still does not. Returning a draft
 *   asks for a new Drafter run, which writes a new version with a language
 *   model, and that consequence is stated beside the control.
 */

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/** The seven values `draft_posts.status` may hold, in the order an operator works them. */
export const DRAFT_STATUSES = [
  'guard_passed',
  'drafted',
  'needs_input',
  'guard_failed',
  'returned',
  'rejected',
  'approved',
] as const

export type DraftStatus = (typeof DRAFT_STATUSES)[number]

export function isDraftStatus(value: unknown): value is DraftStatus {
  return typeof value === 'string' && (DRAFT_STATUSES as readonly string[]).includes(value)
}

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  guard_passed: 'Redo för beslut',
  drafted: 'Väntar på Guard',
  needs_input: 'Behöver underlag',
  guard_failed: 'Underkänt av Guard',
  returned: 'Tillbakaskickat',
  rejected: 'Avvisat',
  approved: 'Godkänt',
}

/** What each status means — one sentence each, from the code that writes it. */
export const DRAFT_STATUS_NOTES: Record<DraftStatus, string> = {
  guard_passed: 'Guard har bedömt utkastet och inget operatörsbeslut är fattat.',
  drafted: 'Utkastet väntar på en Guard-bedömning — nytt från Drafter eller redigerat.',
  needs_input: 'Planens tema är inte fastställt, så Drafter skrev ingen copy.',
  guard_failed: 'Guard underkände utkastet.',
  returned: 'Skickat tillbaka till Drafter. Ingen ny version finns ännu.',
  rejected: 'Avvisat av en operatör.',
  approved: 'Godkänt av en operatör. Ingenting publiceras härifrån.',
}

export const UNKNOWN_STATUS_LABEL = 'Okänd status'
export const UNKNOWN_LABEL = 'Okänt'
export const UNREADABLE_LABEL = 'Kunde inte läsas'
export const NOT_RECORDED_LABEL = 'Ej registrerat'

export function draftStatusLabel(status: string): string {
  return isDraftStatus(status) ? DRAFT_STATUS_LABELS[status] : UNKNOWN_STATUS_LABEL
}

export type ReviewTone = 'attention' | 'failure' | 'settled' | 'neutral'

/** Tone is colour only; the label always carries the state. */
export function draftStatusTone(status: string): ReviewTone {
  switch (status) {
    case 'guard_passed':
    case 'needs_input':
      return 'attention'
    case 'guard_failed':
      return 'failure'
    case 'returned':
    case 'rejected':
    case 'approved':
      return 'settled'
    default:
      return 'neutral'
  }
}

/** An operator has already acted on a draft in one of these. Its controls stay; none leads. */
export const SETTLED_STATUSES: readonly DraftStatus[] = ['returned', 'rejected', 'approved']

/** No operator decision is recorded on a draft in one of these. */
export const UNDECIDED_STATUSES: readonly DraftStatus[] = ['guard_passed', 'drafted', 'needs_input', 'guard_failed']

/** The Guard's stored verdict, in words. The card prints it beside the label "Guard". */
export const GUARD_VERDICT_LABELS: Record<string, string> = {
  approved: 'godkänt',
  warning: 'varning',
  rejected: 'underkänt',
}

/** The replaced page's own severity words. */
export const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Allvarligt',
  HIGH: 'Viktigt',
  MEDIUM: 'Mindre',
  LOW: 'Info',
}

/** `asset_plan[].status` as the Drafter writes it. */
export const ASSET_STATUS_LABELS: Record<string, string> = {
  available: 'Tillgänglig',
  pending_upload: 'Väntar på uppladdning',
  LUCKA: 'Lucka',
}

/** `campaign_plans.status` — shown in diagnostics only, as the UX revision asked. */
export const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  approved: 'Godkänd',
  archived: 'Arkiverad',
  superseded: 'Ersatt',
}

/** Bounds on the read outside the window. Reaching one is reported, never hidden. */
export const OUTSIDE_LIMITS = { plans: 60, briefs: 1000, drafts: 3000 } as const

const MONTH_YEAR = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** `fs-2026-09` → "September 2026". A key of any other shape is shown as stored. */
export function planKeyLabel(planKey: string): string {
  const match = /^fs-(\d{4})-(\d{2})$/.exec(planKey)
  if (!match) return planKey
  const month = Number(match[2])
  if (month < 1 || month > 12) return planKey
  const label = MONTH_YEAR.format(new Date(Date.UTC(Number(match[1]), month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────────────────────

export type DraftAction = 'approve' | 'edit' | 'return'

/** The one route decisions go to. */
export const DECISION_ENDPOINT = '/api/marketing/approvals'

export const DRAFT_ACTION_NOTES: Record<DraftAction, string> = {
  approve: 'Markerar utkastet som godkänt. Ingenting publiceras.',
  edit: 'Sparar caption och landningssida och begär en ny Guard-bedömning.',
  return:
    'Markerar utkastet som tillbakaskickat och begär en ny Drafter-körning för samma brief. Den skriver en ny version med en språkmodell.',
}

export interface DraftActionEntry {
  action: DraftAction
  label: string
}

export interface DraftActionPlan {
  primary: DraftActionEntry | null
  secondary: DraftActionEntry[]
}

export interface DraftActionInput {
  status: string
  critical: boolean
  /** A blocking gap the Guard flagged — the replaced page called fixing it "Åtgärda". */
  fixable: boolean
  canApprove: boolean
}

/**
 * The controls a card offers. The set and the primary are the replaced page's
 * own rule, unchanged: approve only where `can_approve` holds, edit and return
 * always; the primary is return for a critical draft, edit ("Åtgärda") for a
 * fixable one, approve for an approvable one and return otherwise. The one
 * change is emphasis: a draft an operator has already acted on keeps every
 * control, but none of them is presented as the next step.
 */
export function draftActionPlan(input: DraftActionInput): DraftActionPlan {
  const lead: DraftAction = input.critical
    ? 'return'
    : input.fixable
      ? 'edit'
      : input.canApprove
        ? 'approve'
        : 'return'
  const fixing = lead === 'edit'
  const label = (action: DraftAction): string =>
    action === 'approve'
      ? fixing ? 'Godkänn ändå' : 'Godkänn'
      : action === 'edit'
        ? fixing ? 'Åtgärda' : 'Redigera'
        : 'Skicka tillbaka'

  const available: DraftAction[] = input.canApprove ? ['edit', 'return', 'approve'] : ['edit', 'return']
  const settled = (SETTLED_STATUSES as readonly string[]).includes(input.status)
  const primary = settled ? null : { action: lead, label: label(lead) }
  const secondary = available
    .filter((action) => primary === null || action !== primary.action)
    .map((action) => ({ action, label: label(action) }))
  return { primary, secondary }
}

export interface EditValues {
  caption: string
  landingUrl: string
}

/** The body the replaced page sent for each action — nothing added, nothing renamed. */
export function decisionBody(draftId: string, action: DraftAction, edit?: EditValues): Record<string, string> {
  if (action === 'edit') {
    return {
      draft_id: draftId,
      action,
      caption_rendered: edit?.caption ?? '',
      landing_url: edit?.landingUrl ?? '',
    }
  }
  return { draft_id: draftId, action }
}

export type DecisionOutcomeKind = 'done' | 'refused' | 'error'

export interface DecisionOutcome {
  kind: DecisionOutcomeKind
  message: string
}

export const DONE_MESSAGES: Record<DraftAction, string> = {
  approve: 'Godkänt. Ingenting publicerades.',
  edit: 'Ändringen är sparad. Utkastet väntar på en ny Guard-bedömning.',
  return: 'Skickat tillbaka. En ny Drafter-körning är begärd.',
}

export const SEND_FAILED_MESSAGE = 'Beslutet gick inte att skicka. Läs in sidan igen för att se utkastets status.'

/**
 * What the operator is told once the route answered. Only a 2xx is success.
 * A 409 is the route refusing the decision — shown as a refusal in the route's
 * own words, never as success and never as a generic failure.
 */
export function decisionOutcome(action: DraftAction, httpStatus: number, payload: unknown): DecisionOutcome {
  if (httpStatus >= 200 && httpStatus < 300) return { kind: 'done', message: DONE_MESSAGES[action] }
  const said =
    payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error.trim() || null
      : null
  if (httpStatus === 409) return { kind: 'refused', message: said ?? 'Beslutet vägrades.' }
  if (httpStatus === 401) return { kind: 'error', message: 'Sessionen är inte längre giltig. Logga in igen.' }
  return { kind: 'error', message: said ?? 'Beslutet gick inte igenom.' }
}

/** The CTA types whose post needs a landing page — the replaced page's own rule. */
export function needsLandingUrl(ctaType: string | null): boolean {
  return ctaType === 'trial' || ctaType === 'subscribe'
}

/** A stored `<placeholder>` slot is not an address; the edit field starts empty for it. */
export function landingUrlDraft(slot: string | null): string {
  return slot && !/^<.*>$/.test(slot) ? slot : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────────────────

export const WINDOW_NOTE =
  'Granskningsfönstret är innevarande och nästa kalendermånad räknat i UTC — samma regel som granskningen alltid haft. Planer utanför fönstret räknas här men beslutas inte här.'

export const STATUS_NOTE =
  'Status är utkastets egen kolumn och varje lagrat värde har en egen rad. Bara den senaste versionen per brief visas.'

export const GUARD_NOTE =
  'Guard är en regelmotor. Poäng och utlåtande visas som de lagrades, och ett redigerat utkast behåller sin tidigare rapport tills Guard har bedömt det igen.'

export const DECISION_NOTE =
  'Besluten går genom samma beslutsväg som tidigare. Ingenting publiceras, schemaläggs eller skickas till Meta härifrån.'

export const OUTSIDE_NOTE =
  'Räknat på den senaste versionen per brief. Utkasten ligger utanför granskningsfönstret och beslutas inte här.'
