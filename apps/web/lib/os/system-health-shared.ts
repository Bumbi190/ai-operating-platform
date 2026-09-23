/**
 * Systemhälsa — the client-safe half of the contract.
 *
 * Vocabulary and labels only. `lib/os/system-health.ts` is `server-only`
 * because it reaches the database and the runtime's safety flags, so anything a
 * component needs at runtime lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, the safety-flag
 * derivation, project scoping.
 *
 * THE STATE VOCABULARY IS THE POINT. The page this replaces printed a single
 * number — `100 - failRate * 2` — as "Optimal / Degraded / Critical", so a
 * platform with no runs at all reported 100/Optimal. There is no such column.
 * Each component below states what the runtime actually says about it, and a
 * component whose source could not be read, or whose liveness Omnira does not
 * observe, says exactly that instead of being counted as well.
 */

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/**
 * What a component is doing, in the only terms the runtime supports.
 * Deliberately no "healthy": nothing stores it, and silence is not health.
 */
export type ComponentState =
  | 'stopped'      // an execution stop is active — stored, not inferred
  | 'attention'    // a stored condition an operator should look at
  | 'active'       // work is running right now
  | 'idle'         // the source was read and reports nothing outstanding
  | 'unavailable'  // the source could not be read
  | 'unknown'      // Omnira does not observe this from here

export const COMPONENT_STATE_LABELS: Record<ComponentState, string> = {
  stopped: 'Stoppad',
  attention: 'Kräver uppmärksamhet',
  active: 'Kör',
  idle: 'Inget utestående',
  unavailable: 'Kunde inte läsas',
  unknown: 'Observeras inte här',
}

export type ComponentId =
  | 'execution' | 'safety' | 'projects' | 'runs' | 'approvals'
  | 'automation' | 'dream' | 'memory'

export const COMPONENT_LABELS: Record<ComponentId, string> = {
  execution: 'Exekvering',
  safety: 'Säkerhetsflaggor',
  projects: 'Projektstopp',
  runs: 'Körningar',
  approvals: 'Granskningar',
  automation: 'Automatisering',
  dream: 'Dream',
  memory: 'Minne',
}

/** Warning tone. Colour follows the tone; the word carries the meaning. */
export type WarningTone = 'stop' | 'attention' | 'unreadable'

/** The one answer for a value that is not known. Never "idle", never zero. */
export const UNKNOWN_LABEL = 'Okänt'

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

/**
 * Stated on the automation panel. pg_cron's schedule lives in the database's
 * `cron` schema, which this app cannot read, so a configured trigger proves
 * configuration and nothing else.
 */
export const AUTOMATION_LIVENESS_NOTE =
  'Omnira läser schemats konfiguration, inte dess körningar: en konfigurerad trigger bevisar inte att den kördes.'

/**
 * Stated on the memory panel. `atlas.memory_events` is wrapper-only (never
 * PostgREST-exposed), and the memory flags are internal, so this surface can
 * show the legacy store and nothing more.
 */
export const MEMORY_OBSERVABILITY_NOTE =
  'M4-händelser läses inte från den här ytan — endast det äldre minnesregistret är synligt här.'

/** The severities `dream_issues.severity` is normalised to on read. */
export const DREAM_SEVERITY_LABELS: Record<string, string> = {
  critical: 'Kritisk',
  warning: 'Varning',
  info: 'Info',
}

// ── Atlas Survival (Phase 1b — display only) ─────────────────────────────────
//
// Labels for vocabulary that already exists in `lib/atlas/survival`. NOTHING
// here computes a survival state, a ceiling, a threshold or an amount: the
// loader calls the authoritative reader once and hands the result down, and this
// file only names what it receives. Importing these types is type-only, so no
// server module is pulled into a client bundle.

import type {
  FundingState,
  SurvivalGap,
  SurvivalReason,
  SurvivalState,
} from '@/lib/atlas/survival/types'

/**
 * The five survival states, in Swedish. These name the state; they never
 * describe a health judgement — the same rule as `COMPONENT_STATE_LABELS`.
 */
export const SURVIVAL_STATE_LABELS: Record<SurvivalState, string> = {
  EXPAND: 'Expandera',
  NORMAL: 'Normalt',
  CONSERVE: 'Sparläge',
  CRITICAL: 'Kritiskt läge',
  HIBERNATE: 'Viloläge',
}

/**
 * The three funding situations. UNDECLARED is deliberately NOT worded as a
 * problem: the owner simply has not supplied a figure, which is a stable fact
 * and not a failure. UNAVAILABLE is worded as a read failure, because it is one.
 */
export const FUNDING_STATE_LABELS: Record<FundingState, string> = {
  KNOWN: 'Deklarerat',
  UNDECLARED: 'Ej deklarerat',
  UNAVAILABLE: 'Otillgängligt',
}

/**
 * The six budget scopes, in Swedish. Mirrors `BudgetScope` in `lib/cost`; a
 * label map only, and the component falls back to the raw token for anything
 * unlisted — the same shape as `DREAM_SEVERITY_LABELS`.
 */
export const SURVIVAL_SCOPE_LABELS: Record<string, string> = {
  global_daily: 'Globalt dygn',
  global_weekly: 'Global vecka',
  global_monthly: 'Global månad',
  project_daily: 'Projektets dygn',
  project_weekly: 'Projektets vecka',
  project_monthly: 'Projektets månad',
}

/** Why the state was derived. */
export const SURVIVAL_REASON_LABELS: Record<SurvivalReason, string> = {
  headroom_exhausted: 'Budgetutrymmet är slut',
  headroom_critical: 'Kritiskt lågt budgetutrymme',
  headroom_conserve: 'Lågt budgetutrymme',
  headroom_healthy: 'Gott budgetutrymme',
  no_budget_configured: 'Ingen budget konfigurerad',
  funding_undeclared: 'Ingen finansiering deklarerad',
  funding_unavailable: 'Finansieringskällan kunde inte läsas',
  funding_depleted: 'Deklarerat kapital är slut',
  runway_short: 'Kort räckvidd',
  reads_unavailable: 'Läsning misslyckades',
}

/** What could not be established. A gap is never a reassurance. */
export const SURVIVAL_GAP_LABELS: Record<SurvivalGap, string> = {
  funding_undeclared: 'Ingen finansiering deklarerad',
  funding_unavailable: 'Finansieringskällan kunde inte läsas',
  runway_unknown: 'Räckvidd kan inte beräknas',
  reads_incomplete: 'Ofullständig läsning',
  infrastructure_cost_untracked: 'Infrastrukturkostnad ingår inte',
}

/**
 * Stated where the revenue trend is shown. MRR is a performance signal and is
 * never cash, never runway and never spendable — the same distinction the
 * backend enforces, restated where an operator reads the number.
 */
export const SURVIVAL_REVENUE_SIGNAL_NOTE =
  'Intäktstrenden är en prestationssignal. Den är inte tillgängliga medel och räknas aldrig som räckvidd.'

/** Stated under the ceiling. The level itself always arrives fully qualified. */
export const SURVIVAL_CEILING_NOTE =
  'Taket begränsar vad ett redan beviljat mandat får göra. Det beviljar ingenting.'

