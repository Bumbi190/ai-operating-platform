/**
 * lib/atlas/autonomy-license/scope.ts — what a licence permits, in ActionKinds.
 *
 * §18.18 ("Level Is Not Scope") is the whole reason this file exists rather than
 * a `min(level, ceiling)` comparison: "An autonomy level describes the CATEGORY
 * of authority. The license defines the actual SCOPE."
 *
 * ── WHY AN ACTION CLASS IS NEVER A SCOPE ───────────────────────────────────
 * The workflow engine already owns a closed classification of actions —
 * `ACTION_CLASSES` in `lib/workflows/action-target.ts`, six values from
 * READ_ONLY to DESTRUCTIVE. It is the right vocabulary for "what does an action
 * of this kind require", and it is deliberately NOT the right vocabulary for
 * "what has this workflow been granted".
 *
 * Licensing the class `FINANCIAL` would mean every FINANCIAL action in Omnira is
 * licensed to this workflow — including ones that do not exist yet and ones
 * belonging to other projects. That is precisely the level-is-scope confusion
 * §18.18 forbids, and §18.272's "Every license must define allowed and forbidden
 * actions" is not satisfiable by naming a category.
 *
 * So a licence holds an explicit, bounded set of ActionKinds — the concrete
 * names the registry already uses (`generate_monthly_story`,
 * `compute_release_instant`, …) — and the ActionClass of each is DERIVED from
 * `ACTION_REGISTRY`, never accepted from the caller. Ruling 4: "Never trust the
 * caller to classify its requested action as safer."
 *
 * ── THE FINGERPRINT: DRIFT WITHOUT MUTATION ────────────────────────────────
 * §18.60 ("Action Mutation") and §18.61 ("Workflow Version Changes") both say a
 * material change must invalidate the grant rather than be absorbed by it.
 *
 * The mechanism is a pure function of (kind set, bound definition, CURRENT
 * registry). The value recorded at issue time was produced by an earlier
 * registry; recomputing it now and finding a different answer IS the drift. So
 * there are deliberately not two functions — one "recorded" and one "current" —
 * because two implementations of one fingerprint is precisely how they drift
 * apart. There is one function, called at two times.
 *
 * Ruling 4: "Prefer using the repository's existing canonical hash primitive
 * rather than creating another JSON canonicalizer."
 */

import { ACTION_REGISTRY, isKnownActionKind, type ActionKind } from '@/lib/workflows/action-registry'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type { ActionScope, LicensedActionEntry } from './types'

/**
 * Why an action scope was refused. A closed vocabulary so the caller learns
 * which kind was wrong without the boundary having to explain itself in prose.
 */
export type ActionScopeRefusal =
  | 'action_kinds_required'
  | 'action_kind_unknown'
  | 'action_kind_duplicated'

export type ActionScopeResult =
  | { ok: true; scope: ActionScope }
  | { ok: false; reason: ActionScopeRefusal; detail: string }

/**
 * Resolve a caller-named set of ActionKinds against the canonical registry.
 *
 * The caller supplies NAMES ONLY. Class, placement and fingerprint are all
 * derived here, so there is no field in the request shape a caller could use to
 * assert that an action is safer than the registry says it is.
 *
 * An unknown kind is refused rather than ignored (§18.29 "Tool Scope"): a
 * licence that silently dropped a name it did not recognise would grant less
 * than the human approved while looking like it granted exactly that.
 *
 * A kind the bound definition does not declare is ALLOWED and recorded with an
 * empty placement list. It grants nothing — the action can never fire in a
 * workflow that does not declare it — so refusing it would add a constraint
 * beyond the one rule Ruling 4 states, while the empty placement keeps the fact
 * visible in the fingerprint rather than hiding it.
 */
export function resolveActionScope(
  actionKinds: readonly string[],
  boundDefKey: string | null,
): ActionScopeResult {
  if (!Array.isArray(actionKinds) || actionKinds.length === 0) {
    return { ok: false, reason: 'action_kinds_required', detail: 'at least one ActionKind is required' }
  }

  const seen = new Set<string>()
  for (const kind of actionKinds) {
    if (typeof kind !== 'string' || kind.length === 0) {
      return { ok: false, reason: 'action_kind_unknown', detail: String(kind) }
    }
    if (seen.has(kind)) return { ok: false, reason: 'action_kind_duplicated', detail: kind }
    seen.add(kind)
    // The ONE refusal Ruling 4 specifies: a kind absent from ACTION_REGISTRY.
    if (!isKnownActionKind(kind)) return { ok: false, reason: 'action_kind_unknown', detail: kind }
  }

  const kinds = [...seen].sort()
  return {
    ok: true,
    scope: { entries: entriesFor(kinds), fingerprint: fingerprintFor(kinds, boundDefKey) },
  }
}

/** Kinds → entries carrying the class the REGISTRY currently declares. */
export function entriesFor(actionKinds: readonly string[]): LicensedActionEntry[] {
  return [...actionKinds].sort().map(actionKind => ({
    actionKind,
    actionClass: isKnownActionKind(actionKind)
      ? ACTION_REGISTRY[actionKind].action_class
      : null,
  }))
}

/**
 * The load-bearing registry facts, per licensed kind.
 *
 * Bound, deliberately:
 *   • `kind`         — which action.
 *   • `action_class` — the blast radius, and what every downstream guard reads.
 *   • `states`       — WHERE in this definition the kind is declared. A kind
 *                      that leaves the bound definition is no longer reachable
 *                      from this workflow, which is material to a grant whose
 *                      whole subject is "what this workflow may do unattended".
 *
 * NOT bound, deliberately: `description`. Ruling 4 is explicit that "changing
 * prose should not invalidate authority" — a typo fix in a doc string is not a
 * reclassification, and a fingerprint that fired on one would train reviewers
 * to ignore it.
 *
 * Placement is filtered to the bound definition rather than taken whole. A kind
 * may legitimately appear in several workflows, and another workflow adopting it
 * says nothing about whether THIS workflow's grant still means what it meant.
 *
 * A kind no longer in the registry hashes as `action_class: null`, which cannot
 * equal the class recorded at issue time — so removal reads as drift, which it
 * is, rather than being silently absorbed.
 */
export function fingerprintFor(
  actionKinds: readonly string[],
  boundDefKey: string | null,
): string {
  const payload = {
    v: 1,
    boundDefKey,
    actions: [...actionKinds].sort().map(kind => {
      const canonical = isKnownActionKind(kind) ? ACTION_REGISTRY[kind as ActionKind] : null
      const states = canonical
        ? canonical.placements
            .filter(p => p.def_key === boundDefKey)
            .map(p => p.state)
            .slice()
            .sort()
        : []
      return { kind, action_class: canonical ? canonical.action_class : null, states }
    }),
  }
  return canonicalTargetVersionHash(payload)
}

/**
 * Did anything material move since the grant was issued?
 *
 * `recorded` is the fingerprint the ledger preserved; the comparison value is
 * recomputed from today's registry. Inequality means the grant no longer
 * describes the registry it was made against — and the licence resolves to L0
 * with reason `scope_drifted` without a single row changing.
 */
export function scopeDrifted(
  actionKinds: readonly string[],
  boundDefKey: string | null,
  recorded: string,
): boolean {
  return fingerprintFor(actionKinds, boundDefKey) !== recorded
}

/** The classes this licence covers. Derived, for audit surfaces — never scope. */
export function actionClassesOf(entries: readonly LicensedActionEntry[]): string[] {
  return [...new Set(entries.map(e => e.actionClass).filter((c): c is string => c !== null))].sort()
}
