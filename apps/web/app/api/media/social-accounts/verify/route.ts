/**
 * POST /api/media/social-accounts/verify — "Verifiera nu": ask the platform, right now,
 * whether a project's social credential still belongs to its bound account.
 *
 * Body: { project_id: uuid, platform: 'instagram' | 'facebook' | 'youtube' }
 *
 * Changes no credential and no binding identity. A match records the platform's
 * attestation on the binding — with the name the platform gave: the Instagram
 * username, the Facebook page name, the YouTube channel title when its scope allows
 * reading it — and the project's credential health. Any other outcome is recorded as
 * health only. The answer carries the bound account id, that name and closed codes;
 * never a token, never provider text.
 *
 * AUTHORITY. The platform operator, then ownership of THAT project — the same two
 * gates as replacing the credential (api/media/token). The project id is a selector,
 * never a permission.
 */
import { NextResponse } from 'next/server'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { isProjectId, readActiveBinding, SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/media/social-bindings'
import { verifyBindingHealth, writeCredentialHealth } from '@/lib/media/credential-health'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // ── Platform operator ────────────────────────────────────────────────────
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    if (operator.reason === 'unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.warn(`[social-accounts/verify] denied: ${operator.reason}`)
    return NextResponse.json({ error: 'Forbidden', denied: 'platform_operator_required' }, { status: 403 })
  }

  // ── Shape ────────────────────────────────────────────────────────────────
  let body: Record<string, unknown> | null
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 })
  }
  const projectId = body.project_id
  if (!isProjectId(projectId)) {
    return NextResponse.json({ error: 'Ange projektet (project_id).' }, { status: 400 })
  }
  const platform = body.platform
  if (typeof platform !== 'string' || !SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return NextResponse.json({ error: "platform måste vara 'instagram', 'facebook' eller 'youtube'" }, { status: 400 })
  }

  // ── Ownership of THIS project ────────────────────────────────────────────
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  // ── The binding, then the platform's answer ──────────────────────────────
  const read = await readActiveBinding(projectId, platform as SocialPlatform)
  if (!read.ok) {
    return NextResponse.json({ ok: false, refusal: 'binding_unreadable', error: 'Projektets kontobindning kunde inte läsas.' }, { status: 503 })
  }
  if (!read.binding) {
    return NextResponse.json({ ok: false, refusal: 'binding_missing', error: 'Projektet har inget kopplat konto på plattformen.' }, { status: 404 })
  }

  const verdict = await verifyBindingHealth(read.binding)
  const recorded = await writeCredentialHealth(read.binding, verdict, new Date().toISOString())

  return NextResponse.json({
    ok: verdict.status === 'ok' || verdict.status === 'warning',
    project_id: projectId,
    platform,
    account: { id: read.binding.externalAccountId, label: verdict.accountLabel ?? read.binding.accountLabel },
    status: verdict.status,
    identity_verified: verdict.identityVerified,
    refusal: verdict.refusal,
    recorded,
  }, { status: verdict.status === 'verification_failed' ? 503 : 200 })
}
