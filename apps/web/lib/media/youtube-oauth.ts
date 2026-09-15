/**
 * lib/media/youtube-oauth.ts — connecting ONE project's YouTube channel with Google OAuth.
 *
 * THE RELATION (owner lock, 2026-09-14):
 *   Project → Platform → Verified External Account → Credential
 * A connection starts for one project the operator owns and can only end for that
 * project. The state Google echoes back names the project, the operator and whether a
 * channel change was asked for; it lives ten minutes and is consumed once. Which channel
 * the project gets is decided by the callback from what YouTube says, never by a request.
 *
 * PINNED HERE
 *   - the redirect URI registered in Google Cloud — a constant, never the request's host;
 *   - the scopes, all three required: upload, reading the channel (so it is verified
 *     before every upload) and YouTube Analytics (retention);
 *   - PKCE with S256, and a state of 256 random bits.
 *
 * CREDENTIAL-BLIND STATE. social_oauth_states keeps the SHA-256 of the state, never the
 * state; the PKCE verifier is cleared the moment the state is consumed. Nothing here
 * throws, logs or returns a database message.
 *
 * NOT A SHARED CREDENTIAL. The OAuth client (lib/media/youtube.ts) is the platform's app
 * identity at Google. The credential a connection produces — the refresh token — belongs
 * to the project it was issued for and is stored only under that project.
 */
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProjectId } from './social-bindings'

// The table is newer than the generated database types; same boundary cast as the
// other credential stores.
type AnyDb = any

/** Registered for the platform's OAuth client in Google Cloud (2026-09-15). */
export const YOUTUBE_OAUTH_REDIRECT_URI = 'https://ai-operating-platform-web.vercel.app/api/media/youtube/oauth/callback'

export const YOUTUBE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

/** Every scope a connection must be granted — upload, channel read and analytics read. */
export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const

/** How long an operator has to finish Google's consent. Mirrored by the table. */
export const YOUTUBE_OAUTH_STATE_TTL_MINUTES = 10

const STATE_SHAPE = /^[A-Za-z0-9_-]{43}$/
const STATE_HASH_SHAPE = /^[0-9a-f]{64}$/
const VERIFIER_SHAPE = /^[A-Za-z0-9_-]{43,128}$/
const OPERATOR_ACTOR = /^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The stored key of a state: its SHA-256, hex. */
export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex')
}

/** A state as this module issues it: 32 random bytes, base64url. */
export function isOAuthState(value: unknown): value is string {
  return typeof value === 'string' && STATE_SHAPE.test(value)
}

export interface NewOAuthState {
  /** Travels only in Google's consent URL and back to the callback. */
  state: string
  stateHash: string
  codeVerifier: string
  codeChallenge: string
}

export function newOAuthState(): NewOAuthState {
  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  return {
    state,
    stateHash: hashOAuthState(state),
    codeVerifier,
    codeChallenge: createHash('sha256').update(codeVerifier, 'ascii').digest('base64url'),
  }
}

/** Google's consent URL for one state: the public client id, the pinned redirect URI, every scope, offline access, PKCE. */
export function youtubeAuthorizationUrl(input: { clientId: string; state: string; codeChallenge: string }): string {
  const url = new URL(YOUTUBE_AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', YOUTUBE_OAUTH_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', YOUTUBE_OAUTH_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/** Whether a grant carries every scope a connection needs. */
export function hasRequiredYouTubeScopes(granted: readonly string[]): boolean {
  return YOUTUBE_OAUTH_SCOPES.every((scope) => granted.includes(scope))
}

export interface OAuthStateToRecord {
  stateHash: string
  projectId: string
  /** The server-authenticated operator: `user:<uuid>`. */
  actor: string
  changeAccount: boolean
  codeVerifier: string
}

/** Records a new state for one operator's connection of one project. The database stamps its lifetime. */
export async function recordOAuthState(input: OAuthStateToRecord): Promise<boolean> {
  if (!STATE_HASH_SHAPE.test(input.stateHash) || !isProjectId(input.projectId) || !OPERATOR_ACTOR.test(input.actor)
      || typeof input.changeAccount !== 'boolean' || !VERIFIER_SHAPE.test(input.codeVerifier)) {
    return false
  }
  try {
    const { error } = await (createAdminClient() as AnyDb)
      .from('social_oauth_states')
      .insert({
        state_hash: input.stateHash,
        project_id: input.projectId,
        platform: 'youtube',
        actor: input.actor,
        change_account: input.changeAccount,
        code_verifier: input.codeVerifier,
      })
    return !error
  } catch {
    return false
  }
}

export interface ConsumedOAuthState {
  projectId: string
  actor: string
  changeAccount: boolean
  codeVerifier: string
}

/**
 * Consumes a state exactly once, within its lifetime (public.social_oauth_state_consume).
 * null: unknown, expired, already consumed, malformed or unreadable — all the same answer.
 */
export async function consumeOAuthState(state: string): Promise<ConsumedOAuthState | null> {
  if (!isOAuthState(state)) return null
  try {
    const { data, error } = await (createAdminClient() as AnyDb)
      .rpc('social_oauth_state_consume', { p_state_hash: hashOAuthState(state) })
    if (error || !Array.isArray(data) || data.length !== 1) return null
    const row = data[0]
    if (!row || !isProjectId(row.project_id) || row.platform !== 'youtube'
        || typeof row.actor !== 'string' || !OPERATOR_ACTOR.test(row.actor)
        || typeof row.change_account !== 'boolean'
        || typeof row.code_verifier !== 'string' || !VERIFIER_SHAPE.test(row.code_verifier)) {
      return null
    }
    return { projectId: row.project_id, actor: row.actor, changeAccount: row.change_account, codeVerifier: row.code_verifier }
  } catch {
    return null
  }
}
