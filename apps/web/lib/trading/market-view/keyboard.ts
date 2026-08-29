/**
 * Omnira Trading — Atlas Market View keyboard actions.
 *
 * This module invents NO keyboard vocabulary. Every key meaning and every guard
 * is delegated to `resolveProjectRailKeyAction`, the platform's existing rail
 * convention, called in the two contexts it already defines:
 *
 *   'project-detail'  Esc, safe Backspace     → return to Atlas Home
 *   'atlas'           ArrowLeft / ArrowRight  → move along the current axis
 *
 * The workspace is reached from a rail card, so returning from it behaves like
 * returning from a project: the same two keys, the same editable-target and
 * higher-priority-surface guards, from the same function. Nothing here can drift
 * away from the rail's behaviour, because there is nothing here to drift.
 *
 * `Enter` (the rail's 'open') is deliberately not claimed: inside the workspace
 * there is no card to open, and Enter belongs to whatever control has focus.
 *
 * Chart-specific shortcuts — crosshair, pan, zoom — are Stage 2/3 renderer work
 * and are not invented here.
 */

import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'

export type MarketViewKeyAction = 'previous-instrument' | 'next-instrument' | 'return' | null

export function resolveMarketViewKeyAction(
  event: Pick<
    KeyboardEvent,
    'key' | 'defaultPrevented' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target'
  >,
  doc: Document,
): MarketViewKeyAction {
  // Return first: Esc and safe Backspace mean "go back" everywhere in Omnira,
  // and that reading must win before the axis keys are considered.
  if (resolveProjectRailKeyAction(event, 'project-detail', doc) === 'return') return 'return'

  const move = resolveProjectRailKeyAction(event, 'atlas', doc)
  if (move === 'previous') return 'previous-instrument'
  if (move === 'next') return 'next-instrument'
  return null
}

/** Step through a list with wraparound, matching the rail's `wrapIndex`. */
export function stepIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return ((current + delta) % length + length) % length
}
