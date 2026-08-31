/**
 * lib/workflows/action-discovery.ts — what the scheduler is allowed to schedule.
 *
 * ── CANONICAL DATA ONLY ─────────────────────────────────────────────────────
 * Discovery reads the PR9e-0 registry keyed by (def_key, state). It does NOT
 * read `automated_actions`, which is `string[]` of Swedish prose — turning those
 * sentences into executable work is exactly the mistake that would let a
 * mistranslated line schedule an upload.
 *
 * ── TWO FILTERS, BOTH REQUIRED ─────────────────────────────────────────────
 * A candidate must be `executor_family === 'read_only_observation'` AND
 * `action_class === 'READ_ONLY'`. Either alone would be enough today, which is
 * why both are asserted: if one is ever loosened the other still refuses, and
 * the mutation tests fail if either disappears.
 *
 * ── AND A THIRD, FURTHER DOWN ──────────────────────────────────────────────
 * Even if both filters were removed, `createWorkflowActionRun` derives the class
 * from the same registry and a write class would demand an authorization the
 * scheduler cannot produce — and the database now refuses a non-READ_ONLY bound
 * action whose authorization_id is null. Three independent layers.
 */

import { ACTION_REGISTRY, type ActionKind } from './action-registry'

export interface DiscoveredAction {
  actionKind: ActionKind
  checkKey: string
  /** Always 'READ_ONLY' — the type is narrowed by the filters below. */
  actionClass: 'READ_ONLY'
}

/**
 * Which declared check each executable action answers. Kept beside discovery so
 * "has this observation already been made" can be asked without running it.
 */
const ANSWERS_CHECK: Record<string, string> = {
  compute_release_instant: 'release_instant_computed',
  probe_anonymous_protected_access: 'anonymous_protected_access_denied',
}

/**
 * Canonical executable READ_ONLY actions for one definition state.
 *
 * Returns at most the actions the registry declares for exactly this def_key and
 * state. Today, for `familje-stunden.monthly-release` / `planning`, that is
 * exactly one: compute_release_instant.
 */
export function discoverReadOnlyActions(defKey: string, state: string): DiscoveredAction[] {
  const found: DiscoveredAction[] = []
  for (const [kind, meta] of Object.entries(ACTION_REGISTRY)) {
    // EXACT (def_key, state) against any declared placement. A kind declared in
    // two workflows is discovered in each, and in neither by accident.
    if (!meta.placements.some(pl => pl.def_key === defKey && pl.state === state)) continue
    // Both filters. Neither is redundant: they guard different mistakes —
    // "this class is safe" and "an executor for it actually exists".
    if (meta.executor_family !== 'read_only_observation') continue
    if (meta.action_class !== 'READ_ONLY') continue
    const checkKey = ANSWERS_CHECK[kind]
    if (!checkKey) continue          // no declared check ⇒ nothing to satisfy
    found.push({ actionKind: kind as ActionKind, checkKey, actionClass: 'READ_ONLY' })
  }
  return found.sort((a, b) => a.actionKind.localeCompare(b.actionKind))
}

/** The check an action answers, for evidence lookups. */
export function checkAnsweredBy(kind: string): string | null {
  return ANSWERS_CHECK[kind] ?? null
}
