/**
 * lib/atlas/executive/http.ts — the Executive authority HTTP adapter seam.
 *
 * EI-S1.5B found the Stage-1 authority chain structurally correct and
 * completely unreachable: Authorization V1, Decision Ledger V1 and Mission
 * Brief V1 all had sanctioned principal-scoped write boundaries with no route,
 * server action, script or UI able to call them. This module is the smallest
 * safe way to reach them.
 *
 * IT IS AN ADAPTER, NOT A POLICY ENGINE. It performs transport concerns —
 * same-origin, JSON parsing, field allowlisting, status→HTTP mapping — and
 * nothing else. Every authority decision stays in `principal-write.ts`, which
 * derives the human from the session itself and re-proves authority against
 * live Authorization V1. Removing this file would remove reachability, never
 * a security control.
 *
 * THE FIELD ALLOWLIST IS THE LOAD-BEARING PART. The domain argument types
 * carry test-only dependency injection — `store`, `now`, `projectMode`,
 * `availability` — and `now` is a plain JSON string that feeds
 * `isAuthorizationEffective(..., { now })`. A single `fn({ ...body })` would
 * therefore let an HTTP caller forge the clock and make an expired or
 * not-yet-effective grant appear effective. So no request object is ever
 * forwarded: `pick()` copies only named keys, and `RESERVED_FIELDS` rejects
 * the dangerous names outright so misuse is visible rather than silently
 * dropped.
 */

import 'server-only'

import { NextResponse } from 'next/server'

// ── Reserved fields ───────────────────────────────────────────────────────────

/**
 * Names an HTTP caller may never supply, in three groups:
 *
 *   dependency injection  store, now, projectMode, availability — test seams
 *                         that would substitute the ledger, forge the clock,
 *                         fake the project mode or fake capability proof
 *   authority identity    principalId, userId, ownerId, actorId, humanId — the
 *                         principal comes from the session, never the body
 *   authority binding     target, authority, targetType, targetId, versionHash,
 *                         actionKind, binding — all server-derived from a
 *                         prepared candidate; accepting any of them would hand
 *                         the caller back control of what they are authorizing
 */
export const RESERVED_FIELDS = [
  'store', 'now', 'projectMode', 'availability',
  'principalId', 'userId', 'ownerId', 'actorId', 'humanId',
  'target', 'authority', 'targetType', 'targetId', 'versionHash', 'actionKind', 'binding',
  'decisionProvenance', 'authorityRecord',
] as const

/**
 * `exempt` exists for exactly one collision, and is deliberately awkward to use.
 *
 * `authority` names two unrelated things. On the Authorization and Decision
 * routes it would be a raw `RequestedAuthority` — `{ actionKind, description }`
 * — which must never be client-supplied. But `MissionBriefInput.authority` is
 * `MissionActionBound[]` — `{ action, note? }` — a legitimate part of a Mission
 * Brief that a human writes. Dropping `authority` from the reserved list
 * globally would weaken Decision and Authorization to fix Mission, so the
 * exemption is granted per-request, only by the Mission route, and only for
 * `open`.
 */
export function reservedFieldIn(
  body: Record<string, unknown>,
  exempt: readonly string[] = [],
): string | null {
  for (const key of RESERVED_FIELDS) {
    if (exempt.includes(key)) continue
    if (Object.prototype.hasOwnProperty.call(body, key)) return key
  }
  return null
}

/**
 * Copy ONLY the named keys. The one sanctioned way to build domain args here.
 *
 * Deliberately a pick and not a spread-minus-denylist: a denylist fails open
 * when the domain adds a new injection field, a pick fails closed.
 */
export function pick<T>(
  body: Record<string, unknown>,
  allowed: readonly string[],
): T {
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      out[key] = body[key]
    }
  }
  return out as T
}

// ── Same-origin gate ──────────────────────────────────────────────────────────

/**
 * EI-S1.6B-R1 ruling: MINIMAL_SAME_ORIGIN_GATE_REQUIRED, scoped to these routes.
 *
 * The Supabase auth cookie inherits `@supabase/ssr`'s default `sameSite: 'lax'`,
 * which does block the classic cross-site POST — but the application never sets
 * it, never tests it, and would lose it silently if anyone passed
 * `cookieOptions` or moved auth to a shared parent domain. For endpoints that
 * write institutional authority, depending solely on an inherited default we do
 * not assert is the wrong trade when the check is this cheap.
 *
 * This is edge protection. It does NOT replace session authentication or
 * project authority, both of which live in the domain boundary.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin')
  if (!origin) return forbidden()

  let claimed: string
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return forbidden()
    // `URL.origin` is scheme + host + non-default port, already normalized.
    claimed = parsed.origin
  } catch {
    return forbidden()
  }

  const effective = effectiveOrigin(request)
  if (!effective || claimed !== effective) return forbidden()

  return null
}

/**
 * The request's own origin — scheme AND host AND port.
 *
 * Comparing hosts alone is not a same-origin check: `http://omnira.example`
 * and `https://omnira.example` share a host and are different origins, so a
 * plaintext page could have posted to the HTTPS authority endpoint. `URL.host`
 * carries the port but never the scheme, which is exactly the gap.
 *
 * Behind Vercel the user-facing scheme and host arrive in `x-forwarded-proto`
 * and `x-forwarded-host`, so they are preferred — but parsed defensively. A
 * forwarded header may legitimately be a comma-separated list when several
 * proxies append to it, and the value a caller can most easily influence is the
 * LAST one; only the first hop is trustworthy here. Anything malformed, empty
 * or unexpected fails closed rather than falling back to a weaker comparison.
 */
function effectiveOrigin(request: Request): string | null {
  const firstHop = (value: string | null): string | null => {
    if (value === null) return null
    const first = value.split(',')[0].trim()
    return first.length > 0 ? first : null
  }

  const forwardedProto = firstHop(request.headers.get('x-forwarded-proto'))
  const forwardedHost = firstHop(request.headers.get('x-forwarded-host'))

  let scheme: string
  if (forwardedProto !== null) {
    if (forwardedProto !== 'http' && forwardedProto !== 'https') return null
    scheme = forwardedProto
  } else {
    try {
      const self = new URL(request.url)
      if (self.protocol !== 'http:' && self.protocol !== 'https:') return null
      scheme = self.protocol.slice(0, -1)
    } catch {
      return null
    }
  }

  const host = forwardedHost ?? firstHop(request.headers.get('host'))
  if (!host) return null

  try {
    const normalized = new URL(`${scheme}://${host}`)
    // A host header carrying anything but authority is malformed for this use.
    if (normalized.pathname !== '/' || normalized.search || normalized.hash) return null
    if (normalized.host !== host.toLowerCase()) return null
    return normalized.origin
  } catch {
    return null
  }
}

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

// ── Result mapping ────────────────────────────────────────────────────────────

/**
 * `not_permitted` and `project_denied` both become an identical 404.
 *
 * This is the information-leak contract, and it is why the two are not split:
 * `not_permitted` already means "unknown OR foreign" inside the domain, and
 * splitting them at HTTP would rebuild the existence oracle the domain
 * deliberately collapsed. The body is a fixed literal so the two cannot drift
 * apart by accident.
 */
const NOT_FOUND = { error: 'Not found' } as const

/**
 * Statuses whose DOMAIN-supplied `detail` is safe to surface.
 *
 * Only `invalid_lifecycle`, whose detail is the prior lifecycle status — a
 * closed enum the caller is entitled to know. `invalid_request` is deliberately
 * NOT here: its detail is whatever a builder's `Error.message` happened to say,
 * which is domain-authored rather than domain-guaranteed, so it could carry
 * input or storage text. This route's OWN validation details (`badRequest`)
 * are fixed literals written here and stay safe by construction — the
 * distinction is authorship, not status.
 */
const DETAIL_SAFE = new Set(['invalid_lifecycle'])

/**
 * The shape every Executive write boundary returns. Structural, not nominal:
 * the three domains have their own status unions, and this is the common
 * subset the adapter needs. `missing` appears only on Mission requirement
 * failures and is a typed list the domain builds itself.
 */
export interface DomainResult {
  status: string
  detail?: string
  missing?: unknown
  /** The derived state on success. Shape differs per domain; opaque here. */
  state?: unknown
}

const STATUS_HTTP: Record<string, number> = {
  no_principal: 401,
  project_denied: 404,
  not_permitted: 404,
  invalid_request: 400,
  not_ledger_material: 422,
  outcome_required: 422,
  review_required: 422,
  activation_incomplete: 422,
  completion_incomplete: 422,
  governing_decision_invalid: 422,
  invalid_successor: 422,
  authority_not_effective: 403,
  authority_principal_mismatch: 403,
  invalid_lifecycle: 409,
  project_mode_changed: 409,
  project_mode_not_operational: 409,
  conflict: 409,
  integrity_violation: 500,
  unavailable: 503,
}

/** Map a domain refusal to HTTP. Never echoes storage text or a stack. */
export function mapFailure(result: DomainResult): NextResponse {
  const { status, detail } = result
  if (status === 'no_principal') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (status === 'project_denied' || status === 'not_permitted') {
    return NextResponse.json(NOT_FOUND, { status: 404 })
  }

  const http = STATUS_HTTP[status] ?? 400
  const body: Record<string, unknown> = { error: status }

  /**
   * Even a detail we believe is safe must LOOK safe. `invalid_lifecycle` carries
   * the prior lifecycle status, a short lowercase token — so the shape is
   * enforced rather than assumed. Anything longer, spaced or punctuated is
   * dropped, which makes the no-leak guarantee structural instead of dependent
   * on the domain continuing to behave.
   */
  const SAFE_TOKEN = /^[a-z][a-z0-9_]{0,39}$/

  // `missing` is a typed requirement list the domain builds itself (§20.106,
  // §20.92) — safe, and the caller cannot act without it.
  if (Array.isArray(result.missing)) body.missing = result.missing
  if (detail && DETAIL_SAFE.has(status) && SAFE_TOKEN.test(detail)) body.detail = detail

  return NextResponse.json(body, { status: http })
}

// ── Request helpers ───────────────────────────────────────────────────────────

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request', detail: 'malformed_json' }, { status: 400 })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'invalid_request', detail: 'body_must_be_object' }, { status: 400 })
  }
  return parsed as Record<string, unknown>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function badRequest(detail: string): NextResponse {
  return NextResponse.json({ error: 'invalid_request', detail }, { status: 400 })
}

export function unknownAction(): NextResponse {
  return NextResponse.json({ error: 'invalid_request', detail: 'unknown_action' }, { status: 400 })
}

/** Non-empty, bounded string. Domain validation stays authoritative beyond this. */
export function isText(value: unknown, max = 10_000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}
