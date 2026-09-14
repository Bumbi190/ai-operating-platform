/**
 * facebook.ts — Facebook Page video publishing on behalf of one verified page.
 *
 * Posts a video to a Facebook Page using the Graph API.
 *
 * CREDENTIAL (project-scoped social credentials, 2026-09-14). The caller passes a
 * FacebookCredential resolved by lib/media/social-credentials.ts for the project
 * whose content is being published: the page id is that project's bound page, and
 * the page token is the one Meta confirmed IS that page. This module reads no
 * environment variable and resolves no page itself — it cannot pick a page, only
 * post to the one it is handed.
 *
 * Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */

import { toMetaApiError, toNetworkError, type MetaErrorPayload } from './meta-errors'

const BASE = 'https://graph.facebook.com/v21.0'

/** What a post to one verified page needs. A verified FacebookCredential satisfies it. */
export interface FacebookApiCredential {
  pageId: string
  pageToken: string
}

export interface FacebookPublishResult {
  postId: string
  url?: string
}

/** Post a video to the credential's own page. */
export async function postReelToFacebook(
  credential: FacebookApiCredential,
  videoUrl: string,
  description: string,
  onProgress?: (step: 'uploading' | 'publishing', pct: number) => void,
): Promise<FacebookPublishResult> {
  onProgress?.('uploading', 20)

  const params = new URLSearchParams({
    file_url:     videoUrl,
    description,
    published:    'true',
  })

  // Token som header, aldrig i URL/body som kan hamna i loggar.
  let res: Response
  try {
    res = await fetch(`${BASE}/${credential.pageId}/videos`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${credential.pageToken}` },
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
  const url    = `https://www.facebook.com/${credential.pageId}/videos/${postId}`

  onProgress?.('publishing', 100)

  return { postId, url }
}
