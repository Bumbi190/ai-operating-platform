/**
 * lib/media/social-identity.ts — what a platform says a social credential belongs to.
 *
 * Project-scoped social credentials (2026-09-14). A social account's identity is
 * never taken from configuration, a request body or a guess. It is asked of the
 * platform, with the credential itself: which account does this credential reach?
 * lib/media/social-credentials.ts compares the answer with the project's verified
 * binding before every dispatch; /api/media/token asks before anything is stored;
 * the health cron asks every day.
 *
 * WHAT COMES BACK. Bounded identifiers (Instagram professional account id,
 * Facebook page id, YouTube channel id), a sanitised display name and, for
 * Facebook, the page token a dispatch needs. Failures are a closed set of codes.
 * No provider message, response body or exception text leaves this module, so
 * nothing a platform says about a credential can reach a log line, an audit row,
 * a UI or a chat through it.
 *
 * HOW THE CREDENTIAL TRAVELS. As an Authorization header on every Graph and
 * YouTube call — never as a query parameter a URL log could print. Google's token
 * endpoint is the one exception: OAuth requires the refresh grant and the authorization
 * code as a form body.
 */
import 'server-only'

const IG_BASE = 'https://graph.instagram.com/v21.0'
const FB_BASE = 'https://graph.facebook.com/v21.0'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const YT_BASE = 'https://www.googleapis.com/youtube/v3'
const TIMEOUT_MS = 12_000

/** An external account id as bindings store it — mirrored by the table's CHECK constraint. */
export const EXTERNAL_ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/

export type IdentityFailure =
  /** The platform rejected the credential: expired, revoked or the wrong kind. */
  | 'credential_invalid'
  /** The credential is valid but does not reach the account in question. */
  | 'account_not_found'
  /** The credential reaches several accounts and none was named. */
  | 'account_ambiguous'
  /** Network, timeout, rate limit or a platform fault — not the credential's doing. */
  | 'provider_unavailable'

export type Attested<T> = ({ ok: true } & T) | { ok: false; failure: IdentityFailure }

const fail = (failure: IdentityFailure): { ok: false; failure: IdentityFailure } => ({ ok: false, failure })

/** A provider-given display name, reduced to something safe to store and show. */
export function displayLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200)
  return clean.length > 0 ? clean : null
}

interface ProviderAnswer { status: number; body: any }

async function providerGet(url: string, credential: string): Promise<ProviderAnswer | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${credential}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    let body: any = null
    try { body = await res.json() } catch { body = null }
    return { status: res.status, body }
  } catch {
    return null
  }
}

// Meta error codes that say "try again", not "this credential is wrong".
const META_TRANSIENT_CODES = new Set([-1, 1, 2, 4, 17, 32, 341, 368, 613])

function unavailable(answer: ProviderAnswer | null): boolean {
  if (!answer || answer.body === null || answer.status === 429 || answer.status >= 500) return true
  const code = answer.body?.error?.code
  return typeof code === 'number' && META_TRANSIENT_CODES.has(code)
}

// ── Instagram ───────────────────────────────────────────────────────────────

export interface InstagramIdentity {
  /** The Instagram professional account id (`user_id`) — what bindings and webhooks use. */
  accountId: string
  username: string | null
  apiBase: string
  isIgLogin: boolean
}

/**
 * Which Instagram account a credential is.
 *
 * An Instagram-login token (IG…) belongs to exactly one account and says so at
 * /me. A Facebook-login token reaches the Instagram accounts linked to the pages it
 * manages; with `expectedAccountId` it must reach that account, and without one it
 * must reach exactly one.
 */
export async function attestInstagramCredential(
  credential: string,
  expectedAccountId: string | null,
): Promise<Attested<InstagramIdentity>> {
  if (credential.startsWith('IG')) {
    const me = await providerGet(`${IG_BASE}/me?fields=user_id,username`, credential)
    if (unavailable(me)) return fail('provider_unavailable')
    if (me!.status !== 200 || me!.body?.error) return fail('credential_invalid')
    const accountId = String(me!.body?.user_id ?? '')
    if (!EXTERNAL_ACCOUNT_ID.test(accountId)) return fail('provider_unavailable')
    return { ok: true, accountId, username: displayLabel(me!.body?.username), apiBase: IG_BASE, isIgLogin: true }
  }

  const pages = await providerGet(
    `${FB_BASE}/me/accounts?fields=instagram_business_account{id,username}&limit=200`, credential,
  )
  if (unavailable(pages)) return fail('provider_unavailable')
  if (pages!.status !== 200 || pages!.body?.error || !Array.isArray(pages!.body?.data)) return fail('credential_invalid')
  const reachable = (pages!.body.data as any[])
    .map(p => p?.instagram_business_account)
    .filter(a => a && EXTERNAL_ACCOUNT_ID.test(String(a.id)))
  const candidates = expectedAccountId
    ? reachable.filter(a => String(a.id) === expectedAccountId)
    : reachable
  if (candidates.length === 0) return fail('account_not_found')
  if (!expectedAccountId && new Set(candidates.map(a => String(a.id))).size > 1) return fail('account_ambiguous')
  const account = candidates[0]
  return { ok: true, accountId: String(account.id), username: displayLabel(account.username), apiBase: FB_BASE, isIgLogin: false }
}

// ── Facebook ────────────────────────────────────────────────────────────────

export interface FacebookPageIdentity {
  pageId: string
  pageName: string | null
  /** The page's own token — what a post, reply or insight read for this page needs. */
  pageToken: string
}

/**
 * Whether a credential reaches Facebook page `pageId`, and as what.
 *
 * A user credential reaches the page through /me/accounts, which hands back the
 * page's own token; a page credential already IS the page. Either way the page
 * token is then asked /me, and a page token answers with the page itself — so the
 * id that comes back is the platform's word for which page this is.
 */
export async function attestFacebookPage(credential: string, pageId: string): Promise<Attested<FacebookPageIdentity>> {
  if (!EXTERNAL_ACCOUNT_ID.test(pageId)) return fail('account_not_found')

  let pageToken = credential
  const accounts = await providerGet(`${FB_BASE}/me/accounts?fields=id,access_token&limit=200`, credential)
  if (!accounts || accounts.status === 429 || accounts.status >= 500) return fail('provider_unavailable')
  // A page credential is not a user and gets an error here; that is not a failure — /me decides.
  if (accounts.status === 200 && Array.isArray(accounts.body?.data)) {
    const page = (accounts.body.data as any[]).find(
      p => String(p?.id) === pageId && typeof p?.access_token === 'string' && p.access_token.length > 0,
    )
    if (page) pageToken = page.access_token
  }

  const me = await providerGet(`${FB_BASE}/me?fields=id,name`, pageToken)
  if (unavailable(me)) return fail('provider_unavailable')
  if (me!.status !== 200 || me!.body?.error) return fail('credential_invalid')
  if (String(me!.body?.id ?? '') !== pageId) return fail('account_not_found')
  return { ok: true, pageId, pageName: displayLabel(me!.body?.name), pageToken }
}

// ── YouTube ─────────────────────────────────────────────────────────────────

export interface YouTubeGrant { clientId: string; clientSecret: string; refreshToken: string }
export interface YouTubeAccess { accessToken: string; scopes: string[] }

/** Exchanges a YouTube refresh grant for an access token and the scopes it carries. */
export async function exchangeYouTubeGrant(grant: YouTubeGrant): Promise<Attested<YouTubeAccess>> {
  let res: Response
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     grant.clientId,
        client_secret: grant.clientSecret,
        refresh_token: grant.refreshToken,
        grant_type:    'refresh_token',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return fail('provider_unavailable')
  }
  let body: any = null
  try { body = await res.json() } catch { body = null }
  if (body === null || res.status === 429 || res.status >= 500) return fail('provider_unavailable')
  if (res.status !== 200 || typeof body.access_token !== 'string' || body.access_token.length === 0) {
    return fail('credential_invalid')
  }
  const scopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : []
  return { ok: true, accessToken: body.access_token, scopes }
}

export interface YouTubeAuthorizationCode {
  clientId: string
  clientSecret: string
  code: string
  /** The PKCE verifier the consent URL's challenge was derived from. */
  codeVerifier: string
  /** The redirect URI the consent was requested with — Google requires the same one here. */
  redirectUri: string
}

export interface YouTubeAuthorization extends YouTubeAccess {
  /** Issued for offline access; a project connection needs one. */
  refreshToken: string | null
}

/** Exchanges an authorization code, with its PKCE verifier, for tokens and the scopes the operator granted. */
export async function exchangeYouTubeAuthorizationCode(input: YouTubeAuthorizationCode): Promise<Attested<YouTubeAuthorization>> {
  let res: Response
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     input.clientId,
        client_secret: input.clientSecret,
        code:          input.code,
        code_verifier: input.codeVerifier,
        redirect_uri:  input.redirectUri,
        grant_type:    'authorization_code',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return fail('provider_unavailable')
  }
  let body: any = null
  try { body = await res.json() } catch { body = null }
  if (body === null || res.status === 429 || res.status >= 500) return fail('provider_unavailable')
  if (res.status !== 200 || typeof body.access_token !== 'string' || body.access_token.length === 0) {
    return fail('credential_invalid')
  }
  const refreshToken = typeof body.refresh_token === 'string' && body.refresh_token.length > 0 ? body.refresh_token : null
  const scopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : []
  return { ok: true, accessToken: body.access_token, refreshToken, scopes }
}

const OWN_CHANNEL_READ_SCOPES = new Set([
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
])

/** Whether a YouTube grant may read its own channel — the precondition for verifying it before an upload. */
export function canReadOwnChannel(scopes: readonly string[]): boolean {
  return scopes.some(scope => OWN_CHANNEL_READ_SCOPES.has(scope))
}

export interface YouTubeChannels { channels: Array<{ channelId: string; title: string | null }> }

/** The channels a YouTube access token acts as (channels.list mine=true). */
export async function attestYouTubeChannels(accessToken: string): Promise<Attested<YouTubeChannels>> {
  const answer = await providerGet(`${YT_BASE}/channels?part=id,snippet&mine=true&maxResults=50`, accessToken)
  if (!answer || answer.body === null || answer.status === 429 || answer.status >= 500) return fail('provider_unavailable')
  if (answer.status !== 200 || answer.body?.error) return fail('credential_invalid')
  const items = Array.isArray(answer.body?.items) ? answer.body.items as any[] : []
  const channels = items
    .map(item => ({ channelId: String(item?.id ?? ''), title: displayLabel(item?.snippet?.title) }))
    .filter(channel => EXTERNAL_ACCOUNT_ID.test(channel.channelId))
  if (channels.length === 0) return fail('account_not_found')
  return { ok: true, channels }
}
