/**
 * POST /api/media/token — store ONE project's Instagram or Facebook credential.
 *
 * Body: {
 *   project_id:      uuid                      — the project the credential is for (required)
 *   platform:        'instagram' | 'facebook'
 *   token:           string
 *   expires_days?:   number                    — Instagram: validity to record (absent/null/0 = none)
 *   page_id?:        string                    — Facebook: the page, when the project has no Facebook
 *                                                binding yet or the operator changes page
 *   change_account?: boolean                   — an explicit operator account change
 * }
 *
 * THE RELATION (project-scoped social credentials, 2026-09-14):
 *   Project → Platform → Verified External Account → Credential
 * A credential is stored only for a project the operator owns, only after the
 * platform itself has said which account it belongs to, and only when that account
 * is — or explicitly becomes — the project's verified binding.
 *
 * ORDER. Each step runs only when every step before it passed:
 *   1. platform operator (Settings S0) — replacing a publishing credential is the same
 *      authority as posting with it.
 *   2. request shape, including an explicit project_id.
 *   3. ownership of THAT project (C-1). The project id is a selector, never a
 *      permission: a project the operator does not own is refused here.
 *   4. the project's current binding on the platform, and what the request may do
 *      with it (a page_id may only name the page of a first binding or of an
 *      explicit change).
 *   5. audit: an `attempted` event under a server-generated operation id. If that
 *      write does not land, nothing below runs — no provider is contacted, no token
 *      exchanged, nothing stored.
 *   6. provider attestation: the platform, asked with the credential, names the
 *      account (Instagram: /me; Facebook: the page's own /me with its page token).
 *   7. binding (owner decision O1 — one project per external account):
 *        matched — the attested account IS the project's binding;
 *        created — the project had no binding, and the account belongs to no other
 *                  project;
 *        rebound — change_account was requested, and the new account belongs to no
 *                  other project; the old binding is superseded in the same
 *                  database transaction.
 *      Anything else is refused BEFORE any store: account_mismatch (another account
 *      and no change requested) or account_bound_to_other_project.
 *   8. store — the attested account's credential, for this project.
 *   9. audit: exactly one terminal event naming the account and the binding action.
 *
 * A FAILED STORE AFTER A BINDING CHANGE fails closed on its own: the binding names the
 * new account, the stored credential is still the old one, and every consumer refuses
 * until a credential for the bound account is stored. The binding row records who
 * changed it and when; the `failed` event records the attempt.
 *
 * AUDIT INTEGRITY. If the terminal event cannot be written after the credential WAS
 * stored, the replacement stands — there is no canonical rollback for a credential,
 * and improvising one could take publishing down — but the route does not pretend it
 * did not happen: 500 with `replaced: true` and `audit_incident`, and a server log
 * line of metadata only.
 *
 * WRITE-ONLY. No response, log line or audit event carries a token or provider text.
 * The answer names the project's account (id and the name the platform gave), the
 * binding action and the audit operation id.
 */
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { storeCredential } from '@/lib/media/token-store'
import {
  createBinding,
  isProjectId,
  readActiveBinding,
  rebindAccount,
  recordProviderAttestation,
  type BindingWriteFailure,
} from '@/lib/media/social-bindings'
import {
  attestFacebookPage,
  attestInstagramCredential,
  EXTERNAL_ACCOUNT_ID,
  type IdentityFailure,
} from '@/lib/media/social-identity'
import {
  recordCredentialEvent,
  type CredentialBindingAction,
  type CredentialEventDetail,
  type CredentialFailureStage,
} from '@/lib/media/credential-events'

export const dynamic = 'force-dynamic'

const FB_GRAPH = 'https://graph.facebook.com/v21.0'

// The longest validity a request may claim, so the computed expiry stays a real date.
const MAX_EXPIRES_DAYS = 3650
const DAY_MS = 24 * 60 * 60 * 1000

const LABEL = { instagram: 'Instagram', facebook: 'Facebook' } as const

/**
 * A short-lived Facebook user token becomes a long-lived one when the Meta app is
 * configured. Best effort: without the exchange the pasted token is attested as it is.
 */
async function exchangeLongLived(inputToken: string): Promise<{ token: string; exchanged: boolean }> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return { token: inputToken, exchanged: false }
  try {
    const url = new URL(`${FB_GRAPH}/oauth/access_token`)
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('fb_exchange_token', inputToken)
    const res = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    const data = await res.json().catch(() => null) as { access_token?: unknown } | null
    return typeof data?.access_token === 'string' && data.access_token.length > 0
      ? { token: data.access_token, exchanged: true }
      : { token: inputToken, exchanged: false }
  } catch {
    return { token: inputToken, exchanged: false }
  }
}

/** Can the page token read insights on THIS project's latest Facebook post? A diagnostic, never a gate. */
async function probeReadInsights(projectId: string, pageId: string, pageToken: string): Promise<boolean> {
  try {
    const { data: lastFb } = await createAdminClient()
      .from('media_scripts')
      .select('facebook_post_id')
      .eq('project_id', projectId)
      .not('facebook_post_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const fbPostId = (lastFb as { facebook_post_id?: string } | null)?.facebook_post_id
    if (!fbPostId) return false
    const auth = { Authorization: `Bearer ${pageToken}` }
    const video = await fetch(`${FB_GRAPH}/${fbPostId}?fields=post_id`, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    const videoData = await video.json().catch(() => null) as { post_id?: unknown } | null
    const rawPostId = typeof videoData?.post_id === 'string' ? videoData.post_id : fbPostId
    const probeId = rawPostId.includes('_') ? rawPostId : `${pageId}_${rawPostId}`
    const res = await fetch(`${FB_GRAPH}/${probeId}/insights?metric=post_impressions`, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    const data = await res.json().catch(() => null) as { data?: unknown; error?: unknown } | null
    return !!data && !data.error && Array.isArray(data.data)
  } catch {
    return false
  }
}

/** What an attestation failure means for the operator, the audit stage and the HTTP answer. */
function attestationRefusal(failure: IdentityFailure, platform: 'instagram' | 'facebook', againstBinding: boolean) {
  if (failure === 'provider_unavailable') {
    return { stage: 'provider_verification' as const, status: 503,
      error: `${LABEL[platform]} kunde inte nås för att verifiera kontot. Inget har sparats — försök igen.` }
  }
  if (failure === 'credential_invalid') {
    return { stage: 'provider_verification' as const, status: 400,
      error: `${LABEL[platform]} godtog inte credentialn. Inget har sparats.` }
  }
  if (failure === 'account_ambiguous') {
    return { stage: 'provider_verification' as const, status: 400,
      error: 'Credentialn når flera Instagram-konton och inget kunde väljas. Inget har sparats.' }
  }
  return againstBinding
    ? { stage: 'account_mismatch' as const, status: 409,
        error: `Credentialn når inte projektets kopplade ${LABEL[platform]}-konto. Inget har sparats.` }
    : { stage: 'provider_verification' as const, status: 400,
        error: platform === 'facebook'
          ? 'Credentialn når inte sidan med det angivna sid-id:t. Inget har sparats.'
          : 'Credentialn når inget Instagram-konto. Inget har sparats.' }
}

function bindingRefusal(failure: BindingWriteFailure, platform: 'instagram' | 'facebook') {
  if (failure === 'account_bound_to_other_project') {
    return { stage: 'account_bound_to_other_project' as const, status: 409,
      error: `Kontot är redan kopplat till ett annat projekt. Ett ${LABEL[platform]}-konto kan bara tillhöra ett projekt. Inget har sparats.` }
  }
  if (failure === 'project_already_bound' || failure === 'binding_changed') {
    return { stage: 'binding' as const, status: 409,
      error: 'Projektets kontobindning ändrades under tiden. Läs in sidan igen och försök på nytt. Inget har sparats.' }
  }
  return { stage: 'binding' as const, status: 500,
    error: 'Kontobindningen kunde inte skrivas. Inget har sparats.' }
}

export async function POST(request: Request) {
  // ── 1. PLATFORM OPERATOR (Settings S0) — first, before anything else ──────
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    if (operator.reason === 'unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // One answer for every reason; the reason itself stays in the server log.
    console.warn(`[media/token] denied: ${operator.reason}`)
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
      error: 'Ange projektet (project_id). En credential sparas alltid för ett uttryckligt projekt — det finns inget standardprojekt.',
    }, { status: 400 })
  }

  const rawPlatform = body.platform
  if (rawPlatform !== 'instagram' && rawPlatform !== 'facebook') {
    return NextResponse.json({ error: "platform måste vara 'instagram' eller 'facebook'" }, { status: 400 })
  }
  const platform: 'instagram' | 'facebook' = rawPlatform === 'instagram' ? 'instagram' : 'facebook'

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token || token.length < 50) {
    return NextResponse.json({ error: 'Tokenet ser för kort ut — klistra in hela värdet' }, { status: 400 })
  }

  // Absent, null or 0 means no expiry, as before; anything else must be a real number of days.
  const rawDays = body.expires_days
  const expiresDays = typeof rawDays === 'number' && Number.isFinite(rawDays) ? rawDays : null
  if (rawDays !== undefined && rawDays !== null && (expiresDays === null || expiresDays < 0 || expiresDays > MAX_EXPIRES_DAYS)) {
    return NextResponse.json({ error: `expires_days måste vara ett antal dagar mellan 0 och ${MAX_EXPIRES_DAYS}` }, { status: 400 })
  }

  if (body.change_account !== undefined && typeof body.change_account !== 'boolean') {
    return NextResponse.json({ error: 'change_account måste vara true eller false' }, { status: 400 })
  }
  const changeAccount = body.change_account === true

  const rawPageId = body.page_id
  const pageId = typeof rawPageId === 'string' ? rawPageId.trim() : null
  if (rawPageId !== undefined && rawPageId !== null
      && (platform !== 'facebook' || !pageId || !EXTERNAL_ACCOUNT_ID.test(pageId))) {
    return NextResponse.json({ error: 'page_id måste vara ett Facebook-sid-id och gäller bara Facebook' }, { status: 400 })
  }

  // ── 3. OWNERSHIP OF THIS PROJECT (C-1) ────────────────────────────────────
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  // ── 4. THE PROJECT'S BINDING, AND WHAT THIS REQUEST MAY DO WITH IT ───────
  const bindingRead = await readActiveBinding(projectId, platform)
  if (!bindingRead.ok) {
    return NextResponse.json({
      ok: false, replaced: false,
      error: 'Projektets kontobindning kunde inte läsas. Inget har skickats eller sparats.',
    }, { status: 503 })
  }
  const binding = bindingRead.binding

  if (changeAccount && !binding) {
    return NextResponse.json({
      error: `Projektet har inget kopplat ${LABEL[platform]}-konto att byta. Lägg till kontot utan kontobyte.`,
    }, { status: 400 })
  }

  let targetPageId: string | null = null
  if (platform === 'facebook') {
    if (binding && !changeAccount) {
      if (pageId && pageId !== binding.externalAccountId) {
        return NextResponse.json({
          error: 'Sid-id:t avviker från projektets kopplade sida. Välj "Byt konto" om projektet ska få en annan sida.',
        }, { status: 400 })
      }
      targetPageId = binding.externalAccountId
    } else {
      if (!pageId) {
        return NextResponse.json({
          error: binding ? 'Ange sid-id för den nya sidan (page_id).' : 'Ange sid-id (page_id) för projektets Facebook-sida.',
        }, { status: 400 })
      }
      targetPageId = pageId
    }
  }

  // ── 5. AUDIT: attempted — before any provider contact or store ────────────
  const operationId = randomUUID()
  const audit = { operationId, projectId, platform, actor: operator.actor }
  const attempted = await recordCredentialEvent({ ...audit, outcome: 'attempted' })
  if (!attempted.ok) {
    console.error(`[media/token] audit: attempted event not recorded (operation ${operationId}, project ${projectId}, ${platform}, code ${attempted.code}) — nothing contacted, exchanged or stored`)
    return NextResponse.json({
      ok: false,
      replaced: false,
      operation_id: operationId,
      error: 'Ersättningen kunde inte revisionsloggas och har inte genomförts. Inget token har skickats till plattformen eller sparats.',
    }, { status: 503 })
  }

  // Every refusal from here on is audited as the one terminal event of this operation.
  const refuse = async (stage: CredentialFailureStage, status: number, error: string, attestedAccount: string | null = null) => {
    const terminal = await recordCredentialEvent({
      ...audit, outcome: 'failed', detail: { failure_stage: stage }, externalAccountId: attestedAccount,
    })
    if (!terminal.ok) {
      console.error(`[media/token] audit: failed event not recorded (operation ${operationId}, ${platform}, project ${projectId}, code ${terminal.code}) — the credential was not replaced`)
      return NextResponse.json({
        ok: false, replaced: false, operation_id: operationId,
        audit_incident: 'terminal_event_not_recorded', error,
      }, { status: 500 })
    }
    return NextResponse.json({ ok: false, replaced: false, operation_id: operationId, refusal: stage, error }, { status })
  }

  // ── 6. PROVIDER ATTESTATION ───────────────────────────────────────────────
  let accountId: string
  let accountLabel: string | null
  let credentialToStore: string
  let expiresAt: Date | null = null
  let detail: CredentialEventDetail = {}
  let facebookDiag: { exchanged: boolean; pageResolved: boolean; readInsightsOk: boolean } | null = null
  const againstBinding = !!binding && !changeAccount

  try {
    if (platform === 'instagram') {
      const identity = await attestInstagramCredential(token, againstBinding ? binding!.externalAccountId : null)
      if (!identity.ok) {
        const r = attestationRefusal(identity.failure, platform, againstBinding)
        return await refuse(r.stage, r.status, r.error)
      }
      accountId = identity.accountId
      accountLabel = identity.username
      credentialToStore = token
      expiresAt = expiresDays ? new Date(Date.now() + expiresDays * DAY_MS) : null
      detail = expiresAt ? { expires_at: expiresAt.toISOString() } : {}
    } else {
      const exchange = await exchangeLongLived(token)
      const page = await attestFacebookPage(exchange.token, targetPageId!)
      if (!page.ok) {
        const r = attestationRefusal(page.failure, platform, againstBinding)
        return await refuse(r.stage, r.status, r.error)
      }
      accountId = page.pageId
      accountLabel = page.pageName
      credentialToStore = page.pageToken
      const readInsightsOk = await probeReadInsights(projectId, page.pageId, page.pageToken)
      facebookDiag = { exchanged: exchange.exchanged, pageResolved: true, readInsightsOk }
      detail = { exchanged: exchange.exchanged, page_resolved: true, read_insights_ok: readInsightsOk }
    }
  } catch {
    return await refuse('unexpected', 500, 'Credentialn kunde inte verifieras. Inget har sparats.')
  }

  // ── 7. BINDING (O1) — decided before anything is stored ───────────────────
  let bindingAction: CredentialBindingAction
  if (binding && !changeAccount) {
    if (accountId !== binding.externalAccountId) {
      return await refuse('account_mismatch', 409,
        `Credentialn tillhör ett annat ${LABEL[platform]}-konto än projektets kopplade. Inget har sparats. Välj "Byt konto" om projektet ska byta konto.`,
        accountId)
    }
    bindingAction = 'matched'
  } else if (!binding) {
    const created = await createBinding({ projectId, platform, externalAccountId: accountId, accountLabel, boundBy: operator.actor })
    if (!created.ok) {
      const r = bindingRefusal(created.failure, platform)
      return await refuse(r.stage, r.status, r.error, accountId)
    }
    bindingAction = 'created'
  } else {
    if (accountId === binding.externalAccountId) {
      return await refuse('binding', 400,
        'Kontot är redan projektets kopplade konto. Ersätt credentialn utan kontobyte.', accountId)
    }
    const rebound = await rebindAccount({
      projectId, platform, expectedBindingId: binding.bindingId,
      externalAccountId: accountId, accountLabel, boundBy: operator.actor,
    })
    if (!rebound.ok) {
      const r = bindingRefusal(rebound.failure, platform)
      return await refuse(r.stage, r.status, r.error, accountId)
    }
    bindingAction = 'rebound'
  }

  // ── 8. STORE — the attested account's credential, for this project ────────
  const stored = await storeCredential(projectId, platform, { accessToken: credentialToStore, accountId, expiresAt })
  if (!stored.ok) {
    return await refuse('store', 500, 'Credentialn kunde inte sparas. Den tidigare credentialn är kvar men matchar inte längre ett bytt konto.', accountId)
  }

  if (bindingAction === 'matched') {
    // The platform just answered with the binding's own account: record it (never fatal).
    await recordProviderAttestation(binding!, accountLabel)
  }

  // ── 9. AUDIT: terminal — exactly one, same operation ──────────────────────
  const terminal = await recordCredentialEvent({
    ...audit, outcome: 'replaced', detail, externalAccountId: accountId, bindingAction,
  })

  if (!terminal.ok) {
    // AUDIT INTEGRITY INCIDENT. The credential was replaced; the record of it was
    // not completed. Not undone, not hidden.
    console.error(`[media/token] AUDIT INTEGRITY INCIDENT: ${platform} credential replaced for project ${projectId} (account ${accountId}, ${bindingAction}) but the replaced event was not recorded (operation ${operationId}, code ${terminal.code})`)
    return NextResponse.json({
      ok: false,
      replaced: true,
      operation_id: operationId,
      audit_incident: 'terminal_event_not_recorded',
      error: 'Tokenet ersattes, men revisionsloggen kunde inte slutföras. Ersättningen är inte ångrad — detta är en revisionsincident.',
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    platform,
    project_id: projectId,
    account: { id: accountId, label: accountLabel, binding_action: bindingAction },
    expires_at: expiresAt?.toISOString() ?? null,
    ...(facebookDiag ?? {}),
    replaced: true,
    operation_id: operationId,
  })
}
