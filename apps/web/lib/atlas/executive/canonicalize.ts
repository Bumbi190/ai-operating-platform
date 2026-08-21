/**
 * EXECUTIVE TRANSPORT CANONICALIZATION (EI-HTTP-DTO-01).
 *
 * HTTP JSON has no types. A TypeScript signature on a domain function is a
 * compile-time claim about a value the compiler never sees at runtime, so an
 * `as` cast at an API boundary asserts a shape rather than establishing one.
 *
 * The Executive domains persist IMMUTABLE records, and `binding.ts` /
 * `missionBoundProjection` fold their material structured fields into the hash a
 * later human authorization is bound to. An unknown key that rides in on a
 * caller-owned nested object is therefore not transport noise: it becomes part
 * of institutional authority, permanently, and contributes to what a human is
 * asked to authorize.
 *
 * The domain builders are not the place to stop it. Their validators — Mission
 * `validateActionBounds` / `validateSuccessCriteria`, Decision `validateEvidence`
 * / `validateSnapshot` / `validateAlternatives` / `validateReview` /
 * `validateOutcome`, Authorization's condition checks — verify selected
 * properties and then RETURN THE CALLER'S OWN OBJECT. That is correct for
 * trusted in-process callers and insufficient for HTTP.
 *
 * THE RULE, applied uniformly here:
 *
 *   HTTP JSON → runtime validation → RECONSTRUCTION into the exact canonical
 *   domain shape → principal-write boundary.
 *
 * Reconstruction, never filtering. A parser builds a fresh object containing
 * only the keys its spec names, so an unknown property cannot survive by riding
 * on an object we merely inspected. There is deliberately no spread of caller
 * input anywhere in this file.
 *
 * These parsers adjudicate SHAPE only. Lifecycle, authority and business
 * semantics stay with the domain, which remains authoritative; a value that is
 * structurally canonical here can still be rejected there.
 */

/** Sentinel for "this value is not canonical". Distinct from `null`, which is a legal value. */
export const REJECT = Symbol('reject')
export type Parser<T> = (value: unknown) => T | typeof REJECT

export function isRejected<T>(value: T | typeof REJECT): value is typeof REJECT {
  return value === REJECT
}

// ── Primitives ───────────────────────────────────────────────────────────────

/**
 * Any string. Emptiness is deliberately NOT judged here: the domain's
 * `requireText` already owns that rule, and duplicating it in transport would
 * invent a second source of truth that could drift.
 */
export const str: Parser<string> = v => (typeof v === 'string' ? v : REJECT)

/**
 * Non-empty string. Used only where an earlier reviewed phase already refused
 * blank input at transport (Mission action bounds), so that behaviour is
 * preserved exactly rather than quietly delegated to the domain.
 */
export const text: Parser<string> = v =>
  typeof v === 'string' && v.trim().length > 0 ? v : REJECT

export const bool: Parser<boolean> = v => (typeof v === 'boolean' ? v : REJECT)

/** Finite integer. Rejects NaN, Infinity and fractional values. */
export const int: Parser<number> = v =>
  typeof v === 'number' && Number.isInteger(v) ? v : REJECT

/** A closed vocabulary the domain already defines. Anything else is rejected. */
export function enumOf<const T extends readonly string[]>(values: T): Parser<T[number]> {
  const allowed = new Set<string>(values)
  return v => (typeof v === 'string' && allowed.has(v) ? (v as T[number]) : REJECT)
}

/** `T | null`. Used where the domain type itself admits null. */
export function nullable<T>(inner: Parser<T>): Parser<T | null> {
  return v => (v === null ? null : inner(v))
}

/** Homogeneous array. One bad element rejects the whole array. */
export function arrayOf<T>(inner: Parser<T>): Parser<T[]> {
  return v => {
    if (!Array.isArray(v)) return REJECT
    const out: T[] = []
    for (const entry of v) {
      const parsed = inner(entry)
      if (isRejected(parsed)) return REJECT
      out.push(parsed)
    }
    return out
  }
}

// ── Object reconstruction ────────────────────────────────────────────────────

export interface FieldSpec<T> {
  parser: Parser<T>
  /** Absent key is allowed. An absent key is NOT emitted — absent stays absent. */
  optional?: boolean
}

export type ObjectSpec = Record<string, FieldSpec<unknown>>

/**
 * Build a parser that RECONSTRUCTS an object from a spec.
 *
 * Only keys named in the spec are emitted. A required key that is missing
 * rejects; an optional key that is absent stays absent rather than becoming
 * `undefined`, because `{ action }` and `{ action, note: undefined }` are not
 * the same record once hashed.
 */
export function objectOf<T>(spec: ObjectSpec): Parser<T> {
  const entries = Object.entries(spec)
  return value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return REJECT
    const input = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, field] of entries) {
      if (!(key in input)) {
        if (field.optional) continue
        return REJECT
      }
      const parsed = field.parser(input[key])
      if (isRejected(parsed)) return REJECT
      out[key] = parsed
    }
    return out as T
  }
}

/** Required field. */
export const f = <T>(parser: Parser<T>): FieldSpec<T> => ({ parser })
/** Optional field; absent stays absent. */
export const opt = <T>(parser: Parser<T>): FieldSpec<T> => ({ parser, optional: true })
/** Optional field whose domain type admits null. */
export const optNull = <T>(parser: Parser<T>): FieldSpec<T | null> =>
  ({ parser: nullable(parser), optional: true })
