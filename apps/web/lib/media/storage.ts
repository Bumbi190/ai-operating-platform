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
