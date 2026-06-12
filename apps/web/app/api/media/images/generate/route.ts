/**
 * POST /api/media/images/generate
 *
 * Generates 5 cinematic scene images for a script using Claude + Ideogram v3.
 * Uploads images to Supabase Storage and saves URLs to media_scripts.images.
 *
 * Body: { script_id: string }
 * Returns: { ok: true, images: string[] }
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSceneImages } from '@/lib/media/ideogram'
import { uploadSceneImage } from '@/lib/media/storage'
import { NextResponse } from 'next/server'

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
  const { data: script, error } = await db
    .from('media_scripts')
    .select('id, hook, script, project_id')
    .eq('id', script_id)
    .single()

  if (error || !script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const projectId = script.project_id
  if (!projectId) {
    return NextResponse.json({ error: 'Script is missing project_id' }, { status: 422 })
  }

  try {
    // Generate scene images via Claude + Ideogram
    const sceneImages = await generateSceneImages(script.script ?? '', script.hook ?? '')

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
