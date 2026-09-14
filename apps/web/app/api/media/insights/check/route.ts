/**
 * GET /api/media/insights/check?project_id=<uuid>
 *
 * Verifierar att ett projekts VERIFIERADE Instagram-credential har behörighet att
 * läsa insights. Gör ETT riktigt Graph-anrop mot projektets senast publicerade
 * inlägg och rapporterar resultatet.
 *
 * Svar:
 *   { ok: true,  sample: {...} }                      → insights fungerar
 *   { ok: false, reason: 'permission' | 'error' | 'no_media' | 'no_token' | 'project_required', message }  → åtgärd krävs
 *
 * PROJECT-SCOPED (2026-09-14). The check always concerns ONE project the caller owns,
 * named explicitly, and uses that project's verified credential
 * (lib/media/social-credentials.ts) against that project's own post. There is no
 * default project and no platform-wide token.
 *
 * REDACTION (Settings S0). The provider's own error text used to be returned
 * verbatim as `error`. It is classified here instead: only the class and a fixed
 * sentence reach the browser, and the provider text — passed through
 * redactSecrets() — stays in the server log.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { isProjectId } from '@/lib/media/social-bindings'
import { resolveInstagramCredential } from '@/lib/media/social-credentials'
import { fetchMediaInsights } from '@/lib/media/insights'
import { redactSecrets } from '@/lib/media/meta-errors'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // A human session first, checked here: G3C records this route as session-only
  // operator execution (lib/qa/stop-authority-authorization.test.ts).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const projectId = new URL(request.url).searchParams.get('project_id')
  if (!isProjectId(projectId)) {
    return NextResponse.json({
      ok: false,
      reason: 'project_required',
      message: 'Ange projektet (project_id). Kontrollen gäller alltid ett projekts egen credential.',
    }, { status: 400 })
  }
  // ISOLATION. The caller must own the project whose credential and post are used.
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  const instagram = await resolveInstagramCredential(projectId)
  if (!instagram.ok) {
    return NextResponse.json({
      ok: false,
      reason: 'no_token',
      refusal: instagram.refusal,
      message: 'Projektet har ingen verifierad Instagram-credential.',
    })
  }

  const db = createAdminClient()
  const { data: script } = await (db.from('media_scripts') as any)
    .select('id, instagram_media_id, hook')
    .eq('project_id', projectId)
    .eq('status', 'published')
    .not('instagram_media_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!script?.instagram_media_id) {
    return NextResponse.json({
      ok: false,
      reason: 'no_media',
      message: 'Inga publicerade Instagram-inlägg med media-id att testa mot ännu.',
    })
  }

  const result = await fetchMediaInsights(script.instagram_media_id, instagram.credential.token)
  if (result.ok) {
    return NextResponse.json({ ok: true, sample: result.metrics, testedPost: script.hook ?? script.instagram_media_id })
  }
  const reason = /permission|insights|oauth|scope/i.test(result.error ?? '') ? 'permission' : 'error'
  console.warn(`[insights/check] Graph API refused insights (${reason}): ${redactSecrets(result.error ?? 'okänt fel')}`)
  return NextResponse.json({
    ok: false,
    reason,
    message: reason === 'permission'
      ? 'Graph API nekade insights-anropet. Tokenet saknar troligen instagram_manage_insights.'
      : 'Insights kunde inte läsas från Graph API.',
  })
}
