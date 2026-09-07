/**
 * Omnira display preferences — display scale and motion.
 *
 * Two presentation preferences the operator controls, resolved in one place so
 * no surface has to interpret raw storage or raw media queries for itself. The
 * rules are pure functions: they take values in and hand answers back, with no
 * DOM, no storage and no React, which is what makes the precedence rules
 * testable directly rather than inferred from a rendered page.
 *
 * WHY DISPLAY SCALE IS NOT CSS `zoom`. The design prototype demonstrated it as
 * `zoom` on the shell root. Measured against this codebase, `zoom` breaks every
 * viewport-unit consumer inside it: at 1.15 a `100dvh` element renders 692px
 * against a 600px viewport and the page scrolls. There are 20+ such consumers
 * in the shell — six in Atlas Home's own stylesheet, more in Trading — and
 * root-level `zoom` does not rescale them either. Scaling the ROOT FONT SIZE
 * instead leaves viewport units, fixed positioning and canvas measurement
 * completely untouched, which is exactly what a specialist chart or graph
 * canvas needs, and still scales the rem-based scale the UI is mostly built on.
 *
 * WHY MOTION IS RESOLVED RATHER THAN READ. The OS preference and the operator's
 * override are two inputs to ONE answer. If CSS consulted the media query while
 * JS consulted storage, the same page could animate in one layer and not in
 * another. `resolveMotion` is that single answer, and every consumer — CSS via
 * a root attribute, JS via the provider — reads its result.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Display scale
// ─────────────────────────────────────────────────────────────────────────────

export const DISPLAY_SCALES = ['compact', 'default', 'large'] as const
export type DisplayScale = (typeof DISPLAY_SCALES)[number]

export const DEFAULT_DISPLAY_SCALE: DisplayScale = 'default'

/**
 * The multiplier each level applies to the root font size.
 *
 * Taken from the design prototype's own ZOOM table, so the levels feel the same
 * as the approved design even though the mechanism differs.
 */
export const DISPLAY_SCALE_FACTORS: Record<DisplayScale, number> = {
  compact: 0.9,
  default: 1,
  large: 1.15,
}

export const DISPLAY_SCALE_LABELS: Record<DisplayScale, string> = {
  compact: 'Kompakt',
  default: 'Standard',
  large: 'Stor',
}

/** Strict allow-list parse. Anything unrecognised is "no opinion", never an error. */
export function parseDisplayScale(value: unknown): DisplayScale | null {
  if (typeof value !== 'string') return null
  return (DISPLAY_SCALES as readonly string[]).includes(value) ? (value as DisplayScale) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion
// ─────────────────────────────────────────────────────────────────────────────

/** What the operator chose. `system` defers to the OS/browser preference. */
export const MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const
export type MotionPreference = (typeof MOTION_PREFERENCES)[number]

/** What everything downstream actually acts on. Only two answers exist. */
export const RESOLVED_MOTIONS = ['reduce', 'full'] as const
export type ResolvedMotion = (typeof RESOLVED_MOTIONS)[number]

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = 'system'

export const MOTION_PREFERENCE_LABELS: Record<MotionPreference, string> = {
  system: 'Följ systemet',
  reduce: 'Reducerad',
  full: 'Full',
}

export const MOTION_PREFERENCE_HINTS: Record<MotionPreference, string> = {
  system: 'Använder enhetens inställning för reducerad rörelse.',
  reduce: 'Stänger av rörelse i Omnira, även om enheten tillåter den.',
  full: 'Behåller rörelse i Omnira, även om enheten begär reducerad.',
}

/** The media query that carries the OS/browser preference. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function parseMotionPreference(value: unknown): MotionPreference | null {
  if (typeof value !== 'string') return null
  return (MOTION_PREFERENCES as readonly string[]).includes(value)
    ? (value as MotionPreference)
    : null
}

/**
 * The one motion answer.
 *
 * An explicit choice always wins over the system preference — that is the whole
 * point of offering the override, in both directions: an operator on a device
 * that requests reduced motion can still ask Omnira for full motion, and an
 * operator on a device that does not can still ask Omnira to stop moving.
 */
export function resolveMotion(
  preference: MotionPreference,
  systemPrefersReducedMotion: boolean,
): ResolvedMotion {
  if (preference === 'reduce') return 'reduce'
  if (preference === 'full') return 'full'
  return systemPrefersReducedMotion ? 'reduce' : 'full'
}

/** Convenience predicate, so call sites read as intent. */
export function isReducedMotion(resolved: ResolvedMotion): boolean {
  return resolved === 'reduce'
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage and DOM contract
// ─────────────────────────────────────────────────────────────────────────────

/** Same `omnira:` namespace the operator-mode preference already uses. */
export const DISPLAY_SCALE_STORAGE_KEY = 'omnira:display-scale'
export const MOTION_STORAGE_KEY = 'omnira:motion'

/**
 * The root attributes every consumer keys off.
 *
 * `data-display-scale` drives the root font size; `data-motion` carries the
 * RESOLVED answer, never the raw preference, so CSS never has to combine two
 * inputs of its own.
 */
export const DISPLAY_SCALE_ATTRIBUTE = 'data-display-scale'
export const MOTION_ATTRIBUTE = 'data-motion'
