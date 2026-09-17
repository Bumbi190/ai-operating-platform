/**
 * The chart's box and its fullscreen control.
 *
 * The claim worth proving is that a wide display buys chart WIDTH rather than
 * height, and that Escape means one thing at a time. Both are structural, so
 * they are tested structurally — this repo runs tests without a DOM, and a
 * pixel assertion would be brittle and prove less.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixtureSnapshot } from '@/lib/trading/market-view'

let ChartShell: (props: Record<string, unknown>) => JSX.Element
let fullscreenOwnsEscape: (doc: { fullscreenElement: Element | null }) => boolean

beforeAll(async () => {
  const mod = await import('./ChartShell')
  ChartShell = mod.ChartShell as never
  fullscreenOwnsEscape = mod.fullscreenOwnsEscape as never
})

const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')

/** Source with comments stripped — prose legitimately names what it forbids. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

function render() {
  return renderToStaticMarkup(
    createElement(ChartShell, {
      snapshot: buildFixtureSnapshot('long-developing', 'NQ', '5m'),
      instrument: 'NQ',
      timeframe: '5m',
    }),
  )
}

// ─── The control ──────────────────────────────────────────────────────────────

describe('the fullscreen control', () => {
  it('is a real, focusable button — not a mouse-only affordance', () => {
    const markup = render()
    expect(markup).toContain('data-testid="chart-fullscreen-toggle"')
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*data-testid="chart-fullscreen-toggle"/)
    // No tabindex="-1" anywhere near it, and no div pretending to be a button.
    expect(markup).not.toMatch(/tabindex="-1"[^>]*chart-fullscreen-toggle/)
  })

  it('carries the Swedish aria-label for entering fullscreen', () => {
    expect(render()).toContain('aria-label="Öppna graf i helskärm"')
  })

  it('declares the exit label for the fullscreen state', () => {
    // Effects do not run in static markup, so the entering label is what renders.
    // The exit wording is asserted at the source, where the pair is decided.
    const src = read('./ChartShell.tsx')
    expect(src).toContain("'Stäng helskärm'")
    expect(src).toContain("'Öppna graf i helskärm'")
  })

  it('hides the decorative glyph from assistive technology', () => {
    expect(render()).toMatch(/aria-hidden="true"/)
  })
})

// ─── Fullscreen mechanics ─────────────────────────────────────────────────────

describe('fullscreen uses the browser, and trusts only the browser', () => {
  const src = () => read('./ChartShell.tsx')

  it('calls the real Fullscreen API rather than faking an overlay', () => {
    expect(src()).toMatch(/requestFullscreen/)
    expect(src()).toMatch(/exitFullscreen/)
    // No fixed-overlay impersonation of fullscreen.
    expect(src()).not.toMatch(/position:\s*fixed/)
  })

  it('subscribes to fullscreenchange and cleans up', () => {
    const s = src()
    expect(s).toContain("addEventListener('fullscreenchange'")
    expect(s).toContain("removeEventListener('fullscreenchange'")
  })

  it('derives state from document.fullscreenElement, never an assumed boolean', () => {
    const s = src()
    expect(s).toMatch(/document\.fullscreenElement === shellRef\.current/)
    // The toggle also asks the document what is true before deciding.
    expect(s).toMatch(/if \(document\.fullscreenElement === element\)/)
  })

  it('shows instrument and timeframe in fullscreen without rebuilding the header', () => {
    const s = src()
    expect(s).toContain('chart-shell-context')
    for (const headerOnly of ['onInstrumentChange', 'onTimeframeChange', 'scenarioBar', 'MarketViewHeader']) {
      expect(s, `fullscreen recreates ${headerOnly}`).not.toContain(headerOnly)
    }
  })
})

// ─── Escape ───────────────────────────────────────────────────────────────────

describe('Escape means one thing at a time', () => {
  it('gives Escape to the browser while the chart is fullscreen', () => {
    expect(fullscreenOwnsEscape({ fullscreenElement: {} as Element })).toBe(true)
  })

  it('returns Escape to Atlas navigation once fullscreen closes', () => {
    expect(fullscreenOwnsEscape({ fullscreenElement: null })).toBe(false)
  })

  it('is consulted before the workspace resolves any key action', () => {
    const view = read('./AtlasMarketView.tsx')
    const guard = view.indexOf('fullscreenOwnsEscape(document)')
    const resolve = view.indexOf('resolveMarketViewKeyAction(event, document)')
    expect(guard).toBeGreaterThan(-1)
    expect(resolve).toBeGreaterThan(-1)
    // Order matters: resolving first would navigate before the guard could stop it.
    expect(guard).toBeLessThan(resolve)
  })

  it('changes no key vocabulary — the guard sits above it', () => {
    /*
     * The fix is a guard in the workspace, not a change to what keys mean. The
     * resolver has its own tests; re-testing it here would only duplicate them.
     * What matters is that this change did not touch it.
     */
    const view = read('./AtlasMarketView.tsx')
    expect(view).toContain("resolveMarketViewKeyAction")
    // Backspace still returns to Atlas once fullscreen is closed: the guard is
    // the only thing added, and it short-circuits rather than reinterpreting.
    expect(view).toMatch(/if \(fullscreenOwnsEscape\(document\)\) return/)
    expect(view).not.toMatch(/key === 'Escape'/)
    expect(view).not.toMatch(/key === 'Backspace'/)
  })
})

// ─── Sizing ───────────────────────────────────────────────────────────────────

describe('the chart is sized by its container, not by its aspect ratio', () => {
  const css = () => read('./AtlasMarketView.module.css')

  it('no longer lets the viewBox ratio drive rendered height', () => {
    // `height: auto` was the whole defect: rendered height was width × 0.433,
    // which reached 87% of the viewport on a 3440-wide display.
    expect(css()).toMatch(/\.chartSvg \{[^}]*height: 100%/)
    expect(css()).not.toMatch(/\.chartSvg \{[^}]*height: auto/)
  })

  it('clamps the chart box to a viewport-relative height', () => {
    expect(css()).toMatch(/\.chartShell \{[\s\S]*?height: clamp\([^)]*dvh[^)]*\)/)
  })

  it('fills the screen in fullscreen', () => {
    const s = css()
    expect(s).toMatch(/\.chartShell:fullscreen \{[\s\S]*?height: 100dvh/)
    expect(s).toMatch(/\.chartShell:fullscreen \{[\s\S]*?width: 100vw/)
  })

  it('measures the container rather than the window', () => {
    const s = code('./ChartShell.tsx')
    expect(s).toContain('ResizeObserver')
    expect(s).toContain('contentRect')
    // The window is not the chart: a rail reflow changes one and not the other.
    expect(s).not.toContain('innerWidth')
    expect(s).not.toContain('innerHeight')
  })

  it('falls back to the design box when nothing has been measured', () => {
    // Server render and renderToStaticMarkup have no layout; the markup must
    // still be deterministic, which is what the fixed fallback guarantees.
    expect(render()).toContain('viewBox="0 0 1200 520"')
  })

  it('passes the measured box down to the chart', () => {
    const source = read('./ChartShell.tsx')
    // Both measured dimensions reach the chart. Asserted independently of
    // formatting: what matters is that the measurement is handed down, not
    // that the two props share a line.
    expect(source).toMatch(/width=\{box\?\.width\}/)
    expect(source).toMatch(/height=\{box\?\.height\}/)
    expect(source).toMatch(/<InteractiveMarketChart/)
  })
})

// ─── The rail survives ────────────────────────────────────────────────────────

describe('the analysis rail keeps its place', () => {
  it('scrolls internally instead of stretching the chart to match it', () => {
    const s = read('./AtlasMarketView.module.css')
    expect(s).toMatch(/\.rail \{[\s\S]*?overflow-y: auto/)
    // And nothing is hidden to achieve it. Scoped to the rail's own rule blocks:
    // `[\s\S]*?` ran on past the rule's closing brace, so an unrelated
    // `display: none` anywhere later in the stylesheet read as a hidden rail.
    const railRules = s.match(/\.rail \{[^}]*\}/g) ?? []
    expect(railRules.length).toBeGreaterThan(0)
    for (const rule of railRules) {
      expect(rule).not.toMatch(/display: none/)
    }
  })

  it('gives wide displays width rather than an ever-wider rail', () => {
    const s = read('./AtlasMarketView.module.css')
    // Every two-column breakpoint clamps the rail so the chart takes the rest.
    const columns = s.match(/grid-template-columns: minmax\(0, 1fr\) [^;]+;/g) ?? []
    expect(columns.length).toBeGreaterThanOrEqual(3)
    for (const rule of columns) {
      expect(rule, `rail column not clamped: ${rule}`).toMatch(/clamp\(/)
    }
  })
})

// ─── Chart-first proportions (Phase 17) ───────────────────────────────────────

describe('the chart dominates the workspace', () => {
  const css = () => read('./AtlasMarketView.module.css').replace(/\/\*[\s\S]*?\*\//g, '')

  it('gives the chart the taller clamp, and the rail exactly the same height', () => {
    const s = css()
    const chart = s.match(/\.chartShell \{[^}]*height: (clamp\([^)]*\))/)?.[1]
    expect(chart).toBe('clamp(380px, 60dvh, 760px)')
    // The rail scrolls inside the chart's height rather than outgrowing it.
    const railHeights = [...s.matchAll(/\.rail \{[^}]*max-height: (clamp\([^)]*\))/g)].map((m) => m[1])
    expect(railHeights.length).toBeGreaterThan(0)
    for (const height of railHeights) expect(height).toBe(chart)
  })

  it('sizes the rail against the canvas, never against the viewport', () => {
    const columns = css().match(/grid-template-columns: minmax\(0, 1fr\) [^;]+;/g) ?? []
    expect(columns.length).toBeGreaterThanOrEqual(3)
    for (const rule of columns) {
      // `vw` counted the sidebar and the page padding into the rail's share.
      expect(rule, rule).not.toMatch(/vw/)
      expect(rule, rule).toMatch(/clamp\([^)]*%/)
    }
  })

  it('keeps the narrowest rail no wider than before at 1440px', () => {
    const first = css().match(/grid-template-columns: minmax\(0, 1fr\) clamp\((\d+)px, (\d+)%, (\d+)px\)/)
    expect(first).not.toBeNull()
    const [, min, , max] = first!.map(Number)
    // The previous rail was clamp(280px, 22vw, 340px); the chart-first rail is narrower at both ends.
    expect(min).toBeLessThan(280)
    expect(max).toBeLessThan(340)
  })

  it('starts two columns where the chart can still hold the row, with no gap in coverage', () => {
    const s = css()
    expect(s).toMatch(/@media \(min-width: 1200px\) \{\s*\.canvas \{ grid-template-columns: minmax\(0, 1fr\) clamp\(/)
    // Below two columns the rail is a two-up grid; the ranges meet at 1199/1200.
    expect(s).toMatch(/@media \(min-width: 640px\) and \(max-width: 1199px\)/)
    expect(s).not.toMatch(/@media \(min-width: 1024px\) \{\s*\.canvas/)
  })
})

describe('the plot overlay', () => {
  const css = () => read('./AtlasMarketView.module.css').replace(/\/\*[\s\S]*?\*\//g, '')

  it('renders the setup grade and the safety badges in one overlay row', () => {
    const markup = render()
    const overlay = markup.indexOf('data-testid="chart-overlay"')
    expect(overlay).toBeGreaterThan(-1)
    expect(markup.indexOf('data-testid="chart-setup-grade"')).toBeGreaterThan(overlay)
    expect(markup.indexOf('data-testid="chart-origin-badge"')).toBeGreaterThan(overlay)
  })

  it('stops the overlay row short of the reset and fullscreen controls', () => {
    const rule = css().match(/\.chartOverlayTopLeft \{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/right: calc\(var\(--rhythm-3\) \+ 30px \+ var\(--rhythm-2\) \+ 30px \+ var\(--rhythm-2\)\)/)
    expect(rule).toMatch(/flex-wrap: wrap/)
    expect(rule).toMatch(/pointer-events: none/)
  })

  it('lets the badges wrap one by one beside the grade', () => {
    expect(css()).toMatch(/\.chartBadges \{\s*display: contents;\s*\}/)
  })

  it('responds to the chart\'s own width, and only hides the word "Setup" visually', () => {
    const s = css()
    expect(s).toMatch(/\.chartShell \{[^}]*container-type: inline-size/)
    const query = s.match(/@container \(max-width: 520px\) \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(query).toMatch(/\.chartSetupPrefix \{/)
    // Visually hidden, still in the accessible name — never removed.
    expect(query).toMatch(/clip: rect\(0 0 0 0\)/)
    expect(query).not.toMatch(/display: none|visibility: hidden/)
  })

  it('moves the history status off the overlay row, to the bottom edge', () => {
    const rule = css().match(/\.chartHistoryStatus \{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/bottom: calc\(/)
    expect(rule).not.toMatch(/\btop:/)
  })
})
