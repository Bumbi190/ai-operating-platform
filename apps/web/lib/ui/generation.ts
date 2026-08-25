/**
 * Omnira UI generation — the canonical resolver for which UI a request renders.
 *
 * Omnira ships two UI generations side by side while vNext is under
 * development. This module is the ONLY place that interprets what "vnext" or
 * "legacy" means; call sites resolve through it rather than reading `?ui=` or
 * the cookie themselves.
 *
 * Resolution order:
 *   1. a valid `?ui=` query value — wins for the current request
 *   2. a valid `omnira_ui` cookie — carries the choice across navigation
 *   3. legacy — the fail-closed default
 *
 * A malformed or unknown value at either layer is treated as "no opinion"
 * rather than as an error: the query falls through to the cookie, and the
 * cookie falls through to legacy. vNext is never reached by accident.
 *
 * SCOPE — this selects a UI generation and nothing else. It must never grant
 * authorization, bypass authentication, widen project scope, alter Executive
 * authority, or modify permissions, and it must never be read as a security
 * boundary. Authentication and authorization are unchanged by it.
 */

export const OMNIRA_UI_COOKIE = 'omnira_ui'

export const OMNIRA_UI_GENERATIONS = ['legacy', 'vnext'] as const

export type OmniraUiGeneration = (typeof OMNIRA_UI_GENERATIONS)[number]

/** Fail-closed default: the existing UI stays the fallback. */
export const DEFAULT_UI_GENERATION: OmniraUiGeneration = 'legacy'

/** 180 days — long enough to survive a development cycle, short of permanent. */
export const OMNIRA_UI_COOKIE_MAX_AGE = 60 * 60 * 24 * 180

/**
 * Strict allow-list parse. Anything that is not exactly one of the known
 * generation names returns null — including empty strings, casing variants and
 * non-string values.
 */
export function parseUiGeneration(value: unknown): OmniraUiGeneration | null {
  if (typeof value !== 'string') return null
  return (OMNIRA_UI_GENERATIONS as readonly string[]).includes(value)
    ? (value as OmniraUiGeneration)
    : null
}

/**
 * Next.js hands `searchParams` values through as `string | string[]`. A
 * repeated parameter (`?ui=a&ui=b`) resolves from the first entry only, so a
 * junk leading value cannot be rescued by appending a valid one.
 */
export function parseUiGenerationParam(
  value: string | string[] | null | undefined,
): OmniraUiGeneration | null {
  if (Array.isArray(value)) return value.length > 0 ? parseUiGeneration(value[0]) : null
  return parseUiGeneration(value)
}

export interface UiGenerationInput {
  /** Raw `?ui=` value for this request, if any. */
  query?: string | string[] | null
  /** Raw `omnira_ui` cookie value, if any. */
  cookie?: string | null
}

/**
 * Resolve the generation for a request. Safe to call with nothing — an empty
 * input resolves to the default.
 */
export function resolveUiGeneration(input: UiGenerationInput = {}): OmniraUiGeneration {
  return (
    parseUiGenerationParam(input.query)
    ?? parseUiGeneration(input.cookie)
    ?? DEFAULT_UI_GENERATION
  )
}

/** Convenience predicate so call sites read as intent, not string comparison. */
export function isVNext(generation: OmniraUiGeneration): boolean {
  return generation === 'vnext'
}
