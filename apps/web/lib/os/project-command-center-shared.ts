/**
 * Project Command Center — the client-safe half of the contract.
 *
 * Labels only. `lib/os/project-command-center.ts` is `server-only` because it
 * reaches the database; anything a component needs at runtime lives here so no
 * component ever has to import the loader for a constant (the failure mode
 * Agent Detail hit and fixed in `agent-detail-shared.ts`).
 *
 * WHAT MUST NEVER MOVE HERE: database access, the loader, project scoping.
 *
 * Every word below is either the repository's existing vocabulary, reused
 * verbatim, or a plain statement of absence. None of it is a status Omnira does
 * not store.
 */

/** Whether a section's source could be read. `error` is never rendered as empty. */
export type SectionState = 'ok' | 'error'

/**
 * `wakeState()` answers, in the words `/planning` already uses for the same
 * three values. Kept identical on purpose: the same instance must not read
 * differently on two surfaces.
 */
export const WAKE_LABELS = {
  due: 'Förfallen',
  sleeping: 'Väntar',
  not_scheduled: 'Ej schemalagd',
} as const

/** `approvals.status = 'pending'`, in the approvals queue's own words (ApprovalCard). */
export const PENDING_APPROVAL_LABEL = 'Väntar på granskning'

/** `workflows.active`, in `/planning`'s words for the same column. */
export const WORKFLOW_ACTIVE_LABELS = { true: 'Aktiv', false: 'Pausad' } as const

/** The one answer for a source that could not be read. Distinct from every empty state. */
export const UNREADABLE_LABEL = 'Kunde inte läsas'

/** The one answer for a value that is not known. Never "idle", never zero. */
export const UNKNOWN_LABEL = 'Okänt'
