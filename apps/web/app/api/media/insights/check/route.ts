/**
 * GET /api/media/insights/check
 *
 * Verifierar att Instagram-tokenet har behörighet att läsa insights.
 * Öppna i webbläsaren medan du är inloggad — den gör ETT riktigt Graph-anrop
 * mot ett av dina publicerade inlägg och rapporterar resultatet.
 *
 * Svar:
 *   { ok: true,  sample: {...} }                      → insights fungerar
 *   { ok: false, reason: 'permission' | 'no_media', error }  → åtgärd krävs
 */
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getToken } from '@/lib/media/token-store'
import { fetchMediaInsights } from '@/lib/media/insights'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stored = await getToken('instagram')
  if (!stored) return NextResponse.json({ ok: false, reason: 'no_token', message: 'Inget Instagram-token hittat.' })

  const db = createAdminClient()

  // ISOLATION. A live Settings diagnostic (`TokenUpdater.tsx`), so the caller is
  // an operator — but the probe row was chosen from EVERY tenant's published
  // scripts and the response echoes `script.hook`, which is content. Scope
  // precedes `.order()`/`.limit(1)`: with one slot to fill, an unscoped read
  // lets a newer foreign post take it outright, so filtering afterwards would
  // not merely be untidy, it would return the wrong row every time.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)

  const { data: script } = await (db.from('media_scripts') as any)
    .select('id, instagram_media_id, hook')
    .in('project_id', scopeProjectFilter(allowedProjectIds))
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

  const result = await fetchMediaInsights(script.instagram_media_id, stored.accessToken)
  if (result.ok) {
    return NextResponse.json({ ok: true, sample: result.metrics, testedPost: script.hook ?? script.instagram_media_id })
  }
  return NextResponse.json({
    ok: false,
    reason: /permission|insights|oauth|scope/i.test(result.error ?? '') ? 'permission' : 'error',
    message: 'Graph API nekade insights-anropet. Tokenet saknar troligen instagram_manage_insights.',
    error: result.error,
  })
}
