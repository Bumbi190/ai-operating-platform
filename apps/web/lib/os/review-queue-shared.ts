/**
 * Granskningar — the client-safe half of the contract.
 *
 * Labels and the pure status vocabulary only. `lib/os/review-queue.ts` is
 * `server-only` because it reaches the database, so anything the queue
 * component needs at runtime lives here (the failure mode Agent Detail hit and
 * fixed in `agent-detail-shared.ts`).
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, owner scoping.
 *
 * Every word below is either the repository's existing vocabulary reused
 * verbatim, or a plain statement of absence. `approvals.status` has six stored
 * values and this file knows exactly those six — a seventh stays UNKNOWN rather
 * than being read as one of them.
 */

/** Whether a read succeeded. `error` is never rendered as an empty queue. */
export type QueueState = 'ok' | 'error'

/**
 * What the operator may still decide, taken from `resolve_approval`: the RPC
 * acts only on these three and answers ALREADY_RESOLVED for anything else.
 */
export const ACTIONABLE_STATUSES = ['pending', 'revised', 'needs_input'] as const

/** Decided, by the operator or by the runtime. The queue shows them as archive. */
export const TERMINAL_STATUSES = ['approved', 'rejected', 'returned'] as const

export type ReviewStatusClass = 'actionable' | 'terminal' | 'unknown'

/**
 * Classify a stored status. An unrecognised value is UNKNOWN — never quietly
 * folded into pending, and never offered a decision.
 */
export function classifyStatus(status: string | null | undefined): ReviewStatusClass {
  const value = (status ?? '').trim()
  if ((ACTIONABLE_STATUSES as readonly string[]).includes(value)) return 'actionable'
  if ((TERMINAL_STATUSES as readonly string[]).includes(value)) return 'terminal'
  return 'unknown'
}

/** The six stored statuses in the words the approvals queue already uses. */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Väntar på granskning',
  revised: 'Revidering begärd',
  needs_input: 'Behöver underlag',
  approved: 'Godkänd',
  rejected: 'Avvisad',
  returned: 'Återlämnad',
}

/** A status Omnira did not store under any known name. Shown verbatim beside it. */
export const UNKNOWN_STATUS_LABEL = 'Okänd status'

export function statusLabel(status: string | null | undefined): string {
  const value = (status ?? '').trim()
  return STATUS_LABELS[value] ?? UNKNOWN_STATUS_LABEL
}

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

/** The one answer for a value that is not known. Never "idle", never zero. */
export const UNKNOWN_LABEL = 'Okänt'

/** Why an item carries no decision controls. Each is a runtime fact, not a guess. */
export const BLOCKED_REASONS = {
  terminal: 'Redan avgjord — beslutet står',
  unknown: 'Okänd status — ingen åtgärd erbjuds',
  no_run: 'Saknar körning och kan inte avgöras här',
} as const

export type BlockedReason = keyof typeof BLOCKED_REASONS

/** The three decisions `PATCH /api/approvals/[id]` accepts. Nothing else exists. */
export const DECISIONS = [
  { action: 'approved', label: 'Godkänn' },
  { action: 'revised',  label: 'Revidera' },
  { action: 'rejected', label: 'Avvisa' },
] as const

export type ReviewDecision = (typeof DECISIONS)[number]['action']

/**
 * What `revised` means, stated where the operator decides: the RPC writes the
 * approval and deliberately leaves the run `awaiting_approval`.
 */
export const REVISION_NOTE = 'Revidering begär en ny omgång — körningen fortsätter att invänta granskning.'
