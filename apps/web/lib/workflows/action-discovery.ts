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
 *
 * A Map, not an object literal, because `checkAnsweredBy` is now reached with a
 * caller-supplied action kind. Object property lookup walks the prototype
 * chain, so `ANSWERS_CHECK['toString']` on a plain object yields a Function
 * rather than undefined — a value that is not null and would therefore survive
 * a `?? null`. A Map has no such inherited keys.
 */
const ANSWERS_CHECK: ReadonlyMap<string, string> = new Map([
  ['compute_release_instant', 'release_instant_computed'],
  ['probe_anonymous_protected_access', 'anonymous_protected_access_denied'],
  ['observe_release_gate', 'release_gate_exists'],
  ['observe_github_pr_merged', 'github_pr_merged'],
  ['observe_github_pr_checks_green', 'github_pr_checks_green'],
  ['observe_github_merge_sha_match', 'github_merge_sha_matches_expected'],
])

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
    const checkKey = ANSWERS_CHECK.get(kind)
    if (!checkKey) continue          // no declared check ⇒ nothing to satisfy
    found.push({ actionKind: kind as ActionKind, checkKey, actionClass: 'READ_ONLY' })
  }
  return found.sort((a, b) => a.actionKind.localeCompare(b.actionKind))
}

/**
 * EVERY canonical action declared at this (def_key, state) — not only the
 * executable READ_ONLY ones.
 *
 * `discoverReadOnlyActions` answers "what may the scheduler run here" and so
 * filters by class and executor family. Completion asks a different question —
 * "what work does this state declare" — and a MATERIAL_WRITE action that cannot
 * execute yet is still declared work. Filtering it out here would let a state
 * look complete because its work is unimplementable.
 */
export function registeredActionsAt(defKey: string, state: string): string[] {
  return Object.entries(ACTION_REGISTRY)
    .filter(([, meta]) => meta.placements.some(pl => pl.def_key === defKey && pl.state === state))
    .map(([kind]) => kind)
    .sort()
}

/**
 * The check an action answers, for evidence lookups AND for the pre-run gate's
 * self-answered exemption.
 *
 * This is the ONLY mapping from an action to the check it may be exempt from.
 * It is keyed by action kind alone, so an action can never exempt a check that
 * belongs to a different action, and an unmapped or unknown kind returns null —
 * which equals no check_key and therefore exempts nothing.
 */
export function checkAnsweredBy(kind: string): string | null {
  return ANSWERS_CHECK.get(kind) ?? null
}
