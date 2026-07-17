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
 *
 * NOTE: Business/Creator accounts must use graph.facebook.com (not graph.instagram.com)
 */

const FB_BASE = 'https://graph.facebook.com/v21.0'
const IG_BASE = 'https://graph.instagram.com/v21.0'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

let cachedIgUserId: string | null = null

/**
 * Resolves the correct API base + IG user id for the current token.
 *
 * - IGAA token (Instagram Login, starts "IG") → graph.instagram.com, id from /me.
 *   These tokens are long-lived (60d) and decoupled from the Facebook web session,
 *   so they don't die when the FB session logs out.
 * - EAA token (Facebook Login) → graph.facebook.com with INSTAGRAM_USER_ID (legacy path).
 */
async function resolveIgApi(): Promise<{ base: string; userId: string; token: string; isIgLogin: boolean }> {
  const token = requireEnv('INSTAGRAM_ACCESS_TOKEN')
  const isIgLogin = token.startsWith('IG')

  if (!isIgLogin) {
    return { base: FB_BASE, userId: requireEnv('INSTAGRAM_USER_ID'), token, isIgLogin }
  }

  let userId = cachedIgUserId
  if (!userId) {
    const res = await fetch(`${IG_BASE}/me?fields=user_id&access_token=${encodeURIComponent(token)}`)
    const data = await res.json() as { user_id?: string; id?: string; error?: { message: string } }
    const resolved = data.user_id ?? data.id
    if (!res.ok || !resolved) {
      throw new Error(data.error?.message ?? `Could not resolve Instagram user id (${res.status})`)
    }
    userId = String(resolved)
    cachedIgUserId = userId
  }
  return { base: IG_BASE, userId, token, isIgLogin }
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
  const { base, userId, token, isIgLogin } = await resolveIgApi()
  const fbPageId = process.env.FACEBOOK_PAGE_ID  // optional — FB cross-post (FB-login path only)

  const params = new URLSearchParams({
    media_type:    'REELS',
    video_url:     videoUrl,
    caption,
    share_to_feed: 'true',
    access_token:  token,
  })

  // Cross-post to Facebook Page automatically if FACEBOOK_PAGE_ID is set.
  // Only supported on the Facebook-login path; graph.instagram.com rejects it.
  if (fbPageId && !isIgLogin) {
    params.set('cross_post_to_facebook_page_id', fbPageId)
  }

  if (coverImageUrl) {
    params.set('thumb_offset', '0')
  }

  const res = await fetch(`${base}/${userId}/media`, {
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
  timeoutMs  = 300_000,  // 5 minutes default; pass lower value for short-lived crons
  intervalMs = 5_000,
): Promise<void> {
  const { base, token } = await resolveIgApi()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))

    const res = await fetch(
      `${base}/${creationId}?fields=status_code,status&access_token=${token}`
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

  throw new Error(`Instagram video processing timed out after ${Math.round(timeoutMs / 1000)}s`)
}

// ─── Step 3: Publish container ────────────────────────────────────────────────

export async function publishContainer(creationId: string): Promise<PublishResult> {
  const { base, userId, token } = await resolveIgApi()

  const params = new URLSearchParams({
    creation_id:  creationId,
    access_token: token,
  })

  const res = await fetch(`${base}/${userId}/media_publish`, {
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
    `${base}/${data.id}?fields=permalink&access_token=${token}`
  )
  const mediaData = await mediaRes.json() as { permalink?: string }

  return {
    mediaId:   data.id,
    permalink: mediaData.permalink,
  }
}

// ─── Caption builder ──────────────────────────────────────────────────────────

export function buildInstagramCaption(opts: {
  hook:        string
  cta?:        string
  hashtags?:   string[]
  sourceUrl?:  string
  sourceName?: string
}): string {
  const parts: string[] = []

  parts.push(opts.hook)

  if (opts.cta) {
    parts.push('')
    parts.push(opts.cta)
  }

  // Source attribution — transparent journalism, no GDPR issues (public URL)
  if (opts.sourceUrl) {
    parts.push('')
    const label = opts.sourceName ? `📰 Source: ${opts.sourceName}` : '📰 Source'
    parts.push(`${label}`)
    parts.push(opts.sourceUrl)
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
