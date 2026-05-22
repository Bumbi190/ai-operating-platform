/**
 * instagram.ts — Instagram Graph API publishing for The Prompt.
 *
 * Flow for posting a Reel:
 *   1. createMediaContainer() — upload video URL + caption → returns creation_id
 *   2. pollUntilReady()       — wait for Instagram to process the video
 *   3. publishContainer()     — make it live on the profile
 *
 * Required env vars:
 *   INSTAGRAM_ACCESS_TOKEN   — long-lived token from Meta Developer portal
 *   INSTAGRAM_USER_ID        — numeric IG Business account ID (e.g. 17841437027967629)
 *
 * Docs: https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
 */

const BASE = 'https://graph.instagram.com/v21.0'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaStatus =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED'

export interface PublishResult {
  mediaId: string        // Instagram post ID
  permalink?: string     // Public URL to the post
}

// ─── Step 1: Create media container ──────────────────────────────────────────

export async function createReelContainer(
  videoUrl: string,
  caption: string,
  coverImageUrl?: string,
): Promise<string> {
  const userId = requireEnv('INSTAGRAM_USER_ID')
  const token  = requireEnv('INSTAGRAM_ACCESS_TOKEN')

  const params = new URLSearchParams({
    media_type:    'REELS',
    video_url:     videoUrl,
    caption,
    share_to_feed: 'true',
    access_token:  token,
  })

  if (coverImageUrl) {
    params.set('thumb_offset', '0')
  }

  const res = await fetch(`${BASE}/${userId}/media`, {
    method: 'POST',
    body:   params,
  })

  const data = await res.json() as { id?: string; error?: { message: string } }

  if (!res.ok || !data.id) {
    throw new Error(
      data.error?.message ?? `Instagram container creation failed (${res.status})`
    )
  }

  return data.id  // creation_id
}

// ─── Step 2: Poll until video is processed ───────────────────────────────────

export async function pollUntilReady(
  creationId: string,
  timeoutMs  = 300_000,  // 5 minutes
  intervalMs = 5_000,
): Promise<void> {
  const token = requireEnv('INSTAGRAM_ACCESS_TOKEN')
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))

    const res = await fetch(
      `${BASE}/${creationId}?fields=status_code,status&access_token=${token}`
    )
    const data = await res.json() as { status_code?: MediaStatus; status?: string; error?: { message: string } }

    if (!res.ok) {
      throw new Error(data.error?.message ?? `Poll failed (${res.status})`)
    }

    const status = data.status_code

    if (status === 'FINISHED') return
    if (status === 'ERROR')    throw new Error(`Instagram video processing failed: ${data.status}`)
    if (status === 'EXPIRED')  throw new Error('Instagram media container expired before publishing')
    // IN_PROGRESS — keep polling
  }

  throw new Error('Instagram video processing timed out after 5 minutes')
}

// ─── Step 3: Publish container ────────────────────────────────────────────────

export async function publishContainer(creationId: string): Promise<PublishResult> {
  const userId = requireEnv('INSTAGRAM_USER_ID')
  const token  = requireEnv('INSTAGRAM_ACCESS_TOKEN')

  const params = new URLSearchParams({
    creation_id:  creationId,
    access_token: token,
  })

  const res = await fetch(`${BASE}/${userId}/media_publish`, {
    method: 'POST',
    body:   params,
  })

  const data = await res.json() as { id?: string; error?: { message: string } }

  if (!res.ok || !data.id) {
    throw new Error(
      data.error?.message ?? `Instagram publish failed (${res.status})`
    )
  }

  // Fetch permalink
  const mediaRes = await fetch(
    `${BASE}/${data.id}?fields=permalink&access_token=${token}`
  )
  const mediaData = await mediaRes.json() as { permalink?: string }

  return {
    mediaId:   data.id,
    permalink: mediaData.permalink,
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function postReelToInstagram(
  videoUrl: string,
  caption:  string,
  onProgress?: (step: 'uploading' | 'processing' | 'publishing', pct: number) => void,
): Promise<PublishResult> {
  onProgress?.('uploading', 10)
  const creationId = await createReelContainer(videoUrl, caption)

  onProgress?.('processing', 30)
  await pollUntilReady(creationId)

  onProgress?.('publishing', 90)
  const result = await publishContainer(creationId)

  onProgress?.('publishing', 100)
  return result
}

// ─── Caption builder ──────────────────────────────────────────────────────────

export function buildInstagramCaption(opts: {
  hook:      string
  cta?:      string
  hashtags?: string[]
}): string {
  const parts: string[] = []

  parts.push(opts.hook)

  if (opts.cta) {
    parts.push('')
    parts.push(opts.cta)
  }

  parts.push('')
  parts.push('─────────────────')
  parts.push('📡 @theprompt.news')
  parts.push('AI news. Daily. No fluff.')

  if (opts.hashtags && opts.hashtags.length > 0) {
    parts.push('')
    parts.push(opts.hashtags.slice(0, 30).join(' '))
  }

  return parts.join('\n')
}
