import { isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'
import { ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'

/**
 * Shell mobile-navigation visibility.
 *
 * WHY THIS EXISTS. Below `lg` the vNext shell had no navigation at all outside
 * Atlas Home. The sidebar is `hidden lg:flex`, vNext deliberately renders no
 * `CommandBar`, `AtlasMiniOrb` is `hidden lg:block`, and `CommandPaletteHost` is
 * a keyboard listener — ⌘K has no touch affordance. `AtlasMobileNav` existed but
 * was mounted inside `AtlasHomeVNext`, so it only ever appeared on `/atlas`. A
 * touch operator could reach `/revenue` or `/memory` and then had no way out but
 * browser back. That gap opened when PR #95 removed the bar from vNext: before
 * it, `CommandBar` was mounted for BOTH generations at every width.
 *
 * WHY THE SHELL DOES NOT SIMPLY OWN IT EVERYWHERE. Hoisting the header out of
 * `AtlasHomeVNext` looks tidier and is wrong. Atlas Home accounts for the header
 * in its own layout — below 1024px `.workspace` is `min-height: calc(100dvh -
 * 62px)` precisely because the 62px header is its sibling inside `.page`, which
 * is itself `min-height: 100dvh`. Move the header above `.page` and the page
 * still claims a full viewport, so Atlas Home gains 62px of scroll it never had.
 * Atlas Home is the locked visual reference, so it keeps its own header and the
 * shell covers everything else.
 *
 * That split is only safe if it can never double up, which is what this decides:
 * the shell renders the nav on every vNext route EXCEPT the one page that brings
 * its own. Exactly one instance per page, by construction.
 *
 * Layout only. This grants and denies nothing — route access is enforced by
 * middleware and the server, exactly as before.
 */

/**
 * Whether the platform shell should mount the vNext mobile nav for this route.
 *
 * Visibility across breakpoints is left to CSS: `.mobileHeader` is
 * `display: none` until `max-width: 1023px`, so the desktop shell keeps the
 * sidebar and the header stays out of the way without a second breakpoint
 * source of truth in JS.
 */
export function shouldRenderShellMobileNav(
  pathname: string,
  generation: OmniraUiGeneration,
): boolean {
  if (!isVNext(generation)) return false
  return pathname !== ATLAS_HOME_PATH
}

/**
 * How many vNext mobile navs a route ends up with, counting both owners.
 *
 * Exists so the "exactly one" property is asserted directly rather than inferred
 * from two separate render sites. `AtlasHomeVNext` renders its own header, and
 * only on Atlas Home under vNext.
 */
export function mobileNavInstanceCount(
  pathname: string,
  generation: OmniraUiGeneration,
): number {
  const fromAtlasHome = isVNext(generation) && pathname === ATLAS_HOME_PATH ? 1 : 0
  const fromShell = shouldRenderShellMobileNav(pathname, generation) ? 1 : 0
  return fromAtlasHome + fromShell
}
