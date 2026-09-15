/**
 * GET /api/media/youtube/oauth/callback — Google sends the operator back here after consent.
 *
 * THE RELATION (owner lock, 2026-09-14):
 *   Project → Platform → Verified External Account → Credential
 * The channel a project gets is the one YouTube says the authorization acts as, and the
 * credential is stored for the project the state was issued for — never another. A
 * channel belongs to one project (O1): a channel another project holds is refused before
 * anything is stored.
 *
 * ORDER. Each step runs only when every step before it passed. Every answer is a
 * redirect to Inställningar carrying one closed code — never a token, code, state or
 * provider text.
 *   1. platform operator, from the browser's session;
 *   2. the state: well-formed, known, unexpired and unused — consumed now, whatever
 *      happens next;
 *   3. the state was issued to THIS operator;
 *   4. ownership of the state's project, re-checked;
 *   5. audit: an `attempted` event before any provider contact. If it does not land,
 *      nothing is exchanged or stored;
 *   6. Google's answer — a refusal ends here;
 *   7. the code exchange, with the PKCE verifier and the pinned redirect URI;
 *   8. a refresh token and all three scopes, or nothing is stored;
 *   9. YouTube names the channel the authorization acts as — exactly one;
 *  10. binding (O1):
 *        matched  — the project's own connection for its bound channel, renewed;
 *        migrated — the bound channel of the Y1 transitional binding, now backed by the
 *                   project's own credential. Stored FIRST and rebound after, so a
 *                   refused rebind leaves the transitional binding — and publishing
 *                   through it — exactly as it was;
 *        created  — the project's first channel, which belongs to no other project;
 *        rebound  — an explicit channel change, to a channel no other project holds.
 *      Anything else is refused before anything is stored;
 *  11. store — the channel's refresh token, for this project;
 *  12. audit: exactly one terminal event.
 *
 * AUDIT INTEGRITY. As in api/media/token: if the terminal event cannot be written after
 * the credential WAS stored, the connection stands and the answer says it is an audit
 * incident, with a server log line of metadata only.
 */
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { resolveProjectAccess, assertProjectAllowed } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import {
  recordCredentialEvent,
  type CredentialBindingAction,
  type CredentialFailureStage,
} from '@/lib/media/credential-events'
import {
  createBinding,
  readActiveBinding,
  rebindAccount,
  recordProviderAttestation,
  type BindingWriteFailure,
} from '@/lib/media/social-bindings'
import { attestYouTubeChannels, exchangeYouTubeAuthorizationCode } from '@/lib/media/social-identity'
import { storeCredential } from '@/lib/media/token-store'
import { platformYouTubeOAuthClient } from '@/lib/media/youtube'
import {
  YOUTUBE_OAUTH_REDIRECT_URI,
  consumeOAuthState,
  hasRequiredYouTubeScopes,
  isOAuthState,
} from '@/lib/media/youtube-oauth'
import type { YouTubeConnectCode } from '@/lib/os/settings-shared'

export const dynamic = 'force-dynamic'

/** Google's authorization code is opaque and short; anything longer is not one. */
const MAX_CODE_LENGTH = 2048

/** Every answer lands on Inställningar at the pinned production origin — never the request's host. */
function answer(code: YouTubeConnectCode): NextResponse {
  const to = new URL('/settings', YOUTUBE_OAUTH_REDIRECT_URI)
  to.searchParams.set('youtube', code)
  const response = NextResponse.redirect(to, 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

type Authorization =
  | { ok: true; refreshToken: string; channelId: string; channelTitle: string | null }
  | { ok: false; stage: CredentialFailureStage; code: YouTubeConnectCode }

/** Steps 6–9: Google's answer, the exchange, the grant's completeness and the one channel it acts as. */
async function authorize(url: URL, codeVerifier: string): Promise<Authorization> {
  if (url.searchParams.has('error')) return { ok: false, stage: 'authorization_denied', code: 'authorization_denied' }
  const code = url.searchParams.get('code')
  if (!code || code.length > MAX_CODE_LENGTH) return { ok: false, stage: 'code_exchange', code: 'authorization_failed' }

  const client = platformYouTubeOAuthClient()
  if (!client) return { ok: false, stage: 'unexpected', code: 'oauth_client_not_configured' }

  const exchanged = await exchangeYouTubeAuthorizationCode({
    clientId: client.clientId, clientSecret: client.clientSecret, code, codeVerifier, redirectUri: YOUTUBE_OAUTH_REDIRECT_URI,
  })
  if (!exchanged.ok) {
    return { ok: false, stage: 'code_exchange',
      code: exchanged.failure === 'provider_unavailable' ? 'provider_unavailable' : 'authorization_failed' }
  }
  if (!exchanged.refreshToken) return { ok: false, stage: 'refresh_token_missing', code: 'refresh_token_missing' }
  if (!hasRequiredYouTubeScopes(exchanged.scopes)) return { ok: false, stage: 'scope_missing', code: 'scope_missing' }

  const channels = await attestYouTubeChannels(exchanged.accessToken)
  if (!channels.ok) {
    return { ok: false, stage: 'provider_verification',
      code: channels.failure === 'provider_unavailable' ? 'provider_unavailable'
        : channels.failure === 'account_not_found' ? 'channel_missing'
        : 'authorization_failed' }
  }
  if (channels.channels.length !== 1) return { ok: false, stage: 'account_ambiguous', code: 'channel_ambiguous' }
  const [channel] = channels.channels
  return { ok: true, refreshToken: exchanged.refreshToken, channelId: channel.channelId, channelTitle: channel.title }
}

function bindingRefusal(failure: BindingWriteFailure): { stage: CredentialFailureStage; code: YouTubeConnectCode } {
  if (failure === 'account_bound_to_other_project') {
    return { stage: 'account_bound_to_other_project', code: 'channel_bound_to_other_project' }
  }
  if (failure === 'project_already_bound' || failure === 'binding_changed') return { stage: 'binding', code: 'binding_changed' }
  return { stage: 'binding', code: 'binding_failed' }
}

const CONNECTED: Record<CredentialBindingAction, YouTubeConnectCode> = {
  matched: 'reconnected',
  migrated: 'migrated',
  created: 'connected',
  rebound: 'channel_changed',
}

export async function GET(request: Request) {
  const url = new URL(request.url)

  // ── 1. PLATFORM OPERATOR ──────────────────────────────────────────────────
  const operator = await resolvePlatformOperator()
  if (!operator.ok) return answer(operator.reason === 'unauthenticated' ? 'session_required' : 'operator_required')

  // ── 2. THE STATE — consumed once, whatever happens next ───────────────────
  const rawState = url.searchParams.get('state')
  if (!isOAuthState(rawState)) return answer('state_invalid')
  const state = await consumeOAuthState(rawState)
  if (!state) return answer('state_invalid')

  // ── 3. ISSUED TO THIS OPERATOR ────────────────────────────────────────────
  if (state.actor !== operator.actor) {
    console.warn('[youtube/oauth/callback] refused: the state was issued to another operator')
    return answer('state_invalid')
  }

  // ── 4. OWNERSHIP OF THE STATE'S PROJECT ───────────────────────────────────
  const access = await resolveProjectAccess()
  if (!access.ok || !assertProjectAllowed(state.projectId, access.allowedProjectIds)) return answer('project_forbidden')
  const projectId = state.projectId

  // ── 5. AUDIT: attempted — before any provider contact or store ────────────
  const operationId = randomUUID()
  const audit = { operationId, projectId, platform: 'youtube' as const, actor: operator.actor }
  const attempted = await recordCredentialEvent({ ...audit, outcome: 'attempted' })
  if (!attempted.ok) {
    console.error(`[youtube/oauth/callback] audit: attempted event not recorded (operation ${operationId}, project ${projectId}, code ${attempted.code}) — nothing exchanged or stored`)
    return answer('audit_unavailable')
  }

  // Every refusal from here on is audited as the one terminal event of this operation.
  const refuse = async (stage: CredentialFailureStage, code: YouTubeConnectCode, channelId: string | null = null) => {
    const terminal = await recordCredentialEvent({
      ...audit, outcome: 'failed', detail: { failure_stage: stage }, externalAccountId: channelId,
    })
    if (!terminal.ok) {
      console.error(`[youtube/oauth/callback] audit: failed event not recorded (operation ${operationId}, project ${projectId}, code ${terminal.code}) — nothing was connected`)
      return answer('audit_incomplete')
    }
    return answer(code)
  }

  const finish = async (action: CredentialBindingAction, channelId: string) => {
    const terminal = await recordCredentialEvent({
      ...audit, outcome: 'replaced', externalAccountId: channelId, bindingAction: action,
    })
    if (!terminal.ok) {
      // AUDIT INTEGRITY INCIDENT. The channel was connected; the record of it was not
      // completed. Not undone, not hidden.
      console.error(`[youtube/oauth/callback] AUDIT INTEGRITY INCIDENT: YouTube connected for project ${projectId} (channel ${channelId}, ${action}) but the replaced event was not recorded (operation ${operationId}, code ${terminal.code})`)
      return answer('connected_audit_incident')
    }
    return answer(CONNECTED[action])
  }

  // ── 6–9. GOOGLE, THE EXCHANGE, THE GRANT AND THE CHANNEL ──────────────────
  let authorization: Authorization
  try {
    authorization = await authorize(url, state.codeVerifier)
  } catch {
    return await refuse('unexpected', 'connection_failed')
  }
  if (!authorization.ok) return await refuse(authorization.stage, authorization.code)
  const { refreshToken, channelId, channelTitle } = authorization

  // ── 10. BINDING (O1) — decided before anything is stored ──────────────────
  const bindingRead = await readActiveBinding(projectId, 'youtube')
  if (!bindingRead.ok) return await refuse('binding', 'binding_unreadable', channelId)
  const binding = bindingRead.binding
  const newBinding = { projectId, platform: 'youtube' as const, externalAccountId: channelId, accountLabel: channelTitle, boundBy: operator.actor }

  let action: CredentialBindingAction
  if (state.changeAccount) {
    if (!binding) return await refuse('binding', 'binding_changed', channelId)
    if (binding.externalAccountId === channelId) return await refuse('binding', 'already_connected', channelId)
    const rebound = await rebindAccount({ ...newBinding, expectedBindingId: binding.bindingId })
    if (!rebound.ok) {
      const r = bindingRefusal(rebound.failure)
      return await refuse(r.stage, r.code, channelId)
    }
    action = 'rebound'
  } else if (!binding) {
    const created = await createBinding(newBinding)
    if (!created.ok) {
      const r = bindingRefusal(created.failure)
      return await refuse(r.stage, r.code, channelId)
    }
    action = 'created'
  } else if (binding.externalAccountId !== channelId) {
    return await refuse('account_mismatch', 'channel_mismatch', channelId)
  } else if (binding.blockedAt) {
    return await refuse('binding', 'binding_blocked', channelId)
  } else if (binding.credentialSource === 'platform_env_transitional') {
    // The Y1 channel moves to the project's own credential: store FIRST, then rebind.
    const stored = await storeCredential(projectId, 'youtube', { accessToken: refreshToken, accountId: channelId, expiresAt: null })
    if (!stored.ok) return await refuse('store', 'store_failed', channelId)
    const migrated = await rebindAccount({ ...newBinding, expectedBindingId: binding.bindingId })
    if (!migrated.ok) {
      // Stored but not moved: the transitional binding still decides, so publishing is unchanged.
      return await refuse(bindingRefusal(migrated.failure).stage, 'migration_incomplete', channelId)
    }
    return await finish('migrated', channelId)
  } else {
    action = 'matched'
  }

  // ── 11. STORE — the channel's refresh token, for this project ─────────────
  const stored = await storeCredential(projectId, 'youtube', { accessToken: refreshToken, accountId: channelId, expiresAt: null })
  if (!stored.ok) return await refuse('store', 'store_failed', channelId)

  if (action === 'matched') {
    // YouTube just answered with the binding's own channel: record it (never fatal).
    await recordProviderAttestation(binding!, channelTitle)
  }

  // ── 12. AUDIT: terminal — exactly one, same operation ─────────────────────
  return await finish(action, channelId)
}
