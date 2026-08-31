'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TradingMarketViewSnapshot } from '@/lib/trading/market-view'
import { InteractiveMarketChart } from './InteractiveMarketChart'
import { ChartStatusBadges } from './ChartStatusBadges'
import styles from './AtlasMarketView.module.css'

/**
 * The chart's container: it owns the box, and the box owns the geometry.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The chart used to be an SVG with a fixed 1200×520 viewBox and
 * `height: auto`, so its rendered height was always width × 0.433. Height
 * therefore grew with viewport WIDTH — measured at 58% of the viewport on
 * 1080p, 61% on 1440p, and 87% on a 3440-wide ultrawide, where the chart alone
 * was taller than the screen. Wide displays were being spent on height nobody
 * asked for.
 *
 * Now the shell measures itself and hands the box to the chart. CSS decides how
 * tall that box is; extra width becomes extra plot area rather than extra
 * height, which is what a terminal is supposed to do.
 *
 * MEASUREMENT, NOT GUESSWORK
 * ──────────────────────────
 * `ResizeObserver` on the element itself — never `window.innerWidth`. The
 * window is not the chart: a sidebar opening, the rail wrapping, or entering
 * fullscreen all change the chart's box without the window changing at all.
 *
 * Before the first measurement the chart renders at its design size, which is
 * also exactly what a server render and `renderToStaticMarkup` produce. That
 * keeps deterministic markup deterministic.
 */

/**
 * Whether the browser's fullscreen mode owns the Escape key right now.
 *
 * Extracted as a pure function so the rule is testable without a DOM: the
 * workspace's Esc/Backspace navigation must stand down while the chart is
 * fullscreen, or the operator loses the workspace to a key that, in fullscreen,
 * means exactly one thing.
 *
 * Reads the document rather than component state on purpose — a fullscreen exit
 * triggered anywhere else must not leave this stuck on.
 */
export function fullscreenOwnsEscape(doc: Pick<Document, 'fullscreenElement'>): boolean {
  return doc.fullscreenElement !== null
}

/** Below this, a measurement is layout noise rather than a real box. */
const MIN_MEASURED = 120

interface Box {
  readonly width: number
  readonly height: number
}

export function ChartShell({
  snapshot,
  instrument,
  timeframe,
}: {
  snapshot: TradingMarketViewSnapshot
  instrument: string
  timeframe: string
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ─── Measure the container, not the window ──────────────────────────────────
  useEffect(() => {
    const element = shellRef.current
    if (element === null) return
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      const { width, height } = entry.contentRect
      // A collapsed or not-yet-laid-out box would produce nonsense geometry.
      if (width < MIN_MEASURED || height < MIN_MEASURED) return
      setBox((current) =>
        current !== null && Math.round(current.width) === Math.round(width)
          && Math.round(current.height) === Math.round(height)
          ? current
          : { width: Math.round(width), height: Math.round(height) },
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /*
   * Fullscreen state is read from the document, never assumed.
   *
   * A boolean we set ourselves drifts the moment the user presses Esc, or the
   * browser exits fullscreen for its own reasons — and then the exit button
   * lies about what it does. `document.fullscreenElement` is the only thing
   * that actually knows.
   */
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === shellRef.current)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const element = shellRef.current
    if (element === null) return
    if (document.fullscreenElement === element) {
      // Failure here is not actionable for the operator: the listener above
      // keeps the button honest either way.
      void document.exitFullscreen?.()
      return
    }
    void element.requestFullscreen?.()
  }, [])

  const label = isFullscreen ? 'Stäng helskärm' : 'Öppna graf i helskärm'

  return (
    <div
      ref={shellRef}
      className={styles.chartShell}
      data-fullscreen={isFullscreen || undefined}
      data-testid="chart-shell"
    >
      <InteractiveMarketChart
        snapshot={snapshot}
        width={box?.width}
        height={box?.height}
      />

      <ChartStatusBadges snapshot={snapshot} />

      <div className={styles.chartShellControls}>
        {/*
          Instrument and timeframe only. Fullscreen is for reading the chart, so
          the normal header is deliberately not recreated here.
        */}
        {isFullscreen ? (
          <span className={styles.chartShellContext} data-testid="chart-shell-context">
            {instrument} · {timeframe}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.chartShellButton}
          onClick={toggleFullscreen}
          aria-label={label}
          title={label}
          data-testid="chart-fullscreen-toggle"
          data-state={isFullscreen ? 'fullscreen' : 'normal'}
        >
          <span aria-hidden="true">{isFullscreen ? '⤡' : '⤢'}</span>
        </button>
      </div>
    </div>
  )
}
