import { isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'

/**
 * Activity-peek visibility.
 *
 * The floating Activity peek is shared chrome: it renders in both generations,
 * on every route. It has exactly one reason to stand down — the route already
 * puts an activity rail on screen at desktop width, and showing both would give
 * the same screen two entry points into the same stream.
 *
 * Today that is true of one surface: Atlas Home under vNext, where
 * `AtlasHomeVNext` mounts `ActivitySystemRail`.
 *
 * WHY THIS IS A FUNCTION RATHER THAN AN INLINE CHECK. The peek used to decide
 * this for itself with `searchParams.get('ui') === 'vnext'`, reading the raw
 * query instead of the generation the shell had already resolved. That is the
 * one input that does NOT answer "is this vNext": the canonical resolver reads
 * `?ui=` first, then the `omnira_ui` cookie, then the default, so vNext is
 * reached constantly with no `?ui=` in the URL at all — every registry link to
 * Atlas Home is a bare `/atlas`. The peek therefore stayed visible on top of
 * the rail it was meant to defer to, and the same screen wore different chrome
 * depending only on which link the operator had followed to reach it.
 *
 * So the generation arrives here already resolved, and this module never
 * consults the query, the cookie or the default itself. `lib/ui/generation.ts`
 * remains the single authority on what generation a request is; this only
 * decides what that means for one piece of chrome.
 *
 * Visibility only — this grants and denies nothing.
 */

/** Atlas Home. The one route whose vNext view brings its own desktop rail. */
export const ATLAS_HOME_PATH = '/atlas'

/**
 * Whether the route already renders a desktop activity rail of its own, and the
 * shared peek should therefore be suppressed at desktop width.
 *
 * Below `lg` the peek is the only activity surface — `.insightRail` is
 * `display: none` under 1024px — so callers apply this as `lg:hidden` rather
 * than hiding the peek outright.
 */
export function hasDesktopActivityRail(
  pathname: string,
  generation: OmniraUiGeneration,
): boolean {
  return pathname === ATLAS_HOME_PATH && isVNext(generation)
}
