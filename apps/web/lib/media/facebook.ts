/**
 * facebook.ts — Facebook Page video publishing for The Prompt.
 *
 * Posts a video to a Facebook Page using the Graph API.
 *
 * Required env vars:
 *   FACEBOOK_PAGE_ID           — numeric Page ID (e.g. 1138612202672850)
 *   FACEBOOK_PAGE_ACCESS_TOKEN — User OR Page access token with pages_manage_posts
 *                                + pages_read_engagement permissions.
 *                                If a User token is supplied the function
 *                                automatically exchanges it for the Page token.
 *
 * Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */

import { toMetaApiError, toNetworkError, type MetaErrorPayload } from './meta-errors'

const BASE = 'https://graph.facebook.com/v21.0'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

/**
 * Exchange a User Access Token for the Page Access Token.
 * If the supplied token is already a Page token this is a no-op (returns it as-is).
 */
async function resolvePageToken(userOrPageToken: string, pageId: string): Promise<string> {
  // Begär BARA id + access_token (ej fulla sid-objekt) och paginera — annars svarar
  // Graph API "reduce the amount of data you're requesting" när kontot har många/stora sidor.
  const res  = await fetch(`${BASE}/me/accounts?fields=id,access_token&limit=200`, {
    headers: { Authorization: `Bearer ${userOrPageToken}` },
  })
  const data = await res.json() as { data?: Array<{ id: string; access_token: string }> }
  const page = data.data?.find(p => p.id === pageId)
  // If we find a page-specific token, use it; otherwise the caller may already have one
  return page?.access_token ?? userOrPageToken
}

export interface FacebookPublishResult {
  postId: string
  url?: string
}

/**
 * Post a video to a Facebook Page.
 * Accepts either a User token or a Page token — always resolves to the correct Page token.
 */
export async function postReelToFacebook(
  videoUrl: string,
  description: string,
  onProgress?: (step: 'uploading' | 'publishing', pct: number) => void,
): Promise<FacebookPublishResult> {
  const pageId         = requireEnv('FACEBOOK_PAGE_ID')
  const rawToken       = requireEnv('FACEBOOK_PAGE_ACCESS_TOKEN')

  // Always resolve to a Page Access Token (handles both User and Page tokens)
  const pageToken = await resolvePageToken(rawToken, pageId)

  onProgress?.('uploading', 20)

  const params = new URLSearchParams({
    file_url:     videoUrl,
    description,
    published:    'true',
  })

  // Token som header, aldrig i URL/body som kan hamna i loggar.
  let res: Response
  try {
    res = await fetch(`${BASE}/${pageId}/videos`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${pageToken}` },
      body:    params,
    })
  } catch (err) {
    throw toNetworkError('fb_video_post', err)
  }

  const data = await res.json().catch(() => null) as { id?: string; error?: MetaErrorPayload } | null

  if (!res.ok || data?.error || !data?.id) {
    throw toMetaApiError('fb_video_post', res.status, data, 'Facebook video post failed')
  }

  onProgress?.('publishing', 90)

  const postId = data.id
  const url    = `https://www.facebook.com/${pageId}/videos/${postId}`

  onProgress?.('publishing', 100)

  return { postId, url }
}
