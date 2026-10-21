import { isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'

/** Shared activity chrome uses the server-resolved generation. Atlas Home
 * supplies its own desktop rail; project pages supply desktop navigation to
 * activity. Both retain the floating sheet trigger below lg.
 * Visibility only: these helpers grant and deny no data access. */

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

/** Project chrome already offers activity in desktop navigation. */
export function isVNextProjectPath(pathname: string, generation: OmniraUiGeneration): boolean {
  return isVNext(generation) && (pathname === '/projects' || pathname.startsWith('/projects/'))
}

export function shouldHideDesktopActivityPeek(pathname: string, generation: OmniraUiGeneration): boolean {
  return hasDesktopActivityRail(pathname, generation) || isVNextProjectPath(pathname, generation)
}
