/**
 * Canonical scope vocabulary for project API credentials.
 *
 * A scope names ONE permitted action. It is compared by exact string equality
 * and nothing else — there is no hierarchy, no prefix semantics and no wildcard
 * in V1. `business.leads.create` does not imply `business.leads`, is not implied
 * by it, and `*` means nothing at all.
 *
 * That is a deliberate restriction rather than an unfinished feature. Prefix
 * matching is how a scope system quietly becomes an escalation path: once
 * `business.leads` grants `business.leads.delete`, every future action added
 * under an existing prefix is granted retroactively to credentials issued
 * before that action existed. Adding a wildcard later is a one-line change made
 * with intent; removing one after credentials depend on it is a breaking
 * migration.
 *
 * The DATABASE gives none of these strings meaning. `scopes text[]` will store
 * any text, including a string not listed here. `requireProjectApiScope` is the
 * only enforcement boundary, and it grants exactly what it is asked to check.
 * An unrecognised scope in a row is therefore inert: it can never satisfy a
 * check for a different scope, so it confers no privilege.
 */

/**
 * Scopes this codebase currently knows how to check.
 *
 * `business.leads.create` is first because it is the first real migration
 * target: Familje-Stunden's `send-pyssel-lead` posts to /api/business/leads on
 * the shared global key today. Nothing in Phase 1 uses this scope yet.
 */
export const PROJECT_API_SCOPES = [
  'business.leads.create',
  /**
   * PR5. Permits ONE action: appending attested workflow evidence for an
   * instance in the credential's own project. It confers nothing else — not a
   * transition, not an approval, not an authorization, not execution, and no
   * reach into any other project's systems. Those are separate scopes that do
   * not exist, and exact-match comparison means this one can never imply them.
   */
  'workflow.evidence.write',
] as const

export type ProjectApiScope = (typeof PROJECT_API_SCOPES)[number]

/**
 * Whether a string is a scope this build knows about.
 *
 * Used for authoring-time validation (a future creation route should refuse to
 * mint a credential naming a scope nothing can check, since that is almost
 * always a typo). It is NOT part of the authorization path: verification never
 * consults this list, because a scope's presence in a row is not what grants
 * access — matching the scope a route demands is.
 */
export function isKnownProjectApiScope(value: unknown): value is ProjectApiScope {
  return typeof value === 'string' && (PROJECT_API_SCOPES as readonly string[]).includes(value)
}
