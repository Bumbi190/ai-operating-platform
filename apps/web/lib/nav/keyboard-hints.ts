import { isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'
import { ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'

/**
 * Keyboard hints — what the current view can be driven with.
 *
 * WHAT THIS IS NOT, AND MUST NEVER BECOME. It is not a keyboard router, and it
 * registers no listener of any kind. Omnira already has keyboard owners and
 * they keep their keys:
 *
 *   lib/atlas/project-rail-keyboard.ts   the shared resolver + guards
 *   ProjectRail                          ← → Enter on Atlas Home
 *   AtlasProjectReturnShortcut           Esc / safe Backspace on project routes
 *   lib/trading/market-view/keyboard.ts  ← → and return in the market view
 *   GraphCanvas                          the graph's own canvas keys
 *   CommandPaletteHost / CommandBar      ⌘K, one per generation
 *   CommandPalette                       Esc ↑ ↓ Enter while it is open
 *   lib/atlas/runtime.tsx                Alt+Space voice, Esc to end a session
 *   MobileRailToggle                     Esc while the peek panel is open
 *
 * This module only DESCRIBES those bindings so one surface can show them. If a
 * hint here ever stops matching its owner, the hint is wrong — never the owner.
 *
 * WHY NO CENTRAL ROUTER. The audit found no shortcut implemented twice for the
 * same context: ⌘K has two owners but they are mutually exclusive by generation,
 * and every Esc owner is already gated — the resolver's
 * `hasHigherPriorityKeyboardSurface` stands the rail down for dialogs and the
 * open palette, and the runtime's Esc only fires during a voice session. A
 * router would take ownership away from surfaces that are already correct.
 *
 * ONLY UNCONDITIONAL BINDINGS ARE LISTED. A hint that is sometimes a lie is
 * worse than no hint. `Esc` on a project route is the case that proves it:
 * `AtlasProjectReturnShortcut` only binds when the route was opened FROM the
 * rail — it checks a session marker first — so "Esc tillbaka" would be wrong
 * for anyone who arrived by link, bookmark or reload, and it is not listed.
 */

export interface KeyboardHint {
  /** Key caps, in press order. Rendered verbatim. */
  keys: readonly string[]
  /** What the keys do, in the product's language. */
  label: string
  /**
   * Drop order when space runs out — higher numbers go first. Navigation and
   * "how do I get out of here" survive longest.
   */
  priority: number
}

/**
 * ⌘K, on every vNext route.
 *
 * `CommandPaletteHost` is mounted by the platform layout for the whole vNext
 * generation, so this is true everywhere — including on routes that have no
 * keys of their own.
 */
const COMMAND_PALETTE: KeyboardHint = { keys: ['⌘', 'K'], label: 'sök och hoppa', priority: 3 }

/**
 * Atlas voice, from `lib/atlas/runtime.tsx`.
 *
 * `AtlasRuntimeProvider` wraps every platform route, so the binding is global.
 * Lowest priority: it is the first thing to go when the bar narrows, because it
 * is the least tied to the view in front of the operator.
 */
const VOICE: KeyboardHint = { keys: ['Alt', 'Space'], label: 'Atlas röst', priority: 4 }

/** Present on every vNext route, in this order. */
const GLOBAL_HINTS: readonly KeyboardHint[] = [COMMAND_PALETTE, VOICE]

interface RouteHints {
  readonly base: string
  /**
   * Match this path ONLY, not its children.
   *
   * `/projects` needs it: the spiral's ← → Enter belong to the index, and a
   * prefix match would advertise them on every project page and every page
   * beneath one, where nothing binds them.
   */
  readonly exact?: boolean
  readonly hints: readonly KeyboardHint[]
}

/**
 * Route-specific hints, each one traced to the code that implements it.
 *
 * Matched by longest base, so a deeper route can carry its own set without the
 * shallower one having to know about it.
 */
const ROUTE_HINTS: readonly RouteHints[] = [
  {
    // app/(platform)/projects/page.tsx → ProjectSpiral, which asks
    // resolveProjectRailKeyAction in the 'atlas' context — the same resolver,
    // the same guards, and the same meanings the Atlas rail already uses.
    base: '/projects',
    exact: true,
    hints: [
      { keys: ['←', '→'], label: 'bläddra projekt', priority: 0 },
      { keys: ['Enter'], label: 'öppna projekt', priority: 1 },
    ],
  },
  {
    // components/platform/trading/AtlasMarketView.tsx →
    // lib/trading/market-view/keyboard.ts → resolveProjectRailKeyAction
    base: '/trading',
    hints: [
      { keys: ['←', '→'], label: 'byt instrument', priority: 0 },
      { keys: ['Esc'], label: 'tillbaka till Atlas', priority: 1 },
    ],
  },
  {
    // components/platform/intelligence/GraphCanvas.tsx — handleCanvasKeyDown
    // and the per-node handler. These need canvas focus, which Tab reaches.
    base: '/intelligence/graph',
    hints: [
      { keys: ['←', '→', '↑', '↓'], label: 'navigera noder', priority: 0 },
      { keys: ['Enter'], label: 'inspektera', priority: 1 },
      { keys: ['/'], label: 'sök', priority: 1 },
      { keys: ['F'], label: 'fokusera urval', priority: 2 },
      { keys: ['+', '−'], label: 'zooma', priority: 2 },
      { keys: ['0'], label: 'anpassa', priority: 2 },
      { keys: ['Esc'], label: 'rensa urval', priority: 1 },
    ],
  },
]

/** The hints for a pathname: the route's own, then the global ones. */
export function keyboardHintsFor(pathname: string): KeyboardHint[] {
  const path = normalizePath(pathname ?? '/')
  const match = ROUTE_HINTS
    .filter((entry) => entry.exact
      ? path === entry.base
      : path === entry.base || path.startsWith(entry.base + '/'))
    .sort((a, b) => b.base.length - a.base.length)[0]
  return [...(match?.hints ?? []), ...GLOBAL_HINTS]
}

/**
 * The hints that survive at a given capacity, most important first.
 *
 * Capacity is a count, not a width: the bar hides whole hints rather than
 * letting them wrap or scroll, and the caller decides how many fit. Ties keep
 * their declared order, so the set is stable as it shrinks.
 */
export function visibleKeyboardHints(hints: readonly KeyboardHint[], capacity: number): KeyboardHint[] {
  if (capacity <= 0) return []
  return hints
    .map((hint, index) => ({ hint, index }))
    .sort((a, b) => a.hint.priority - b.hint.priority || a.index - b.index)
    .slice(0, capacity)
    .sort((a, b) => a.index - b.index)
    .map(({ hint }) => hint)
}

function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] || '/'
  return withoutQuery.replace(/\/+$/, '') || '/'
}

/**
 * Whether the shell should mount the hint bar.
 *
 * Two reasons to stand down:
 *
 *  - LEGACY. It keeps `CommandBar`, which already renders its own ⌘K caps.
 *    Adding a second hint surface there would change the rollback path.
 *  - ATLAS HOME. It is the locked visual reference, it owns its whole canvas,
 *    and it already carries its own inline hint next to the composer
 *    ("Enter skickar · Skift + Enter ger ny rad"). A shell bar on top of that
 *    would be the duplication this phase exists to avoid.
 *
 * Layout only — this grants and denies nothing, and no behaviour depends on it.
 * Every shortcut it describes works whether or not the bar is on screen.
 */
export function shouldRenderKeyboardHints(
  pathname: string,
  generation: OmniraUiGeneration,
): boolean {
  if (!isVNext(generation)) return false
  return normalizePath(pathname ?? '/') !== ATLAS_HOME_PATH
}
