/**
 * lib/atlas/knowledge/projection/canonical-json.ts — deterministic JSON bytes.
 *
 * Two serializers, one value domain. Same input, byte-identical output, on every
 * machine and every Node/ICU build. These bytes are hashed into `snapshot_id`,
 * so "equivalent JSON" is not good enough — the bytes themselves are the
 * contract, and a second implementation in another language must be able to
 * reproduce them from this file's rules alone.
 *
 * ── stableJson IS FORBIDDEN HERE ─────────────────────────────────────────────
 * `lib/architecture-knowledge/hash.ts` exports `stableJson`, which is the
 * obvious thing to reach for and is wrong for this job: it orders keys with
 * `a.localeCompare(b)`. That is locale- and ICU-version dependent, so the same
 * input could hash differently after a Node upgrade. It is fine for the
 * committed, human-read architecture artifacts it was written for. It must never
 * produce hash-addressed snapshot bytes.
 *
 * ── WHY THE VALUE DOMAIN IS SO NARROW ────────────────────────────────────────
 * Every rejection below exists because `JSON.stringify` would otherwise SILENTLY
 * drop, coerce, reorder or execute something:
 *
 *   undefined / function / symbol value  → key silently disappears
 *   symbol-keyed property                → silently ignored
 *   non-enumerable own property          → silently ignored
 *   accessor property                    → invokes caller code during hashing
 *   own toJSON                           → the value rewrites its own bytes
 *   Date / Map / Set / class instance    → coerced, or emitted as {}
 *   NaN / Infinity                       → coerced to null
 *   -0                                   → collapses to 0
 *   non-integer / unsafe integer         → float formatting is a portability trap
 *   array hole                           → silently emitted as null
 *   non-index own property on an array   → silently dropped
 *   array-index key on a plain object    → SEE BELOW
 *
 * A silent drop during a hash is the worst possible failure: the artifact still
 * looks well-formed, and the missing field is invisible until someone asks why
 * production knowledge is incomplete. Every one of these throws instead.
 *
 * ── THE ARRAY-INDEX KEY RULE IS NOT PEDANTRY ─────────────────────────────────
 * JavaScript orders integer-like own keys numerically and BEFORE string keys,
 * whatever the insertion order:
 *
 *   JSON.stringify({ "10": 1, "9": 2, "b": 3, "a": 4 })
 *     → {"9":2,"10":1,"b":3,"a":4}
 *
 * Code-unit ordering says `"10" < "9"`. So for such keys the engine's ordering
 * and this module's documented ordering DISAGREE, and no amount of pre-sorting
 * can fix it — the reordering happens inside the object, after the sort. The
 * output would still be deterministic in Node, but a verifier written from this
 * spec in Python or Go would sort by code point and produce different bytes.
 * Rather than document an exception nobody would notice, array-index keys are
 * rejected, which keeps `JSON.stringify(deepCanonicalValue(v))` exactly true to
 * the documented ordering for every value this module accepts.
 */

/** Thrown when a value cannot be canonically serialized. Never swallowed. */
export class CanonicalValueError extends Error {
  /** Where in the value the problem is, e.g. `$.scope.projectId`. */
  readonly valuePath: string

  constructor(message: string, valuePath: string) {
    super(`${message} (at ${valuePath})`)
    this.name = 'CanonicalValueError'
    this.valuePath = valuePath
  }
}

/**
 * An array-index key per the language spec: a canonical decimal string for an
 * integer in [0, 2^32 - 1). `"01"`, `"-1"` and `"1.5"` are ordinary string keys.
 */
export function isArrayIndexKey(key: string): boolean {
  const n = Number(key)
  return Number.isInteger(n) && n >= 0 && n < 4294967295 && String(n) === key
}

function typeNameOf(value: object): string {
  const ctor = (value as { constructor?: { name?: string } }).constructor
  return typeof ctor?.name === 'string' && ctor.name ? ctor.name : 'object'
}

function canonicalizeArray(arr: unknown[], at: string, active: Set<object>): unknown[] {
  if (Object.getPrototypeOf(arr) !== Array.prototype) {
    throw new CanonicalValueError('array subclasses are not canonical values', at)
  }
  if (Object.getOwnPropertySymbols(arr).length > 0) {
    throw new CanonicalValueError(
      'array carries symbol-keyed own properties, which JSON.stringify silently ignores', at,
    )
  }
  for (const name of Object.getOwnPropertyNames(arr)) {
    if (name === 'length') continue
    if (!isArrayIndexKey(name)) {
      throw new CanonicalValueError(
        `array carries non-index own property "${name}", which JSON.stringify silently drops`, at,
      )
    }
  }

  const out: unknown[] = []
  for (let i = 0; i < arr.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(arr, i)
    if (descriptor === undefined) {
      throw new CanonicalValueError(
        `array hole at index ${i}; JSON.stringify silently emits null for it`, at,
      )
    }
    if (!('value' in descriptor)) {
      throw new CanonicalValueError(`array index ${i} is an accessor property`, at)
    }
    // Arrays keep DECLARED order. Order is data here, never something to sort.
    out.push(canonicalize(arr[i], `${at}[${i}]`, active))
  }
  return out
}

function canonicalizeObject(obj: object, at: string, active: Set<object>): Record<string, unknown> {
  const proto = Object.getPrototypeOf(obj)
  // Object.prototype and null, deliberately and only these. A null prototype is
  // the repo's existing idiom for a prototype-safe lookup map (the projection
  // report's --project-map loads into Object.create(null)), so refusing it would
  // push callers back toward plain objects for exactly the data most likely to
  // carry attacker-influenced keys. Any OTHER prototype — Date, Map, Set, a
  // class instance — is rejected by this one rule.
  if (proto !== Object.prototype && proto !== null) {
    throw new CanonicalValueError(
      `${typeNameOf(obj)} is not a plain object; only Object.prototype and null prototypes are canonical`,
      at,
    )
  }
  if (Object.getOwnPropertySymbols(obj).length > 0) {
    throw new CanonicalValueError(
      'object carries symbol-keyed own properties, which JSON.stringify silently ignores', at,
    )
  }

  const names = Object.getOwnPropertyNames(obj)
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, name)!
    if (!descriptor.enumerable) {
      throw new CanonicalValueError(
        `own property "${name}" is non-enumerable, which JSON.stringify silently drops`, at,
      )
    }
    if (!('value' in descriptor)) {
      throw new CanonicalValueError(
        `own property "${name}" is an accessor; hashing it would invoke caller code`, at,
      )
    }
    if (name === 'toJSON') {
      throw new CanonicalValueError(
        'own "toJSON" property would let the value rewrite its own serialized bytes', at,
      )
    }
    if (isArrayIndexKey(name)) {
      throw new CanonicalValueError(
        `own property "${name}" is an array-index key; JS orders these numerically and before ` +
          'string keys, which would silently contradict the documented code-unit key order',
        at,
      )
    }
  }

  // Default Array#sort comparator on strings IS UTF-16 code-unit ordering.
  // Never pass a comparator here: localeCompare / Intl would make these bytes
  // depend on the machine's ICU data.
  const sorted = names.slice().sort()

  // Object.create(null), NOT {}. On a plain accumulator, `out['__proto__'] = v`
  // invokes the inherited __proto__ setter: it sets the prototype and creates NO
  // own property, so a document legitimately carrying a "__proto__" key would
  // lose it silently and hash as if the key had never existed.
  const out = Object.create(null) as Record<string, unknown>
  for (const key of sorted) {
    out[key] = canonicalize((obj as Record<string, unknown>)[key], `${at}.${key}`, active)
  }
  return out
}

function canonicalize(value: unknown, at: string, active: Set<object>): unknown {
  if (value === null) return null

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number': {
      // -0 first: Number.isSafeInteger(-0) is true, so the general check misses it.
      if (Object.is(value, -0)) {
        throw new CanonicalValueError('-0 is not canonical; JSON.stringify collapses it to 0', at)
      }
      if (!Number.isSafeInteger(value)) {
        throw new CanonicalValueError(
          `${String(value)} is not a safe integer; only exact integers are canonical`, at,
        )
      }
      return value
    }
    case 'undefined':
      throw new CanonicalValueError(
        'undefined is not a canonical value; JSON.stringify silently drops it', at,
      )
    case 'bigint':
      throw new CanonicalValueError('BigInt is not a canonical value', at)
    case 'function':
      throw new CanonicalValueError(
        'function is not a canonical value; JSON.stringify silently drops it', at,
      )
    case 'symbol':
      throw new CanonicalValueError(
        'symbol is not a canonical value; JSON.stringify silently drops it', at,
      )
    default:
      break
  }

  const obj = value as object

  // ── cycle vs DAG ───────────────────────────────────────────────────────────
  // ACTIVE-RECURSION-PATH membership, not "seen anywhere". A `seen` set shared
  // across the whole traversal would reject a perfectly ordinary shared
  // reference — `{ a: shared, b: shared }` — which is a DAG, not a cycle, and
  // must serialize exactly like the duplicated tree. Only a value that contains
  // ITSELF along the current descent is a cycle.
  if (active.has(obj)) {
    throw new CanonicalValueError('value contains itself; a true cycle cannot be serialized', at)
  }
  active.add(obj)
  try {
    return Array.isArray(obj)
      ? canonicalizeArray(obj, at, active)
      : canonicalizeObject(obj, at, active)
  } finally {
    // finally, so the unwind always releases the node and a sibling reference to
    // the same object is not mistaken for a cycle.
    active.delete(obj)
  }
}

/**
 * Validate and deep-clone into canonical form: object keys recursively sorted by
 * UTF-16 code unit, arrays in declared order. Throws CanonicalValueError on
 * anything outside the domain.
 */
export function deepCanonicalValue(value: unknown): unknown {
  return canonicalize(value, '$', new Set<object>())
}

/**
 * Compact canonical JSON: no insignificant whitespace, NO terminal newline.
 * Used for each JSONL record and for the snapshot identity preimage.
 */
export function canonicalCompactJson(value: unknown): string {
  return JSON.stringify(deepCanonicalValue(value))
}

/**
 * Pretty canonical JSON: 2-space indent, exactly one terminal LF, no BOM.
 * Used for knowledge-manifest.json, which humans read in review.
 */
export function canonicalPrettyJson(value: unknown): string {
  return `${JSON.stringify(deepCanonicalValue(value), null, 2)}\n`
}

/** UTF-8 bytes of a canonical string. Encoding is explicit, never implied. */
export function utf8Bytes(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}
