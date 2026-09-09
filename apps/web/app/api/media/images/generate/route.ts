/**
 * POST /api/media/images/generate
 *
 * Generates 5 cinematic scene images for a script using Claude + Ideogram v3.
 * Uploads images to Supabase Storage and saves URLs to media_scripts.images.
 *
 * Body: { script_id: string }
 * Returns: { ok: true, images: string[] }
 */
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSceneImages } from '@/lib/media/ideogram'
import { uploadSceneImage } from '@/lib/media/storage'
import { NextResponse } from 'next/server'
import { GLOBAL_ONLY, projectScope } from '@/lib/governance/execution-stop'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // image generation can take ~60s

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { script_id } = await request.json() as { script_id: string }
  if (!script_id) return NextResponse.json({ error: 'script_id required' }, { status: 400 })

  const db = createAdminClient()

  // Fetch the script
  // ISOLATION. The script id is a SELECTOR, not a permission: it arrives from the
  // caller and this lookup runs through the service-role client, so nothing about
  // the id proves the caller may act on it. The row's `project_id` was already
  // being read here — it was simply never checked against the caller's projects.
  //
  // NOTE ON governed spend: `projectScope({ projectId })` below is BILLING
  // attribution, not authorization. `lib/cost/governed-spend.ts` contains no
  // session check and no allow-list, and it attributes to a fixed platform slug.
  // A reader who sees `withGovernedSpend` and assumes the route is guarded would
  // be wrong; this is the guard.
  //
  // Selection and authorization are the SAME query, so a foreign script and a
  // missing one are indistinguishable, and the check cannot drift out of order.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)

  const { data: script, error: scriptError } = await db
    .from('media_scripts')
    .select('id, hook, script, project_id')
    .eq('id', script_id)
    .in('project_id', scopeProjectFilter(allowedProjectIds))
    .maybeSingle()

  if (scriptError || !script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const projectId = script.project_id
  if (!projectId) {
    return NextResponse.json({ error: 'Script is missing project_id' }, { status: 422 })
  }

  try {
    // Generate scene images via Claude + Ideogram
    const sceneImages = await generateSceneImages(script.script ?? '', script.hook ?? '', { context: 'OPERATOR_EXECUTION' as const, scope: projectScope({ projectId }) })

    // Upload each image to Supabase Storage
    const imageUrls = await Promise.all(
      sceneImages.map((img, i) =>
        uploadSceneImage(projectId, script.id, i, img.url)
      )
    )

    // Save URLs to the script record
    await db
      .from('media_scripts')
      .update({ images: imageUrls })
      .eq('id', script_id)

    return NextResponse.json({ ok: true, images: imageUrls })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[images/generate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
