/**
 * Atlas project-isolation boundary — the single source of truth for
 * "which projects may this request see?".
 *
 * Every Atlas data path (buildLiveContext, ask_manager, get_dream_findings, and
 * the future get_records) resolves the caller's allowed projects through THIS
 * module and scopes every project-native query to them.
 *
 * The boundary deliberately mirrors the existing Postgres RLS policy on
 * `projects` (`projects_owner: owner_id = auth.uid()`), so application-code
 * scoping can never diverge from what the database already enforces for the UI.
 *
 * SECURITY INVARIANTS (do not weaken):
 *  - An EMPTY allow-list must ALWAYS produce an empty result, never an
 *    unscoped query. `scopeProjectFilter` guarantees this by substituting an
 *    impossible id, so `.in('project_id', …)` can never be skipped.
 *  - A caller-supplied project id is only trusted after `assertProjectAllowed`.
 *  - If the user id is missing/unknown, the allow-list is empty (fail closed).
 */

type AnyDb = any

/** A UUID that can never be a real project id → forces an empty result set. */
export const IMPOSSIBLE_PROJECT_ID = '00000000-0000-0000-0000-000000000000'

/**
 * The project ids the given user owns. Mirrors RLS `owner_id = auth.uid()`.
 * Returns [] (fail-closed) when userId is missing or on any error.
 */
export async function getAllowedProjectIds(db: AnyDb, userId: string | null | undefined): Promise<string[]> {
  if (!userId) {
    // [atlas-diag] TEMPORARY — remove after root-cause confirmed.
    console.warn('[atlas-diag] getAllowedProjectIds: no userId → fail-closed empty allow-list')
    return []
  }
  try {
    const { data, error } = await db.from('projects').select('id').eq('owner_id', userId)
    // [atlas-diag] TEMPORARY — distinguishes "owns nothing" from a swallowed query error.
    if (error) console.error('[atlas-diag] getAllowedProjectIds query error:', error)
    else console.log(`[atlas-diag] getAllowedProjectIds userId=${userId} → ${(data ?? []).length} project(s)`)
    return (data ?? []).map((r: { id: string }) => r.id)
  } catch (e) {
    console.error('[atlas-diag] getAllowedProjectIds THREW → fail-closed empty allow-list:', e)
    return []
  }
}

/**
 * The value array to pass to `.in('project_id', …)`.
 * NEVER returns an empty array — an empty allow-list yields [IMPOSSIBLE_PROJECT_ID]
 * so the query returns zero rows instead of (the footgun) every row.
 */
export function scopeProjectFilter(allowedIds: string[]): string[] {
  return allowedIds.length > 0 ? allowedIds : [IMPOSSIBLE_PROJECT_ID]
}

/**
 * Apply project scoping to a Supabase query builder in one place.
 * `column` defaults to 'project_id'; pass another for indirect scopes.
 */
export function scopeToProjects<Q extends { in: (col: string, vals: string[]) => Q }>(
  query: Q,
  allowedIds: string[],
  column = 'project_id',
): Q {
  return query.in(column, scopeProjectFilter(allowedIds))
}

/**
 * Scope a query ONLY when an allow-list is provided.
 *  - `undefined`  → no scoping (legacy/global callers stay unchanged).
 *  - `string[]`   → scope to it; an EMPTY array yields zero rows (impossible id).
 * This lets the same module function serve both the isolated Atlas entry points
 * (which always pass an array) and pre-existing global callers (which pass none).
 */
export function applyProjectScope<Q extends { in: (col: string, vals: string[]) => Q }>(
  query: Q,
  allowedIds: string[] | undefined,
  column = 'project_id',
): Q {
  if (allowedIds === undefined) return query
  return query.in(column, scopeProjectFilter(allowedIds))
}

/** True only if a caller/model-supplied project id is within the allow-list. */
export function assertProjectAllowed(id: string | null | undefined, allowedIds: string[]): boolean {
  return !!id && allowedIds.includes(id)
}
