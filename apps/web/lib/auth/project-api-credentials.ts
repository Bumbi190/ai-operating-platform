/**
 * Project API credentials — least-privilege machine authentication.
 *
 * This is the only machine-to-machine credential class that establishes a
 * PROJECT PRINCIPAL and scopes external project actions to it. Other machine
 * and security classes exist and are unrelated: cron authenticates over
 * `CRON_SECRET`, and the webhook routes verify provider signatures.
 *
 * `/api/business/leads` is this credential path's current consumer, and
 * Familje-Stunden's `send-pyssel-lead` its current production caller.
 *
 * ── WHAT THIS FIXED ──────────────────────────────────────────────────────────
 *
 * The global-key helper it replaced returned `{ ok: true }`. It proved that the
 * caller held the one shared secret and established no principal, so there was
 * no subject to scope and no project to bind to. This module returns a
 * `ProjectApiPrincipal` instead: a credential id, the ONE project it speaks
 * for, and the exact actions it may perform. Scoping becomes expressible
 * rather than aspirational.
 *
 * ── TOKEN FORMAT ─────────────────────────────────────────────────────────────
 *
 *   omn_<16 hex>_<43 char base64url>
 *   └┬─┘ └───┬──┘ └────────┬───────┘
 *    │       │             └─ secret: 32 bytes (256 bits) of CSPRNG output
 *    │       └─ public lookup handle: 8 bytes, NOT secret
 *    └─ format marker
 *
 * Splitting lookup from secret is what makes verification a single indexed row
 * fetch. Without a public handle, authentication would have to read every
 * credential and hash-compare against each one — O(n) crypto per request and a
 * far larger timing surface. The handle is stored in `key_prefix` in clear
 * precisely because it authorizes nothing.
 *
 * ── WHY SHA-256 AND NOT bcrypt/argon2/scrypt ─────────────────────────────────
 *
 * Password KDFs exist to make GUESSING expensive, because human-chosen secrets
 * occupy a tiny, heavily-biased region of the search space. This secret is 256
 * bits of `randomBytes` output: an attacker holding the full hash table faces
 * 2^256 candidates, and no work factor changes that arithmetic. A KDF would add
 * deliberate latency to every API request and buy nothing. This is the same
 * reasoning behind how GitHub and Stripe store API tokens.
 *
 * The property that DOES matter is one-wayness — a leaked database must not
 * yield usable credentials — and SHA-256 provides it. It is also already this
 * repository's canonical hash primitive (the Atlas `binding.ts` modules,
 * `lib/architecture-knowledge/hash.ts`), so this introduces no new crypto and
 * invents none.
 *
 * The comparison is still constant-time. Timing-safe compare here defends the
 * stored hash rather than the secret, and it is cheap; `lib/api-auth.ts`
 * already established the pattern for this codebase.
 *
 * ── PLAINTEXT ────────────────────────────────────────────────────────────────
 *
 * `generateProjectApiCredential` is the only function that ever holds the full
 * token, and it returns it once. Nothing here logs it, embeds it in an error,
 * returns it from a lookup or writes it to the database.
 */

import 'server-only'

import { NextResponse } from 'next/server'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

// ── Principal ────────────────────────────────────────────────────────────────

/**
 * An authenticated machine caller.
 *
 * `projectId` is the credential's own project, read from its row. It is the
 * ONLY admissible source of project identity for a request authenticated this
 * way — see `projectOverrideIn` below.
 */
export interface ProjectApiPrincipal {
  readonly credentialId: string
  readonly projectId: string
  readonly scopes: readonly string[]
}

// ── Token format ─────────────────────────────────────────────────────────────

const PREFIX_BYTES = 8   // 64-bit lookup handle
const SECRET_BYTES = 32  // 256-bit secret

/**
 * Strict full-token shape. Anchored at both ends and exact in length, so a
 * truncated, padded or decorated token is rejected before it reaches the
 * database rather than becoming a lookup that quietly misses.
 */
const TOKEN_RE = /^(omn_[0-9a-f]{16})_([A-Za-z0-9_-]{43})$/

/** Shape of `key_prefix` on its own, mirroring the column's CHECK constraint. */
export const KEY_PREFIX_RE = /^omn_[0-9a-f]{16}$/

export interface ParsedToken {
  readonly keyPrefix: string
  readonly secret: string
}

/**
 * Parse a presented token. Returns null for anything that is not exactly the
 * canonical shape — never throws, and never echoes the input.
 */
export function parseProjectApiToken(token: unknown): ParsedToken | null {
  if (typeof token !== 'string') return null
  const match = TOKEN_RE.exec(token)
  if (!match) return null
  return { keyPrefix: match[1], secret: match[2] }
}

export interface GeneratedCredential {
  /** The full plaintext token. Returned ONCE; never recoverable afterwards. */
  readonly token: string
  /** Public lookup handle — safe to store and to display. */
  readonly keyPrefix: string
  /** SHA-256 of the secret component, lowercase hex. This is what gets stored. */
  readonly secretHash: string
}

/**
 * Mint a credential.
 *
 * Both components come from `node:crypto`'s `randomBytes`, which is a CSPRNG.
 * `Math.random` is not cryptographically secure, and a UUID is not an
 * acceptable secret on its own — a v4 UUID carries 122 bits, and its structure
 * is partly fixed.
 *
 * The caller is responsible for persisting `keyPrefix` and `secretHash` and for
 * handing `token` to the operator exactly once.
 */
export function generateProjectApiCredential(): GeneratedCredential {
  const keyPrefix = `omn_${randomBytes(PREFIX_BYTES).toString('hex')}`
  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  return {
    token: `${keyPrefix}_${secret}`,
    keyPrefix,
    secretHash: hashProjectApiSecret(secret),
  }
}

/** SHA-256 of a token's secret component, lowercase hex. */
export function hashProjectApiSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/**
 * Constant-time hash comparison.
 *
 * Length is checked first because `timingSafeEqual` throws on unequal-length
 * buffers, and a hash's length is not secret. The same shape the retired global
 * key helper used, kept here after that helper was deleted so the idiom did not
 * leave with it.
 */
export function secretHashMatches(presentedHash: string, storedHash: string): boolean {
  const a = Buffer.from(presentedHash, 'utf8')
  const b = Buffer.from(storedHash, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── Project binding ──────────────────────────────────────────────────────────

/**
 * Field names that would let a caller name a project.
 *
 * HARD INVARIANT: for a request authenticated by a project credential, the
 * project comes from the principal and from nowhere else. A credential issued
 * to Familje-Stunden must not be able to write into ai-media-automation by
 * saying so in the body.
 *
 * Rejecting the names outright — rather than reading them and comparing — makes
 * the refusal visible at the edge and keeps a future endpoint from being one
 * `??` away from trusting caller input. This mirrors `RESERVED_FIELDS` in
 * `lib/atlas/executive/http.ts`, which the Executive routes already use.
 */
export const PROJECT_OVERRIDE_FIELDS = [
  'projectId', 'project_id', 'projectSlug', 'project_slug', 'project',
] as const

/** The first project-naming field present, or null. Presence alone is enough. */
export function projectOverrideIn(body: Record<string, unknown>): string | null {
  for (const key of PROJECT_OVERRIDE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return key
  }
  return null
}

// ── Verification ─────────────────────────────────────────────────────────────

/** Columns verification needs. Notably NOT `secret_hash` in any return value. */
interface CredentialRow {
  id: unknown
  project_id: unknown
  secret_hash: unknown
  scopes: unknown
  enabled: unknown
  revoked_at: unknown
  expires_at: unknown
}

/** The repository's escape hatch for tables absent from the generated types. */
type AnyDb = any // eslint-disable-line @typescript-eslint/no-explicit-any

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/**
 * Resolve a presented token to a principal, or to null.
 *
 * READ-ONLY and total: every failure path — malformed token, unknown prefix,
 * hash mismatch, disabled, revoked, expired, missing project, malformed row,
 * database error, thrown exception — returns null. There is no error channel a
 * caller could accidentally treat as success, and no failure reason is
 * distinguishable to the caller.
 *
 * `now` is injectable for tests ONLY. It is not reachable from HTTP: no route
 * takes it, and `requireProjectApiScope` never forwards caller input here.
 */
export async function verifyProjectApiCredential(
  token: unknown,
  options: { now?: Date } = {},
): Promise<ProjectApiPrincipal | null> {
  const parsed = parseProjectApiToken(token)
  if (!parsed) return null

  const now = options.now ?? new Date()

  try {
    const db = createAdminClient() as AnyDb

    const { data, error } = await db
      .from('project_api_credentials')
      .select('id, project_id, secret_hash, scopes, enabled, revoked_at, expires_at')
      .eq('key_prefix', parsed.keyPrefix)
      .maybeSingle()

    // Fail closed on any database error, and on no row.
    if (error || !data) return null

    const row = data as CredentialRow

    if (!isNonEmptyString(row.secret_hash)) return null
    if (!secretHashMatches(hashProjectApiSecret(parsed.secret), row.secret_hash)) return null

    // Lifecycle. Each condition alone is sufficient to deny.
    if (row.enabled !== true) return null
    if (row.revoked_at !== null && row.revoked_at !== undefined) return null

    if (row.expires_at !== null && row.expires_at !== undefined) {
      if (!isNonEmptyString(row.expires_at)) return null
      const expiresAt = Date.parse(row.expires_at)
      if (Number.isNaN(expiresAt)) return null
      if (expiresAt <= now.getTime()) return null
    }

    if (!isNonEmptyString(row.id) || !isNonEmptyString(row.project_id)) return null

    // Scopes must be an array of strings. A malformed value denies rather than
    // being coerced into something that might accidentally match.
    if (!Array.isArray(row.scopes)) return null
    if (!row.scopes.every(s => typeof s === 'string')) return null

    // The project must still exist. `on delete restrict` already guarantees
    // this, so the check is defence in depth against the FK ever being relaxed
    // — and it is the canonical project semantics available: `projects` has no
    // archived/deleted_at column, so existence IS validity.
    const { data: project, error: projectError } = await db
      .from('projects')
      .select('id')
      .eq('id', row.project_id)
      .maybeSingle()

    if (projectError || !project) return null

    return {
      credentialId: row.id,
      projectId: row.project_id,
      scopes: Object.freeze([...row.scopes]) as readonly string[],
    }
  } catch {
    // Crypto, client construction or transport failure — deny.
    return null
  }
}

// ── Scope enforcement ────────────────────────────────────────────────────────

/**
 * EXACT scope match. The enforcement boundary.
 *
 * Written as an explicit `===` loop so the intent survives editing. Every
 * weakening of this function is an escalation:
 *
 *   s.startsWith(required)          `business.leads.create.other` would grant
 *                                   `business.leads.create`
 *   required.startsWith(s)          `business.leads` would grant
 *                                   `business.leads.create`
 *   s.includes(required)            any superstring would grant
 *   s === '*' || …                  a wildcard would grant everything
 *
 * An empty scope list denies, without a special case: the loop simply never
 * matches. That is the intended reading of "this credential may do nothing".
 */
export function hasExactScope(scopes: readonly string[], required: string): boolean {
  for (const scope of scopes) {
    if (scope === required) return true
  }
  return false
}

export type ProjectApiAuthResult =
  | { ok: true; principal: ProjectApiPrincipal }
  | { ok: false; response: NextResponse }

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const forbidden = () =>
  NextResponse.json({ error: 'Forbidden' }, { status: 403 })

/** `Authorization: Bearer <token>`, or null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/**
 * Authenticate a machine caller and require ONE exact scope.
 *
 * Returns the principal on success. There is deliberately no `{ ok: true }`
 * without a principal — the absence of a subject is the defect this primitive
 * exists to correct, so the type makes it unrepresentable.
 *
 * A missing or invalid credential is 401; a valid credential lacking the scope
 * is 403. The distinction is safe: 403 tells the holder of a genuine credential
 * that it needs a different permission, which reveals nothing they could not
 * learn by reading their own scope list.
 */
export async function requireProjectApiScope(
  request: Request,
  requiredScope: string,
): Promise<ProjectApiAuthResult> {
  const token = bearerToken(request)
  if (!token) return { ok: false, response: unauthorized() }

  const principal = await verifyProjectApiCredential(token)
  if (!principal) return { ok: false, response: unauthorized() }

  if (!hasExactScope(principal.scopes, requiredScope)) {
    return { ok: false, response: forbidden() }
  }

  await stampLastUsed(principal.credentialId)

  return { ok: true, principal }
}

// ── Observability ────────────────────────────────────────────────────────────

/**
 * Record that a credential authenticated successfully.
 *
 * Called ONLY after verification and the scope check have both passed, so a
 * failing credential cannot drive this write and cannot use `last_used_at` as
 * an oracle for whether a prefix exists.
 *
 * STAMPING ON EVERY REQUEST is the right trade at this volume — the platform
 * runs a double-digit number of authenticated calls per day, so this is one
 * cheap indexed UPDATE, and an always-current timestamp is what makes an unused
 * or compromised credential visible. If traffic ever makes the write
 * significant, the change is to stamp only when `last_used_at` is older than a
 * threshold; that is a strictly smaller write, not a redesign.
 *
 * Failure is non-fatal by design: observability must never be able to deny an
 * otherwise valid request. Nothing derived from the request body is written.
 */
export async function stampLastUsed(credentialId: string): Promise<void> {
  try {
    const db = createAdminClient() as AnyDb
    await db
      .from('project_api_credentials')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', credentialId)
  } catch {
    // Deliberately swallowed — see above.
  }
}
