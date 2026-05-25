/**
 * facebook.ts — Facebook Page video publishing for The Prompt.
 *
 * Posts a video Reel to a Facebook Page using the Graph API.
 *
 * Required env vars:
 *   FACEBOOK_PAGE_ID           — numeric Page ID (e.g. 1138612202672850)
 *   FACEBOOK_PAGE_ACCESS_TOKEN — Page access token with pages_manage_posts +
 *                                pages_read_engagement permissions
 *
 * Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */

const BASE = 'https://graph.facebook.com/v21.0'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

export interface FacebookPublishResult {
  postId: string
  url?: string
}

/**
 * Post a video to a Facebook Page as a Reel.
 * Uses the resumable upload approach for reliability.
 */
export async function postReelToFacebook(
  videoUrl: string,
  description: string,
  onProgress?: (step: 'uploading' | 'publishing', pct: number) => void,
): Promise<FacebookPublishResult> {
  const pageId    = requireEnv('FACEBOOK_PAGE_ID')
  const pageToken = requireEnv('FACEBOOK_PAGE_ACCESS_TOKEN')

  onProgress?.('uploading', 20)

  // Step 1: Post video via URL (no upload needed — FB fetches it directly)
  const params = new URLSearchParams({
    file_url:     videoUrl,
    description,
    published:    'true',
    access_token: pageToken,
  })

  const res = await fetch(`${BASE}/${pageId}/videos`, {
    method: 'POST',
    body:   params,
  })

  const data = await res.json() as { id?: string; error?: { message: string } }

  if (!res.ok || !data.id) {
    throw new Error(
      data.error?.message ?? `Facebook video post failed (${res.status})`
    )
  }

  onProgress?.('publishing', 90)

  const postId = data.id
  const url    = `https://www.facebook.com/${pageId}/videos/${postId}`

  onProgress?.('publishing', 100)

  return { postId, url }
}
