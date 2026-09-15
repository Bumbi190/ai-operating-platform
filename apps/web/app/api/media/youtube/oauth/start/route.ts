/**
 * POST /api/media/youtube/oauth/start — begin connecting ONE project's YouTube channel.
 *
 * Body: {
 *   project_id:      uuid     — the project the channel is for (required)
 *   change_account?: boolean  — an explicit operator channel change
 * }
 *
 * THE RELATION (owner lock, 2026-09-14):
 *   Project → Platform → Verified External Account → Credential
 * This route chooses no channel and stores no credential. It checks who may connect the
 * project, records a single-use state for exactly that operator and that project, and
 * answers with Google's consent URL. The callback decides the channel from what YouTube
 * says, and stores the credential for this project only.
 *
 * ORDER. Each step runs only when every step before it passed:
 *   1. platform operator — connecting a publishing channel is the same authority as
 *      replacing a publishing credential (api/media/token);
 *   2. request shape, including an explicit project_id;
 *   3. ownership of THAT project (C-1). The project id is a selector, never a permission;
 *   4. the platform's OAuth client is configured;
 *   5. the project's current YouTube binding: a channel change needs a bound channel;
 *   6. the state — its hash, the PKCE verifier, the operator, the project and whether a
 *      change was asked for — recorded for ten minutes and one use.
 *
 * CREDENTIAL-BLIND. The answer is the consent URL: the platform's public client id, the
 * pinned redirect URI, the scopes, the state and the PKCE challenge. No token, verifier,
 * client secret or provider text leaves the server.
 */
import { NextResponse } from 'next/server'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { isProjectId, readActiveBinding } from '@/lib/media/social-bindings'
import { platformYouTubeOAuthClient } from '@/lib/media/youtube'
import { newOAuthState, recordOAuthState, youtubeAuthorizationUrl } from '@/lib/media/youtube-oauth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // ── 1. PLATFORM OPERATOR — first, before anything else ───────────────────
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    if (operator.reason === 'unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.warn(`[youtube/oauth/start] denied: ${operator.reason}`)
    return NextResponse.json({ error: 'Forbidden', denied: 'platform_operator_required' }, { status: 403 })
  }

  // ── 2. REQUEST SHAPE ──────────────────────────────────────────────────────
  let body: Record<string, unknown> | null
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 })
  }

  const projectId = body.project_id
  if (!isProjectId(projectId)) {
    return NextResponse.json({
      error: 'Ange projektet (project_id). En YouTube-kanal kopplas alltid till ett uttryckligt projekt — det finns inget standardprojekt.',
    }, { status: 400 })
  }

  if (body.change_account !== undefined && typeof body.change_account !== 'boolean') {
    return NextResponse.json({ error: 'change_account måste vara true eller false' }, { status: 400 })
  }
  const changeAccount = body.change_account === true

  // ── 3. OWNERSHIP OF THIS PROJECT (C-1) ────────────────────────────────────
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  // ── 4. THE PLATFORM'S OAUTH CLIENT ────────────────────────────────────────
  const client = platformYouTubeOAuthClient()
  if (!client) {
    return NextResponse.json({
      ok: false, refusal: 'oauth_client_not_configured',
      error: 'YouTube-anslutning är inte konfigurerad för plattformen. Inget har påbörjats.',
    }, { status: 503 })
  }

  // ── 5. THE PROJECT'S BINDING ──────────────────────────────────────────────
  const bindingRead = await readActiveBinding(projectId, 'youtube')
  if (!bindingRead.ok) {
    return NextResponse.json({
      ok: false, refusal: 'binding_unreadable',
      error: 'Projektets kanalbindning kunde inte läsas. Inget har påbörjats.',
    }, { status: 503 })
  }
  if (changeAccount && !bindingRead.binding) {
    return NextResponse.json({
      error: 'Projektet har ingen kopplad YouTube-kanal att byta. Anslut kanalen utan kanalbyte.',
    }, { status: 400 })
  }

  // ── 6. THE STATE — one operator, one project, ten minutes, one use ────────
  const state = newOAuthState()
  const recorded = await recordOAuthState({
    stateHash: state.stateHash, projectId, actor: operator.actor, changeAccount, codeVerifier: state.codeVerifier,
  })
  if (!recorded) {
    return NextResponse.json({
      ok: false, refusal: 'state_unavailable',
      error: 'Anslutningen kunde inte påbörjas. Inget har skickats — försök igen.',
    }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    project_id: projectId,
    authorization_url: youtubeAuthorizationUrl({ clientId: client.clientId, state: state.state, codeChallenge: state.codeChallenge }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
