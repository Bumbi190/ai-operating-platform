/**
 * instagram.ts — Instagram Graph API publishing for The Prompt.
 *
 * Flow for posting a Reel:
 *   1. createReelContainer()  — upload video URL + caption → returns creation_id
 *   2. getContainerStatus()   — validera containern INNAN den används (nytt)
 *   3. pollUntilReady()       — wait for Instagram to process the video
 *   4. publishContainer()     — make it live on the profile
 *
 * Required env vars:
 *   INSTAGRAM_ACCESS_TOKEN   — long-lived token from Meta Developer portal
 *   INSTAGRAM_USER_ID        — numeric IG Business account ID (e.g. 17841437027967629)
 *
 * Docs: https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
 *
 * NOTE: Business/Creator accounts must use graph.facebook.com (not graph.instagram.com)
 *
 * SÄKERHET (ändrat 2026-07-19): access token skickas som Authorization-header,
 * ALDRIG som query-parameter. Tidigare låg token i URL:en, vilket innebar att
 * varje loggat fel som innehöll URL:en läckte en långlivad credential.
 */

import {
  MetaApiError,
  toMetaApiError,
  toNetworkError,
  type MetaErrorPayload,
} from './meta-errors'

const FB_BASE = 'https://graph.facebook.com/v21.0'
const IG_BASE = 'https://graph.instagram.com/v21.0'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

let cachedIgUserId: string | null = null

/** Nollställer den modul-lokala user-id-cachen (används av tester). */
export function __resetIgCache(): void {
  cachedIgUserId = null
}

/**
 * Enda vägen ut mot Meta. Sätter Authorization-header, parsar JSON och kastar
 * alltid ett strukturerat MetaApiError vid fel. `endpoint` är en etikett, inte
 * en URL — inga query-parametrar kan därmed läcka in i loggar.
 */
async function metaFetch<T>(
  url:      string,
  token:    string,
  endpoint: string,
  init?:    { method?: 'GET' | 'POST'; body?: URLSearchParams },
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method:  init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}` },
      body:    init?.body,
    })
  } catch (err) {
    throw toNetworkError(endpoint, err)
  }

  let data: (T & { error?: MetaErrorPayload }) | null = null
  try {
    data = await res.json() as T & { error?: MetaErrorPayload }
  } catch {
    // Ogiltig JSON — behandla som transient serverfel
    throw toMetaApiError(endpoint, res.status, null, 'Ogiltigt svar från Meta')
  }

  if (!res.ok || data?.error) {
    throw toMetaApiError(endpoint, res.status, data)
  }

  return data
}

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
    const data = await metaFetch<{ user_id?: string; id?: string }>(
      `${IG_BASE}/me?fields=user_id`, token, 'me',
    )
    const resolved = data.user_id ?? data.id
    if (!resolved) {
      throw new MetaApiError({
        message:    'Could not resolve Instagram user id',
        httpStatus: 200,
        endpoint:   'me',
      })
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

/** Resultatet av en containervalidering. NOT_FOUND = Meta känner inte till id:t. */
export type ContainerStatus = MediaStatus | 'NOT_FOUND' | 'UNKNOWN'

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
  })

  // Cross-post to Facebook Page automatically if FACEBOOK_PAGE_ID is set.
  // Only supported on the Facebook-login path; graph.instagram.com rejects it.
  if (fbPageId && !isIgLogin) {
    params.set('cross_post_to_facebook_page_id', fbPageId)
  }

  if (coverImageUrl) {
    params.set('thumb_offset', '0')
  }

  const data = await metaFetch<{ id?: string }>(
    `${base}/${userId}/media`, token, 'media_create', { method: 'POST', body: params },
  )

  if (!data.id) {
    throw new MetaApiError({
      message:    'Instagram container creation returned no id',
      httpStatus: 200,
      endpoint:   'media_create',
    })
  }

  return data.id  // creation_id
}

// ─── Step 2a: Validera en befintlig container (NYTT) ─────────────────────────

/**
 * Läser containerns aktuella status hos Meta. Rent GET-anrop — publicerar,
 * ändrar eller raderar ingenting.
 *
 * Detta är kärnan i fixen för incidenten 2026-07-19: tidigare återanvändes ett
 * sparat creation_id utan att någon någonsin frågade Meta om containern
 * fortfarande gick att publicera.
 *
 * Returnerar 'NOT_FOUND' om Meta inte känner till id:t (container städad bort),
 * och 'UNKNOWN' om svaret saknar status_code.
 */
export async function getContainerStatus(creationId: string): Promise<ContainerStatus> {
  const { base, token } = await resolveIgApi()

  try {
    const data = await metaFetch<{ status_code?: MediaStatus; status?: string }>(
      `${base}/${creationId}?fields=status_code,status`, token, 'container_status',
    )
    return data.status_code ?? 'UNKNOWN'
  } catch (err) {
    // Okänt objekt → containern finns inte längre. Kod 803 / subkod 2207006,
    // eller HTTP 404. Allt annat bubblar upp som riktiga fel.
    if (err instanceof MetaApiError) {
      if (err.httpStatus === 404 || err.code === 803 || err.subcode === 2207006) {
        return 'NOT_FOUND'
      }
    }
    throw err
  }
}

/**
 * Hämtar publicerad media för ett creation_id vars status är PUBLISHED.
 * Används för att återhämta ett tappat svar: Meta hann publicera men vårt
 * HTTP-svar gick förlorat, så DB tror att inget hände.
 *
 * Returnerar null om permalink inte kan resolvas — anroparen får då markera
 * posten som publicerad utan länk i stället för att publicera igen.
 */
export async function resolvePublishedMedia(creationId: string): Promise<PublishResult | null> {
  const { base, token } = await resolveIgApi()
  try {
    const data = await metaFetch<{ id?: string; permalink?: string }>(
      `${base}/${creationId}?fields=id,permalink`, token, 'container_resolve',
    )
    if (!data.id) return null
    return { mediaId: String(data.id), permalink: data.permalink }
  } catch {
    return null
  }
}

// ─── Step 2b: Poll until video is processed ──────────────────────────────────

export async function pollUntilReady(
  creationId: string,
  timeoutMs  = 300_000,  // 5 minutes default; pass lower value for short-lived crons
  intervalMs = 5_000,
): Promise<void> {
  const { base, token } = await resolveIgApi()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))

    const data = await metaFetch<{ status_code?: MediaStatus; status?: string }>(
      `${base}/${creationId}?fields=status_code,status`, token, 'container_poll',
    )

    const status = data.status_code

    if (status === 'FINISHED')  return
    // Publicerad medan vi pollade (t.ex. av en parallell körning) — inte ett fel.
    if (status === 'PUBLISHED') return
    if (status === 'ERROR') {
      throw new MetaApiError({
        message:         'Instagram video processing failed',
        httpStatus:      200,
        endpoint:        'container_poll',
        containerStatus: 'ERROR',
        subcode:         2207053,
      })
    }
    if (status === 'EXPIRED') {
      throw new MetaApiError({
        message:         'Instagram media container expired before publishing',
        httpStatus:      200,
        endpoint:        'container_poll',
        containerStatus: 'EXPIRED',
        subcode:         2207020,
      })
    }
    // IN_PROGRESS — keep polling
  }

  // Timeout är transient: nästa körning kan lyckas med samma container.
  throw new MetaApiError({
    message:    `Instagram video processing timed out after ${Math.round(timeoutMs / 1000)}s`,
    httpStatus: 0,
    endpoint:   'container_poll',
  })
}

// ─── Step 3: Publish container ────────────────────────────────────────────────

export async function publishContainer(creationId: string): Promise<PublishResult> {
  const { base, userId, token } = await resolveIgApi()

  const params = new URLSearchParams({ creation_id: creationId })

  const data = await metaFetch<{ id?: string }>(
    `${base}/${userId}/media_publish`, token, 'media_publish', { method: 'POST', body: params },
  )

  if (!data.id) {
    throw new MetaApiError({
      message:    'Instagram publish returned no media id',
      httpStatus: 200,
      endpoint:   'media_publish',
    })
  }

  // Fetch permalink — icke-kritiskt, ett fel här får inte kasta bort en
  // lyckad publicering (posten ÄR live vid det här laget).
  let permalink: string | undefined
  try {
    const mediaData = await metaFetch<{ permalink?: string }>(
      `${base}/${data.id}?fields=permalink`, token, 'media_permalink',
    )
    permalink = mediaData.permalink
  } catch {
    permalink = undefined
  }

  return { mediaId: String(data.id), permalink }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function postReelToInstagram(
  videoUrl:       string,
  caption:        string,
  onProgress?:    (step: 'uploading' | 'processing' | 'publishing', pct: number) => void,
  pollTimeoutMs?: number,   // override poll timeout — use ~50000 for Vercel Hobby crons
): Promise<PublishResult> {
  onProgress?.('uploading', 10)
  const creationId = await createReelContainer(videoUrl, caption)

  onProgress?.('processing', 30)
  await pollUntilReady(creationId, pollTimeoutMs)

  onProgress?.('publishing', 90)
  const result = await publishContainer(creationId)

  onProgress?.('publishing', 100)
  return result
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
