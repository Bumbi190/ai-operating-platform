/**
 * Omnira Trading — chart colours, resolved in the scope the chart actually lives in.
 *
 * WHY THE SCOPE MATTERS
 * ─────────────────────
 * The canvas cannot read CSS, so the chart copies token values out of computed
 * style once and paints with the copies. Where it reads them from decides which
 * UI generation it paints in. `--os-accent` is indigo at `:root` and cyan only
 * inside `[data-ui-generation='vnext']`, which sits on the shell's `<main>` — so a
 * palette read from `document.documentElement` painted legacy indigo into the
 * vNext workspace. The palette is therefore read from the chart's own element,
 * which inherits exactly the tokens every CSS rule around it already sees.
 *
 * PURE ON PURPOSE
 * ───────────────
 * Nothing here touches the DOM. The caller hands in something that can answer
 * `getPropertyValue`; tests hand in a plain object. A missing or empty token
 * falls back to the design value rather than to an empty string, because an
 * empty colour makes the canvas draw nothing at all.
 */

import type { BoxStyle } from './chart-overlays'

export interface ChartPalette {
  readonly aqua: string
  readonly rose: string
  readonly emerald: string
  readonly gold: string
  readonly goldSoft: string
  readonly violet: string
  readonly accent: string
  readonly text2: string
  readonly text3: string
  readonly edge: string
}

/** Token name and design fallback for every palette entry. */
export const CHART_PALETTE_TOKENS: Readonly<Record<keyof ChartPalette, readonly [string, string]>> = {
  aqua: ['--omnira-aqua', '#a5f3fc'],
  rose: ['--omnira-rose', '#f87171'],
  emerald: ['--omnira-emerald', '#34d399'],
  gold: ['--omnira-gold', '#d4a574'],
  goldSoft: ['--omnira-gold-soft', '#e8c89a'],
  violet: ['--omnira-violet', '#8b5cf6'],
  accent: ['--os-accent', '#22d3ee'],
  text2: ['--omnira-text-2', 'rgba(255,255,255,0.72)'],
  text3: ['--omnira-text-3', 'rgba(255,255,255,0.60)'],
  edge: ['--omnira-edge', 'rgba(255,255,255,0.10)'],
}

/** The one thing the palette needs from computed style. */
export interface TokenSource {
  getPropertyValue(name: string): string
}

/**
 * The chart palette, read from the given computed style.
 *
 * `null` means there is no style to read (a server render): every entry is its
 * design fallback.
 */
export function readChartPalette(source: TokenSource | null): ChartPalette {
  const resolve = ([name, fallback]: readonly [string, string]): string => {
    if (source === null) return fallback
    const value = source.getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }
  return {
    aqua: resolve(CHART_PALETTE_TOKENS.aqua),
    rose: resolve(CHART_PALETTE_TOKENS.rose),
    emerald: resolve(CHART_PALETTE_TOKENS.emerald),
    gold: resolve(CHART_PALETTE_TOKENS.gold),
    goldSoft: resolve(CHART_PALETTE_TOKENS.goldSoft),
    violet: resolve(CHART_PALETTE_TOKENS.violet),
    accent: resolve(CHART_PALETTE_TOKENS.accent),
    text2: resolve(CHART_PALETTE_TOKENS.text2),
    text3: resolve(CHART_PALETTE_TOKENS.text3),
    edge: resolve(CHART_PALETTE_TOKENS.edge),
  }
}

/**
 * How a fair value gap is painted on the interactive chart.
 *
 * The emphasis follows the gap's own lifecycle state — the model's vocabulary,
 * `OPEN | MITIGATED | INVERTED | UNKNOWN` — and mirrors the deterministic SVG
 * chart's `.chartFvg` rules, so the frame shown before the engine mounts and the
 * engine itself describe a gap the same way:
 *
 *   OPEN       the gap as authored: coloured by direction, strongest emphasis
 *   MITIGATED  traded into: neutral and faded, it no longer offers the gap
 *   INVERTED   the iFVG: cyan and dashed — a distinct object, not a faded one
 *   UNKNOWN    state not established: neutral and dashed, never drawn as OPEN
 *
 * The previous resolver compared against `'FILLED'`, which is not a state the
 * model has, so every gap painted identically and only its label differed.
 *
 * It decides nothing about the gap — detection, state and label all arrive on
 * the snapshot.
 */
export function fairValueGapStyle(
  box: { readonly state: string; readonly variant: string; readonly label: string },
  palette: ChartPalette,
): BoxStyle {
  switch (box.state) {
    case 'OPEN':
      return box.variant === 'SHORT'
        ? { fill: 'rgba(248,113,113,0.10)', stroke: palette.rose, label: box.label }
        : { fill: 'rgba(139,92,246,0.12)', stroke: palette.violet, label: box.label }
    case 'MITIGATED':
      return {
        fill: 'rgba(255,255,255,0.04)',
        stroke: 'rgba(255,255,255,0.22)',
        label: box.label,
        labelColor: palette.text3,
      }
    case 'INVERTED':
      return {
        fill: 'rgba(34,211,238,0.14)',
        stroke: 'rgba(34,211,238,0.75)',
        dash: [4, 2],
        label: box.label,
      }
    default:
      // UNKNOWN, and any state a future model adds before this resolver learns
      // it: drawn as incomplete rather than borrowing OPEN's confidence.
      return {
        fill: 'rgba(255,255,255,0.045)',
        stroke: 'rgba(255,255,255,0.24)',
        dash: [3, 3],
        label: box.label,
        labelColor: palette.text3,
      }
  }
}
