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
