import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * ─── OSPage ─────────────────────────────────────────────────────────────────
 *
 * The canonical full-width canvas container for every (platform) page.
 *
 * Replaces the old centered-SaaS pattern (`max-w-* mx-auto p-8 space-y-8`)
 * with a true operating-system canvas:
 *
 *   • full viewport width — no `max-w` cap, no `mx-auto`
 *   • fluid horizontal padding that breathes at 1440 / 1920 / 2560 / 3840
 *   • consistent vertical rhythm via the OSStack / OSLayer primitives
 *
 * The canvas inherits the spatial architecture from (platform)/layout.tsx:
 *
 *        ┌────────────┬─────────────────────────────────────┬────────────┐
 *        │  Sidebar   │            OPERATING  CANVAS        │ Context    │
 *        │  260 px    │   ↑ this is what OSPage fills ↑     │ Rail 300px │
 *        └────────────┴─────────────────────────────────────┴────────────┘
 *
 * Children are expected to be `<OSLayer>`s representing the five
 * architectural layers (Command / Hero / Operational / Intelligence / Footer)
 * but raw children are also accepted for incremental migration.
 */
export function OSPage({
  children,
  className,
  density = 'comfortable',
}: {
  children: ReactNode
  className?: string
  /**
   * Controls the vertical rhythm between layers.
   *   • compact      — manager / chat-style dense work surfaces
   *   • comfortable  — default for dashboards & telemetry pages
   *   • spacious     — long-form reading / settings
   */
  density?: 'compact' | 'comfortable' | 'spacious'
}) {
  const gap =
    density === 'compact'    ? 'space-y-4 lg:space-y-5' :
    density === 'spacious'   ? 'space-y-8 lg:space-y-10' :
                               'space-y-6 lg:space-y-7'

  return (
    <div
      className={cn(
        // ── Fluid horizontal padding — breathes across viewport widths ──
        'px-6 md:px-8 lg:px-10 2xl:px-12 3xl:px-16',
        // ── Vertical breathing room — top/bottom of the canvas ──
        'pt-7 lg:pt-9 pb-20 lg:pb-24',
        // ── No max-w cap — the canvas owns the whole 1fr column ──
        'w-full',
        gap,
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * ─── OSLayer ────────────────────────────────────────────────────────────────
 *
 * A semantic wrapper representing one of the five OS architectural layers.
 * Provides hooks for future per-layer behavior (sticky command bars,
 * parallax hero, telemetry refresh, etc.) without dictating visuals.
 */
export function OSLayer({
  layer,
  children,
  className,
}: {
  layer: 'command' | 'hero' | 'operational' | 'intelligence' | 'footer'
  children: ReactNode
  className?: string
}) {
  return (
    <section data-os-layer={layer} className={cn('relative', className)}>
      {children}
    </section>
  )
}

/**
 * ─── OSGrid ─────────────────────────────────────────────────────────────────
 *
 * Asymmetric spatial grid for distributing systems across the canvas.
 *
 * Common compositions:
 *   • <OSGrid cols="hero">       8 / 4   — hero + side cluster
 *   • <OSGrid cols="systems">    7 / 5   — primary system + secondary
 *   • <OSGrid cols="telemetry">  8 / 4   — chart + health dial
 *   • <OSGrid cols="thirds">     4 / 4 / 4
 *   • <OSGrid cols="halves">     6 / 6
 *   • <OSGrid cols="ultra">      9 / 3   — dominant + sliver
 *
 * On ultrawide (3xl+) the grid progressively unlocks an extra column so the
 * canvas truly distributes systems in space rather than stretching them.
 */
export function OSGrid({
  cols = 'systems',
  gap = 'default',
  children,
  className,
}: {
  cols?: 'hero' | 'systems' | 'telemetry' | 'thirds' | 'halves' | 'ultra' | 'quads'
  gap?: 'tight' | 'default' | 'loose'
  children: ReactNode
  className?: string
}) {
  const layout =
    cols === 'hero'      ? 'grid-cols-12 [&>*:first-child]:col-span-12 lg:[&>*:first-child]:col-span-8 [&>*:last-child]:col-span-12 lg:[&>*:last-child]:col-span-4' :
    cols === 'systems'   ? 'grid-cols-12 [&>*:first-child]:col-span-12 xl:[&>*:first-child]:col-span-7 [&>*:last-child]:col-span-12 xl:[&>*:last-child]:col-span-5' :
    cols === 'telemetry' ? 'grid-cols-12 [&>*:first-child]:col-span-12 lg:[&>*:first-child]:col-span-8 [&>*:last-child]:col-span-12 lg:[&>*:last-child]:col-span-4' :
    cols === 'thirds'    ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' :
    cols === 'halves'    ? 'grid-cols-1 lg:grid-cols-2' :
    cols === 'quads'     ? 'grid-cols-2 md:grid-cols-4' :
    cols === 'ultra'     ? 'grid-cols-12 [&>*:first-child]:col-span-12 lg:[&>*:first-child]:col-span-9 [&>*:last-child]:col-span-12 lg:[&>*:last-child]:col-span-3' :
                           'grid-cols-1'

  const gapClass =
    gap === 'tight' ? 'gap-3 lg:gap-4' :
    gap === 'loose' ? 'gap-6 lg:gap-8' :
                      'gap-4 lg:gap-5 2xl:gap-6'

  return (
    <div className={cn('grid', layout, gapClass, className)}>
      {children}
    </div>
  )
}
