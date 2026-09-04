/**
 * lib/workflows/adapters/familje-stunden/github-app-auth.ts — GitHub App
 * installation authentication.
 *
 * ── WHY AN APP AND NOT A TOKEN ──────────────────────────────────────────────
 * The Checks API is the only place `Supabase Preview` and `Vercel Preview
 * Comments` exist, and GitHub does not offer a `Checks` permission to
 * fine-grained personal access tokens at all — only GitHub Apps can read it. A
 * classic PAT would work and is refused: its `repo` scope is account-wide and
 * grants WRITE to every repository, which is not a credential this system may
 * hold to answer three read-only questions.
 *
 * ── WHAT IS ACTUALLY STORED ─────────────────────────────────────────────────
 * A private key — not an API credential. On its own it opens nothing; it must
 * be exchanged, as the App, for an installation token that GitHub scopes to the
 * one repository this App is installed on and to the permissions requested
 * below. That token lives one hour, in memory, and is never written anywhere.
 *
 * ── THE NARROWING IS DELIBERATE AND REDUNDANT ───────────────────────────────
 * The installation is already restricted to Bumbi190/familje-stunden-v2 with
 * four read permissions. The mint request asks for those permissions AGAIN, so
 * a token this code obtains stays read-only even if the installation were later
 * widened by hand. GitHub refuses to escalate beyond the installation's grant,
 * so this can only ever narrow.
 *
 * ── NOTHING HERE IS PRINTABLE ───────────────────────────────────────────────
 * The private key, the App JWT and the installation token never enter a log, an
 * error message, an evidence row, an action output or a thrown value. Failures
 * are reported as a `ReadFailure` word and a fixed sentence. Tests assert it.
 */

import 'server-only'

import { createSign } from 'node:crypto'

const GITHUB_API = 'https://api.github.com'

/** GitHub rejects a JWT with `exp` more than 10 minutes out. Stay well under. */
const JWT_LIFETIME_S = 8 * 60
/** Tolerate modest clock skew, which GitHub explicitly recommends. */
const JWT_BACKDATE_S = 60
/** Re-mint this long before expiry so a request never races the boundary. */
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000
const MINT_TIMEOUT_MS = 10_000

/**
 * Exactly the permissions the three checks need, and no others.
 *
 * `metadata` is mandatory at the App level and is not requestable here.
 * Every value is `read`; there is no code path that can set `write`.
 */
export const INSTALLATION_TOKEN_PERMISSIONS = {
  pull_requests: 'read',
  statuses: 'read',
  checks: 'read',
} as const

export type AuthFailure =
  | 'credential_missing' | 'unauthorized' | 'service_unavailable'
  | 'network_timeout' | 'malformed_response'

export type AuthResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; failure: AuthFailure; detail: string }

interface AppConfig { appId: string; installationId: string; privateKey: string }

/**
 * Configuration, read at call time and never at import time.
 *
 * Read ONLY from the environment. There is no parameter, no request field and
 * no workflow input that can supply an App id, an installation id or a key —
 * which is what makes the credential and its target un-steerable.
 */
function config(): AppConfig | null {
  const appId = process.env.FAMILJE_STUNDEN_GITHUB_APP_ID?.trim() || ''
  const installationId = process.env.FAMILJE_STUNDEN_GITHUB_INSTALLATION_ID?.trim() || ''
  // Vercel stores multi-line values with literal \n, so both forms are accepted.
  const privateKey = (process.env.FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n').trim()

  // Both ids are numeric in GitHub. A non-numeric value is a misconfiguration,
  // not something to send and find out about from a 404.
  if (!/^\d+$/.test(appId)) return null
  if (!/^\d+$/.test(installationId)) return null
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY')) return null
  return { appId, installationId, privateKey }
}

/** Is the credential configured at all? Answers without revealing anything. */
export function isGithubAppConfigured(): boolean {
  return config() !== null
}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * A signed App JWT.
 *
 * Returns null on ANY signing failure. The caught error is discarded rather
 * than inspected or re-thrown: `crypto` errors from a malformed key can quote
 * the key material back, and an error that carries a secret must never reach a
 * log, a message or a stack this system writes down.
 */
function signAppJwt(cfg: AppConfig, nowMs: number): string | null {
  const iat = Math.floor(nowMs / 1000) - JWT_BACKDATE_S
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iat, exp: iat + JWT_LIFETIME_S, iss: cfg.appId,
  }))
  try {
    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${payload}`)
    signer.end()
    return `${header}.${payload}.${b64url(signer.sign(cfg.privateKey))}`
  } catch {
    return null
  }
}

// ── Token cache ──────────────────────────────────────────────────────────────
//
// In-memory only, for the lifetime of one serverless instance. Never written to
// the database, a file, a cookie or a header this system stores. A cold start
// simply mints again, which costs one request.

interface CachedToken { token: string; expiresAtMs: number; installationId: string }
let cached: CachedToken | null = null

/** Test seam. Not exported through the adapter's public surface. */
export function __resetInstallationTokenCache(): void { cached = null }

export interface MintDeps { fetchImpl?: typeof fetch; nowMs?: number }

/**
 * An installation access token for the configured installation.
 *
 * Cached until `TOKEN_SAFETY_MARGIN_MS` before expiry. The cache key includes
 * the installation id, so a configuration change cannot serve a token minted
 * for a different installation.
 */
export async function getInstallationToken(deps: MintDeps = {}): Promise<AuthResult> {
  const cfg = config()
  if (!cfg) {
    return {
      ok: false, failure: 'credential_missing',
      detail: 'the GitHub App id, installation id or private key is absent or malformed',
    }
  }

  const nowMs = deps.nowMs ?? Date.now()
  if (cached
    && cached.installationId === cfg.installationId
    && cached.expiresAtMs - TOKEN_SAFETY_MARGIN_MS > nowMs) {
    return { ok: true, token: cached.token, expiresAt: new Date(cached.expiresAtMs).toISOString() }
  }

  const jwt = signAppJwt(cfg, nowMs)
  if (jwt === null) {
    return {
      ok: false, failure: 'credential_missing',
      detail: 'the configured private key could not produce a signature',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS)
  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(
      `${GITHUB_API}/app/installations/${cfg.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        // Narrow again. GitHub can only intersect this with the installation's
        // grant, so the result is never wider than what was authorized by hand.
        body: JSON.stringify({ permissions: INSTALLATION_TOKEN_PERMISSIONS }),
        signal: controller.signal,
        cache: 'no-store',
      })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      failure: aborted ? 'network_timeout' : 'service_unavailable',
      // The caught error is NOT quoted: a fetch error can carry the request,
      // and the request carries the JWT.
      detail: aborted ? `no response within ${MINT_TIMEOUT_MS}ms` : 'could not reach GitHub',
    }
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false, failure: 'unauthorized',
      detail: `GitHub refused the App credential (HTTP ${res.status})`,
    }
  }
  if (!res.ok) {
    return {
      ok: false, failure: 'service_unavailable',
      detail: `installation token request returned HTTP ${res.status}`,
    }
  }

  let body: { token?: unknown; expires_at?: unknown }
  try {
    body = (await res.json()) as { token?: unknown; expires_at?: unknown }
  } catch {
    return { ok: false, failure: 'malformed_response', detail: 'token response was not JSON' }
  }

  const token = typeof body?.token === 'string' && body.token.length > 0 ? body.token : null
  const expiresAt = typeof body?.expires_at === 'string' ? body.expires_at : null
  const expiresAtMs = expiresAt === null ? NaN : Date.parse(expiresAt)
  if (token === null || Number.isNaN(expiresAtMs)) {
    return {
      ok: false, failure: 'malformed_response',
      detail: 'token response did not carry a usable token and expiry',
    }
  }

  cached = { token, expiresAtMs, installationId: cfg.installationId }
  return { ok: true, token, expiresAt: expiresAt as string }
}
