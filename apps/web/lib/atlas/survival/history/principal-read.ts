/**
 * lib/atlas/survival/history/principal-read.ts — scope-safe history reader.
 *
 * One query, one project, one authorized scope. The reader exists so a caller
 * never needs a raw table handle: history is reachable only through a function
 * that requires the caller's allow-list and refuses a project outside it.
 *
 * ── TENANCY ────────────────────────────────────────────────────────────────
 * The allow-list is a REQUIRED parameter, not an optional filter. A caller that
 * has no scope cannot ask for history at all, and the membership test is the
 * repository's existing `assertProjectAllowed` — not a second implementation of
 * "may this caller read this project". The query is additionally pinned to that
 * one project, so the result set cannot contain another tenant's rows even if
 * the allow-list were wrong.
 *
 * `project_denied` is returned rather than an empty list, so "you may not read
 * this" is never rendered as "there is no history" — the same distinction
 * `lib/atlas/decision-ledger/principal-read.ts` keeps for its own reads.
 *
 * ── WHAT A RESULT MEANS ────────────────────────────────────────────────────
 * These rows are ONE project's stream: the canonical observations produced for
 * that project over time. They are not the Systemhälsa figure, which derives a
 * single observation across the operator's whole allowed project set. A caller
 * holding several projects gets several INDEPENDENT streams here, never one
 * combined history, and must not present the concatenation as a platform state.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { recentEvents } from './store'
import {
  SURVIVAL_HISTORY_DEFAULT_LIMIT,
  SURVIVAL_HISTORY_MAX_LIMIT,
  type SurvivalHistoryReadResult,
} from './types'

type AnyDb = any

export interface SurvivalHistoryReadArgs {
  /** Hard-capped at `SURVIVAL_HISTORY_MAX_LIMIT` however large a caller asks. */
  limit?: number
  db?: AnyDb
}

/**
 * Recent survival transitions for one project, newest first.
 *
 * `allowedProjectIds` must come from an authenticated scope
 * (`resolveProjectAccess().allowedProjectIds`); this function does not
 * authenticate and must not be reachable without that having happened.
 */
export async function listProjectSurvivalTransitions(
  projectId: string,
  allowedProjectIds: readonly string[],
  args: SurvivalHistoryReadArgs = {},
): Promise<SurvivalHistoryReadResult> {
  if (!assertProjectAllowed(projectId, [...allowedProjectIds])) {
    return { status: 'project_denied', events: [] }
  }

  const limit = Math.min(
    Math.max(1, args.limit ?? SURVIVAL_HISTORY_DEFAULT_LIMIT),
    SURVIVAL_HISTORY_MAX_LIMIT,
  )

  try {
    const events = await recentEvents(projectId, limit, args.db)
    return { status: 'ok', events }
  } catch {
    // A read that failed is NOT an empty history.
    return { status: 'unavailable', events: [] }
  }
}

/** The most recent event for one project, or null. Same scope rules. */
export async function latestProjectSurvivalEvent(
  projectId: string,
  allowedProjectIds: readonly string[],
  args: SurvivalHistoryReadArgs = {},
): Promise<SurvivalHistoryReadResult> {
  const result = await listProjectSurvivalTransitions(projectId, allowedProjectIds, {
    ...args,
    limit: 1,
  })
  if (result.status !== 'ok') return result
  return { status: 'ok', events: result.events.slice(0, 1) }
}
