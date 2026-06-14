/**
 * Media storage service — uploads audio and video files to Supabase Storage.
 *
 * Bucket: 'media-assets'
 * Structure:
 *   media-assets/
 *     audio/{projectId}/{scriptId}.mp3
 *     video/{projectId}/{scriptId}.mp4
 *     data/{projectId}/{scriptId}-timing.json   ← word timing for Remotion
 */

import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'media-assets'

/**
 * Upload an audio buffer (mp3) to Supabase Storage.
 * Returns the public URL.
 */
export async function uploadAudio(
  projectId: string,
  scriptId: string,
  audioBuffer: Buffer,
): Promise<string> {
  const db = createAdminClient()
  const path = `audio/${projectId}/${scriptId}.mp3`

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = db.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return publicUrl
}

/**
 * Upload word-timing JSON to Supabase Storage.
 * Used by Remotion to sync subtitles.
 * Returns the public URL.
 */
export async function uploadTimingData(
  projectId: string,
  scriptId: string,
  timingData: unknown,
): Promise<string> {
  const db = createAdminClient()
  const path = `data/${projectId}/${scriptId}-timing.json`
  const content = Buffer.from(JSON.stringify(timingData))

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, content, {
      contentType: 'application/json',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = db.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return publicUrl
}

/**
 * Upload a scene image (jpg/png) from a remote URL to Supabase Storage.
 * Fetches the image from the source URL and re-hosts in our bucket.
 * Returns the public URL.
 */
export async function uploadSceneImage(
  projectId: string,
  scriptId: string,
  sceneIndex: number,
  sourceUrl: string,
): Promise<string> {
  const db = createAdminClient()

  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch image from ${sourceUrl}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : 'jpg'

  // Include timestamp in path so re-generated images always get a unique URL
  // (avoids browser caching the old image when the path/URL would otherwise be identical)
  const ts = Date.now()
  const storagePath = `images/${projectId}/${scriptId}-scene-${sceneIndex}-${ts}.${ext}`

  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType })

  if (error) throw new Error(`Image upload failed: ${error.message}`)

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  return publicUrl
}

/**
 * Upload a hero image for a website article from a remote URL to Supabase Storage.
 * Sibling of uploadSceneImage — same bucket, same re-host pattern, same timestamped
 * path for browser cache-busting. Path lives under `images/articles/` so the
 * article and social-reel paths are visually distinguishable in the bucket.
 *
 * No new validation infrastructure: trusts fetch.ok and the storage client error
 * exactly like uploadSceneImage does. There is ONE image-pipeline architecture.
 */
export async function uploadArticleHeroImage(
  projectId: string,
  articleId: string,
  sourceUrl: string,
): Promise<string> {
  const db = createAdminClient()

  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch image from ${sourceUrl}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : 'jpg'

  const ts = Date.now()
  const storagePath = `images/articles/${projectId}/${articleId}-hero-${ts}.${ext}`

  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType })

  if (error) throw new Error(`Article hero upload failed: ${error.message}`)

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  return publicUrl
}

/**
 * Upload a background music track (mp3) to Supabase Storage.
 * Returns the public URL.
 */
export async function uploadMusic(
  projectId: string,
  scriptId: string,
  audioBuffer: Buffer,
): Promise<string> {
  const db = createAdminClient()
  const path = `music/${projectId}/${scriptId}-bg.mp3`

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) throw new Error(`Music upload failed: ${error.message}`)

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/**
 * Upload a rendered video (mp4) to Supabase Storage.
 * Returns the public URL.
 */
export async function uploadVideo(
  projectId: string,
  scriptId: string,
  videoBuffer: Buffer,
): Promise<string> {
  const db = createAdminClient()
  const path = `video/${projectId}/${scriptId}.mp4`

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = db.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return publicUrl
}
