/**
 * Aktivitet — the client-safe half of the contract.
 *
 * Vocabulary and labels only. `lib/os/activity.ts` is `server-only` because it
 * reaches the database, so anything a component needs at runtime lives here.
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, project scoping.
 *
 * THE PROVENANCE VOCABULARY IS THE POINT. This surface answers "what has the
 * system been doing", and the honest answer is narrower than the page it
 * replaces implied. Three facts fix the boundary, and each was measured rather
 * than assumed:
 *
 *   1. A run records no agent. `runs` has no agent column and `run_logs` has
 *      none either; the only agent ids in the schema sit in `workflows.steps`,
 *      which is the CURRENT definition, not the one that ran. `runs` carries
 *      `steps_snapshot` for exactly that purpose — and in production it is
 *      populated on 4 of 1427 runs and empty (`[]`) in all four. So agent
 *      attribution is available for no run at all, and this surface says so
 *      instead of borrowing today's definition to label yesterday's work.
 *   2. Step detail is sparse. 56 of 1427 runs have any `run_logs` row, so
 *      "what happened" is usually not recorded. Absent detail is absent, never
 *      a summary invented from the status.
 *   3. A status is whatever the runtime stored. Unrecognised values are shown
 *      verbatim beside "Okänt tillstånd" rather than folded into a known one.
 *
 * The review half reuses `review-queue-shared` rather than restating it; two
 * vocabularies for one table is how they drift.
 */

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/** What an entry is. Both are stored rows — the stream synthesises nothing. */
export type ActivityKind = 'run' | 'review'

/**
 * The run statuses Omnira actually stores. `cancelled` is here and absent from
 * the nav registry's declared filter set: the registry describes what an
 * operator may ask for, this describes what the runtime writes, and production
 * holds a cancelled run. Anything not listed renders verbatim — see
 * `runStateLabel`.
 */
export const RUN_STATE_LABELS: Record<string, string> = {
  running: 'Kör',
  queued: 'Köad',
  done: 'Klar',
  failed: 'Misslyckades',
  cancelled: 'Avbruten',
  stalled: 'Fastnad',
  awaiting_approval: 'Inväntar granskning',
}

/** A status Omnira did not store under any known name. Shown beside the raw value. */
export const UNKNOWN_RUN_STATE_LABEL = 'Okänt tillstånd'

export function runStateLabel(status: string | null | undefined): string {
  const value = (status ?? '').trim()
  return RUN_STATE_LABELS[value] ?? UNKNOWN_RUN_STATE_LABEL
}

/** Tone carries emphasis only; every state is also a word. */
export type ActivityTone = 'attention' | 'active' | 'settled' | 'neutral'

export function runStateTone(status: string | null | undefined): ActivityTone {
  const value = (status ?? '').trim()
  if (value === 'failed' || value === 'stalled') return 'attention'
  if (value === 'running') return 'active'
  if (value === 'done') return 'settled'
  return 'neutral'
}

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

/** The one answer for a value that is not known. Never "idle", never zero. */
export const UNKNOWN_LABEL = 'Okänt'

/**
 * Which column an entry's timestamp came from. A feed ordered by time owes the
 * reader the column it ordered by, because these do not mean the same thing.
 */
export type TimeSource = 'finished_at' | 'started_at' | 'created_at' | 'reviewed_at'

export const TIME_SOURCE_LABELS: Record<TimeSource, string> = {
  finished_at: 'avslutad',
  started_at: 'startad',
  created_at: 'skapad',
  reviewed_at: 'granskad',
}

/**
 * The agent line. This is the sentence the surface exists to get right: the
 * page it replaces is called the Agent Activity Center and never once names an
 * agent, because nothing in a run records one.
 */
export const AGENT_ATTRIBUTION_NOTE =
  'Omnira registrerar inte vilken agent som utförde en körning. Arbetsflöde, projekt och körning är registrerade; agent är det inte, och härleds därför inte från dagens arbetsflödesdefinition.'

/** Why most entries carry no step detail. */
export const STEP_DETAIL_NOTE =
  'Stegdetaljer finns bara för körningar som skrev loggrader. Saknas de visas ingenting — de rekonstrueras inte ur status.'

/** What this surface does not observe, stated rather than left as silence. */
export const NOT_OBSERVED_NOTE =
  'Minne, Dream och schemalagda jobb observeras inte här. Systemhälsa är ytan för dem.'

/** Bounded reads. A feed that grows without limit stops being one. */
export const ACTIVITY_LIMITS = {
  runs: 60,
  reviews: 30,
  logs: 200,
} as const

/** The empty state is a fact about the scope, never a fact about the platform. */
export const EMPTY_STREAM_TITLE = 'Ingen registrerad aktivitet'
export const EMPTY_STREAM_BODY =
  'Inga körningar eller granskningar finns i de projekt den här sessionen äger. Det är ett svar om räckvidden, inte om plattformen.'
