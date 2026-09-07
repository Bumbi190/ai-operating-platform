'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  keyboardHintsFor,
  shouldRenderKeyboardHints,
  visibleKeyboardHints,
} from '@/lib/nav/keyboard-hints'
import type { OmniraUiGeneration } from '@/lib/ui/generation'
import { DISPLAY_SCALE_ATTRIBUTE } from '@/lib/ui/display-preferences'
import { KeyboardHintList } from './KeyboardHintList'
import styles from './KeyboardHints.module.css'

interface KeyboardHintsProps {
  /**
   * Resolved server-side by the platform layout — never parsed here, the same
   * contract the sidebar, breadcrumbs and the mobile nav already follow.
   */
  uiGeneration: OmniraUiGeneration
}

/**
 * How many hints fit, measured in rem rather than px.
 *
 * This is the part display scale would otherwise break. A hint's width is set
 * by its font size, so at Large every hint is ~15% wider while the viewport is
 * unchanged — px thresholds would keep the same count and the last hints would
 * be clipped by the bar's `overflow: hidden` instead of dropped by priority.
 * Dividing by the root font size makes the budget scale with the text: the
 * thresholds below are in rem, so Large simply shows fewer hints.
 *
 * A count rather than a per-hint measurement: hints are short and of similar
 * length, and measuring each one would mean a layout read on every resize to
 * decide something these thresholds already decide correctly.
 */
export function capacityForRemWidth(remWidth: number): number {
  if (remWidth < 35) return 2
  if (remWidth < 56) return 3
  if (remWidth < 80) return 5
  return 8
}

function currentCapacity(): number {
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return capacityForRemWidth(window.innerWidth / rootFontSize)
}

/**
 * The shell's keyboard hint strip.
 *
 * Presentation only. It registers no keyboard listener and owns no shortcut —
 * every binding it names belongs to the surface that implements it, and keeps
 * working whether or not this is on screen. `aria-hidden` for exactly that
 * reason: it is a visual reminder of behaviour assistive technology reaches
 * through the controls themselves, and reading a row of key caps out on every
 * navigation would be noise rather than help.
 */
export function KeyboardHints({ uiGeneration }: KeyboardHintsProps) {
  const pathname = usePathname()
  // Start at the widest capacity so the server and the first client render
  // agree; the effect narrows it once the real width is known.
  const [capacity, setCapacity] = useState(8)

  useEffect(() => {
    const measure = () => setCapacity(currentCapacity())
    measure()
    window.addEventListener('resize', measure, { passive: true })
    // The display-scale preference changes the root font size without changing
    // the viewport, so a resize listener alone would never re-measure.
    const scaleObserver = new MutationObserver(measure)
    scaleObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [DISPLAY_SCALE_ATTRIBUTE, 'style'],
    })
    return () => {
      window.removeEventListener('resize', measure)
      scaleObserver.disconnect()
    }
  }, [])

  if (!shouldRenderKeyboardHints(pathname, uiGeneration)) return null

  const hints = visibleKeyboardHints(keyboardHintsFor(pathname), capacity)
  if (hints.length === 0) return null

  return (
    <div className={styles.bar} aria-hidden="true">
      <KeyboardHintList hints={hints} />
    </div>
  )
}
