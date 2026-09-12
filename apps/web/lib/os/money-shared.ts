/**
 * Pengar — the client-safe half of the contract.
 *
 * Vocabulary and labels only. `lib/os/money.ts` is `server-only` because it
 * reaches the ledger and the budget gate, so anything a component needs at
 * runtime lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, project scoping, the
 * enforcement flag read.
 *
 * THE FINANCIAL TRUTH MODEL. Every figure this surface shows has one of a small
 * number of provenances, and the surface says which. Each rule below was
 * re-derived from canonical code and read-only production data, not assumed:
 *
 *   COST IS AN ESTIMATE. `cost_events` is the ledger, written by
 *   `lib/cost/track.ts` at call time: tokens, characters or images multiplied by
 *   Omnira's OWN price table, then `cost_usd × cost_rates.usd_sek` for kronor.
 *   No provider invoice is read anywhere. So the honest name is "beräknad
 *   kostnad", never "faktisk kostnad".
 *
 *   A MODEL MISSING FROM THE PRICE TABLE IS PRICED BY FALLBACK. `getModelPricing`
 *   answers an unknown model with Sonnet rates and provider `anthropic`. Ten
 *   production rows are `gpt-4o-mini-tts` recorded that way — an OpenAI call
 *   booked under Anthropic. Such rows are flagged, not silently trusted.
 *
 *   REVENUE IS NOT RECORDED. `revenue_events` has writers (the business API and
 *   a Stripe webhook) and zero rows. Zero rows is "ej registrerat", not "0 kr".
 *
 *   PROFIT IS NOT CALCULATED. It needs revenue. The page this replaces printed a
 *   net figure and a per-project ROI from an empty revenue table and a hard-coded
 *   10.5 SEK/USD; neither exists here.
 *
 *   BUDGET FIGURES ARE THE GATE'S OWN. Limit, spent, held and remaining come from
 *   `budget_headroom`, the same function the gate decides on — Stockholm-local
 *   windows, gross ledger spend plus open reservations. Nothing on this surface
 *   recomputes them, so it cannot disagree with the gate. The replaced page
 *   compared spend against a hard-coded `MONTHLY_AI_BUDGET_USD = 100`.
 *
 *   ENFORCEMENT IS ADVISORY. `H1_SPEND_GATE` is not declared in production, so a
 *   refusal is recorded and overridden. This is stated wherever a limit appears,
 *   because a limit shown without it reads as protection that does not exist.
 */

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/** The one answer for a value that was never recorded. Distinct from zero. */
export const NOT_RECORDED_LABEL = 'Ej registrerat'

/** The one answer for a figure this surface refuses to derive. */
export const NOT_CALCULATED_LABEL = 'Beräknas inte'

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

/** The one answer for a value that is not known. Never zero. */
export const UNKNOWN_LABEL = 'Okänt'

/** The scopes the gate evaluates FOR A PROJECT. Global scopes are deliberately absent. */
export type ProjectBudgetScope = 'project_daily' | 'project_weekly' | 'project_monthly'

export const PROJECT_BUDGET_SCOPES: readonly ProjectBudgetScope[] = [
  'project_daily',
  'project_weekly',
  'project_monthly',
]

export const BUDGET_SCOPE_LABELS: Record<ProjectBudgetScope, string> = {
  project_daily: 'Dag',
  project_weekly: 'Vecka',
  project_monthly: 'Månad',
}

export function isProjectBudgetScope(value: unknown): value is ProjectBudgetScope {
  return typeof value === 'string' && (PROJECT_BUDGET_SCOPES as readonly string[]).includes(value)
}

/** What the spend gate does with a refusal. Read from the runtime, never assumed. */
export type EnforcementState = 'advisory' | 'enforced'

export const ENFORCEMENT_LABELS: Record<EnforcementState, string> = {
  advisory: 'Rådgivande',
  enforced: 'Verkställs',
}

export const ADVISORY_NOTE =
  'Budgetgränserna verkställs inte. Grinden räknar ut vad den skulle ha svarat och bokför det, men ett anrop som överskrider en gräns genomförs ändå.'

export const ENFORCED_NOTE =
  'Budgetgränserna verkställs: ett anrop som skulle överskrida en gräns nekas innan det görs.'

export const COST_ESTIMATE_NOTE =
  'Kostnaden är Omnira:s egen beräkning vid anropet — tokens, tecken eller bilder gånger Omnira:s prislista, omräknat till kronor med den kurs som gällde då. Det är inte leverantörens fakturerade belopp.'

export const PRICING_FALLBACK_NOTE =
  'En modell som saknas i Omnira:s prislista prissätts med en reservtaxa och bokförs under Anthropic. Sådana rader är markerade; deras leverantör och belopp är inte säkra.'

export const LEDGER_COMPLETENESS_NOTE =
  'Ett anrop vars kostnad inte kunde bokföras lämnar ingen rad efter sig. Registrerad kostnad kan därför vara ofullständig.'

export const REVENUE_NOTE =
  'Inga intäktshändelser är registrerade i de projekt den här sessionen äger. Det är ett svar om registreringen, inte ett belopp.'

export const PROFIT_NOTE =
  'Resultat, marginal och avkastning beräknas inte. De kräver registrerade intäkter, och sådana saknas.'

/** When revenue events DO exist: still no profit, for a different reason. */
export const PROFIT_UNRECONCILED_NOTE =
  'Resultat beräknas inte. Kostnaden är en uppskattning, och intäktsbeloppen visas inte på den här ytan.'

/** Revenue events exist, but their amounts are not read here. */
export const REVENUE_RECORDED_NOTE =
  'Intäktshändelser finns registrerade. Belopp visas inte på den här ytan.'

export const GLOBAL_SCOPE_NOTE =
  'Grinden prövar också plattformsgemensamma gränser. De omfattar alla projekt och visas därför inte här.'

/** `no_global_budget_configured`: the gate refuses every project without all three. */
export const GLOBAL_CEILING_MISSING_NOTE =
  'En eller flera plattformsgemensamma gränser saknas. Grinden nekar då varje anrop i alla projekt; i rådgivande läge genomförs de ändå.'

export const GLOBAL_CEILING_UNKNOWN_NOTE =
  'Om de plattformsgemensamma gränserna är konfigurerade kunde inte avgöras härifrån.'

/**
 * The gate's predicate, verbatim: `budget_reserve` refuses `no_budget_configured`
 * unless a `project_budgets` row has `monthly_sek is not null`. Daily and weekly
 * limits alone do not count.
 */
export const UNBUDGETED_NOTE =
  'Grinden nekar ett projekt som saknar månadsbudget — en saknad gräns är inte obegränsad. I rådgivande läge genomförs anropen ändå.'

export const PLATFORM_COST_NOTE =
  'Kostnad som inte hör till något projekt är plattformsgemensam och visas inte på den här ytan.'

export const NO_AUTHORITY_NOTE =
  'Budgetar och gränser ändras inte härifrån. Ytan läser bara.'

/**
 * Leads are CRM rows, not money, until a value is recorded. Every production
 * lead has `value_sek` null — and the replaced page selected columns that do not
 * exist, so its pipeline silently rendered "Inga leads ännu" beside three leads.
 */
export const LEADS_NOTE =
  'Leads utan registrerat värde räknas inte som pengar.'

/** The calendar the ledger breakdown shares with the gate. */
export const LEDGER_WINDOW_LABEL = 'Kalendermånad, Europe/Stockholm'

/** Bounded reads. A total over a truncated read is labelled as such. */
export const MONEY_LIMITS = {
  costRows: 2000,
  recentRows: 25,
  overrides: 20,
} as const
