/**
 * Content Center — the client-safe half of the contract.
 *
 * Vocabulary and labels only. `lib/os/content-center.ts` is `server-only`
 * because it reaches the database, so anything a component needs at runtime
 * lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, project scoping.
 *
 * THE EDITORIAL TRUTH MODEL. Each rule was re-derived from canonical code and
 * read-only production data, not assumed:
 *
 *   STATUS IS ATLAS'S OWN COLUMN. `website_content.status` is CHECK-constrained
 *   to six values. The page this replaces grouped four of them, so a `failed`
 *   row — which the review route writes when a publish errors — and a
 *   `scheduled` row simply never appeared. Every stored status gets a lane
 *   here, and a value outside the six is shown raw rather than dropped.
 *
 *   PUBLISH FIELDS CAN CONTRADICT STATUS. `saveGeneratedArticle` upserts on
 *   `external_id` and resets `status` to `pending_review` without touching
 *   `destination_url`, `published_at` or `publish_operation`, so regenerating an
 *   already-published article leaves a pending row carrying a publish record.
 *   Production holds one such row, and one `rejected` row carrying the same.
 *   Atlas cannot observe the website, so the surface reports both stored facts
 *   and does not decide which is true.
 *
 *   QA IS THE GENERATOR'S SELF-ASSESSMENT. `qa` is written at generation time by
 *   the pipeline; it is not a human review. Production holds a published
 *   article whose QA failed.
 *
 *   COST IS AN ESTIMATE. `cost_usd` is `meta.estCostUsd`, denormalised when the
 *   row was saved. It is dollars, it is not an invoice, and it is not reconciled
 *   against the cost ledger.
 */

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/** The six values `website_content.status` may hold, in the order an editor works them. */
export const CONTENT_STATUSES = [
  'pending_review',
  'failed',
  'scheduled',
  'approved',
  'published',
  'rejected',
] as const

export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  pending_review: 'Väntar på granskning',
  failed: 'Publicering misslyckades',
  scheduled: 'Schemalagd',
  approved: 'Godkänd',
  published: 'Publicerad',
  rejected: 'Avvisad',
}

/** A status Omnira did not store under any known name. Shown beside the raw value. */
export const UNKNOWN_STATUS_LABEL = 'Okänd status'

export function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === 'string' && (CONTENT_STATUSES as readonly string[]).includes(value)
}

export function contentStatusLabel(status: string | null | undefined): string {
  return isContentStatus(status) ? CONTENT_STATUS_LABELS[status] : UNKNOWN_STATUS_LABEL
}

/** Tone carries emphasis only; every state is also a word. */
export type ContentTone = 'attention' | 'failure' | 'settled' | 'neutral'

export function contentStatusTone(status: string | null | undefined): ContentTone {
  if (status === 'pending_review') return 'attention'
  if (status === 'failed') return 'failure'
  if (status === 'published') return 'settled'
  return 'neutral'
}

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  article: 'Artikel',
  news: 'Nyhet',
  blog: 'Blogg',
  guide: 'Guide',
  evergreen: 'Evergreen',
}

/** The generator's own verdict. `absent` is not a pass. */
export type QaVerdict = 'pass' | 'fail' | 'absent'

export const QA_VERDICT_LABELS: Record<QaVerdict, string> = {
  pass: 'Godkänd',
  fail: 'Underkänd',
  absent: 'Saknas',
}

/** `lib/article/types.ts`: Confidence = 'high' | 'medium' | 'low'. */
export const QA_CONFIDENCE_LABELS: Record<string, string> = {
  high: 'hög',
  medium: 'medel',
  low: 'låg',
}

/** `website_content_hero_image_status_check`: NULL or one of these five. */
export const HERO_IMAGE_STATUS_LABELS: Record<string, string> = {
  pending: 'Väntar på generering',
  generating: 'Genereras',
  ready: 'Klar',
  failed: 'Misslyckades',
  rejected_qa: 'Underkänd av bild-QA',
}

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

/** The one answer for a value that is not known. */
export const UNKNOWN_LABEL = 'Okänt'

/** The one answer for a value that was never recorded. Distinct from zero. */
export const NOT_RECORDED_LABEL = 'Ej registrerat'

export const STATUS_NOTE =
  'Status är Atlas egen kolumn och är den som gäller här. Atlas kan inte se webbplatsen: en bokförd publiceringsadress betyder att en publicering har registrerats, inte att sidan är live just nu.'

export const DISAGREEMENT_NOTE =
  'Publiceringsuppgifter finns bokförda på en artikel vars status inte är Publicerad. Det händer bland annat när en redan publicerad artikel genereras om: status återställs medan adress och publiceringstid ligger kvar. Atlas avgör inte vilket fält som stämmer.'

export const QA_NOTE =
  'QA-resultatet är generatorns egen bedömning när artikeln skapades — inte en mänsklig granskning.'

export const COST_NOTE =
  'Kostnaden är en uppskattning i dollar som sparades när artikeln genererades. Den är inte leverantörens fakturerade belopp och stäms inte av mot kostnadsloggen.'

export const GENERATION_NOTE =
  'Generering använder den befintliga artikelpipelinen och skriver till The Prompts projekt. Resultatet landar alltid i Väntar på granskning — ingen automatisk publicering.'

export const REVIEW_NOTE =
  'Godkänna och publicera, avvisa eller skapa hjältebild görs på artikelns egen sida, där hela texten och QA-rapporten syns.'

export const NEWS_UNREADABLE_NOTE =
  'Nyhetskällan kunde inte läsas, så generering erbjuds inte härifrån just nu.'

/** Bounded reads, the same caps the replaced page used. */
export const CONTENT_LIMITS = {
  rows: 200,
  news: 30,
  visibleRefs: 12,
  summary: 240,
  reason: 240,
} as const
