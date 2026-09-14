/**
 * instagram.ts — Instagram Graph API publishing on behalf of one verified account.
 *
 * Flow for posting a Reel:
 *   1. createReelContainer()  — upload video URL + caption → returns creation_id
 *   2. getContainerStatus()   — validera containern INNAN den används
 *   3. pollUntilReady()       — wait for Instagram to process the video
 *   4. publishContainer()     — make it live on the profile
 *
 * CREDENTIAL (project-scoped social credentials, 2026-09-14). Every call takes the
 * credential it acts with as its first argument — an InstagramCredential resolved by
 * lib/media/social-credentials.ts for the project whose content is being published,
 * already confirmed by Instagram to be that project's bound account. This module
 * reads no environment variable, keeps no account cache and has no default: it
 * cannot choose an account, only use the one it is handed.
 *
 * Docs: https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
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

/**
 * What a Graph call for one verified Instagram account needs. A verified
 * InstagramCredential from lib/media/social-credentials.ts satisfies it.
 */
export interface InstagramApiCredential {
  /** The account's Instagram professional account id — the one its binding holds. */
  accountId: string
  token: string
  /** graph.instagram.com for Instagram-login credentials, graph.facebook.com for Facebook-login. */
  apiBase: string
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
  credential:    InstagramApiCredential,
  videoUrl:      string,
  caption:       string,
  coverImageUrl?: string,
): Promise<string> {
  const params = new URLSearchParams({
    media_type:    'REELS',
    video_url:     videoUrl,
    caption,
    share_to_feed: 'true',
  })

  if (coverImageUrl) {
    params.set('thumb_offset', '0')
  }

  const data = await metaFetch<{ id?: string }>(
    `${credential.apiBase}/${credential.accountId}/media`, credential.token, 'media_create', { method: 'POST', body: params },
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

// ─── Step 2a: Validera en befintlig container ────────────────────────────────

/**
 * Läser containerns aktuella status hos Meta. Rent GET-anrop — publicerar,
 * ändrar eller raderar ingenting.
 *
 * Detta är kärnan i fixen för incidenten 2026-07-19: tidigare återanvändes ett
 * sparat creation_id utan att någon någonsin frågade Meta om containern
 * fortfarande gick att publicera. Frågan ställs med kontots egen credential, så en
 * container som skapats för ett annat konto svarar NOT_FOUND och återanvänds aldrig.
 *
 * Returnerar 'NOT_FOUND' om Meta inte känner till id:t (container städad bort),
 * och 'UNKNOWN' om svaret saknar status_code.
 */
export async function getContainerStatus(credential: InstagramApiCredential, creationId: string): Promise<ContainerStatus> {
  try {
    const data = await metaFetch<{ status_code?: MediaStatus; status?: string }>(
      `${credential.apiBase}/${creationId}?fields=status_code,status`, credential.token, 'container_status',
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
export async function resolvePublishedMedia(credential: InstagramApiCredential, creationId: string): Promise<PublishResult | null> {
  try {
    const data = await metaFetch<{ id?: string; permalink?: string }>(
      `${credential.apiBase}/${creationId}?fields=id,permalink`, credential.token, 'container_resolve',
    )
    if (!data.id) return null
    return { mediaId: String(data.id), permalink: data.permalink }
  } catch {
    return null
  }
}

// ─── Step 2b: Poll until video is processed ──────────────────────────────────

export async function pollUntilReady(
  credential: InstagramApiCredential,
  creationId: string,
  timeoutMs  = 300_000,  // 5 minutes default; pass lower value for short-lived crons
  intervalMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))

    const data = await metaFetch<{ status_code?: MediaStatus; status?: string }>(
      `${credential.apiBase}/${creationId}?fields=status_code,status`, credential.token, 'container_poll',
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

export async function publishContainer(credential: InstagramApiCredential, creationId: string): Promise<PublishResult> {
  const params = new URLSearchParams({ creation_id: creationId })

  const data = await metaFetch<{ id?: string }>(
    `${credential.apiBase}/${credential.accountId}/media_publish`, credential.token, 'media_publish', { method: 'POST', body: params },
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
      `${credential.apiBase}/${data.id}?fields=permalink`, credential.token, 'media_permalink',
    )
    permalink = mediaData.permalink
  } catch {
    permalink = undefined
  }

  return { mediaId: String(data.id), permalink }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function postReelToInstagram(
  credential:     InstagramApiCredential,
  videoUrl:       string,
  caption:        string,
  onProgress?:    (step: 'uploading' | 'processing' | 'publishing', pct: number) => void,
  pollTimeoutMs?: number,   // override poll timeout — use ~50000 for Vercel Hobby crons
): Promise<PublishResult> {
  onProgress?.('uploading', 10)
  const creationId = await createReelContainer(credential, videoUrl, caption)

  onProgress?.('processing', 30)
  await pollUntilReady(credential, creationId, pollTimeoutMs)

  onProgress?.('publishing', 90)
  const result = await publishContainer(credential, creationId)

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
