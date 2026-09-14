/**
 * youtube.ts — Laddar upp en renderad video som YouTube Short via YouTube Data API v3.
 *
 * Auth: OAuth2 refresh token (kanalägaren auktoriserar en gång → vi byter refresh
 * token mot access token vid varje uppladdning). YouTube tillåter inte service
 * accounts för uppladdning — det måste vara en riktig kanalägare.
 *
 * CREDENTIAL (project-scoped social credentials, 2026-09-14). Uploads and analytics
 * reads take a YouTubeCredential resolved by lib/media/social-credentials.ts for
 * the project whose video it is. That resolver is the only caller of
 * platformYouTubeGrant() below.
 */

import type { YouTubeGrant } from './social-identity'
import { EXTERNAL_ACCOUNT_ID } from './social-identity'

const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'

/**
 * Y1 — TRANSITIONAL. The platform's YouTube OAuth credential, kept in Vercel.
 *
 * Owner decision 2026-09-14: until project-scoped YouTube credentials exist, this
 * credential belongs to The Prompt and serves exactly one binding
 * (social_account_bindings.credential_source = 'platform_env_transitional', unique
 * per platform in the database). Only lib/media/social-credentials.ts may call this,
 * and only for that binding; every other project's YouTube fails closed. This is NOT
 * the end state: project-scoped YouTube credentials with a channel verified before
 * every upload are (ATLAS_ROADMAP_SV.md).
 */
export function platformYouTubeGrant(): YouTubeGrant | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null
  return { clientId, clientSecret, refreshToken }
}

/** What an upload or an analytics read needs. A resolved YouTubeCredential satisfies it. */
export interface YouTubeApiCredential {
  accessToken: string
}

export interface YouTubeUploadOptions {
  videoUrl:    string       // publik MP4-URL (Supabase Storage)
  title:       string       // max ~100 tecken
  description: string
  tags?:       string[]
}

export interface YouTubeUploadResult {
  videoId: string
  url: string
  /** The channel YouTube says the video landed on, or null when it did not say. */
  channelId: string | null
}

/**
 * Laddar upp videon som en Short. Returnerar videoId, publik URL och kanalen
 * YouTube rapporterar för uppladdningen.
 * Lägger till #Shorts i titeln om det saknas (hjälper YouTube klassa den som Short).
 */
export async function uploadShort(credential: YouTubeApiCredential, opts: YouTubeUploadOptions): Promise<YouTubeUploadResult> {
  const token = credential.accessToken

  // Hämta videons bytes
  const vidRes = await fetch(opts.videoUrl)
  if (!vidRes.ok) throw new Error(`Kunde inte hämta video (${vidRes.status}) från ${opts.videoUrl}`)
  const buffer = Buffer.from(await vidRes.arrayBuffer())

  let title = opts.title.slice(0, 100)
  if (!/#shorts/i.test(title)) {
    title = `${title.slice(0, 90)} #Shorts`
  }

  const metadata = {
    snippet: {
      title,
      description: opts.description,
      tags:        opts.tags ?? [],
      categoryId:  '28',            // Science & Technology
    },
    status: {
      privacyStatus:           'public',
      selfDeclaredMadeForKids:  false,
    },
  }

  // 1. Initiera resumable upload → få upload-URL i Location-headern
  const initRes = await fetch(UPLOAD_URL, {
    method:  'POST',
    headers: {
      Authorization:            `Bearer ${token}`,
      'Content-Type':           'application/json; charset=UTF-8',
      'X-Upload-Content-Type':   'video/mp4',
      'X-Upload-Content-Length': String(buffer.length),
    },
    body: JSON.stringify(metadata),
  })

  if (!initRes.ok) {
    throw new Error(`YouTube init misslyckades (${initRes.status}): ${await initRes.text()}`)
  }
  const uploadUrl = initRes.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube gav ingen upload-URL (Location-header saknas)')

  // 2. Ladda upp videons bytes
  const upRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buffer.length) },
    body:    buffer,
  })
  const upData = await upRes.json() as { id?: string; snippet?: { channelId?: unknown }; error?: { message: string } }
  if (!upRes.ok || !upData.id) {
    throw new Error(upData.error?.message ?? `YouTube-uppladdning misslyckades (${upRes.status})`)
  }

  const channelId = typeof upData.snippet?.channelId === 'string' && EXTERNAL_ACCOUNT_ID.test(upData.snippet.channelId)
    ? upData.snippet.channelId
    : null

  return { videoId: upData.id, url: `https://www.youtube.com/shorts/${upData.id}`, channelId }
}

/**
 * Hämtar genomtittnings-% (averageViewPercentage, 0–100) för en video via
 * YouTube Analytics API. Kräver att credentialn har scope
 * `yt-analytics.readonly` (utöver youtube.upload) — saknas det svarar API:t 403
 * och vi degraderar tyst till null (aldrig påhittade siffror).
 *
 * `channel==MINE` betyder credentialns egen kanal: en video på en annan kanal ger
 * inga rader, aldrig någon annans siffror.
 */
export async function fetchVideoRetention(credential: YouTubeApiCredential, videoId: string): Promise<number | null> {
  try {
    // Analytics kräver ett datumintervall. Vi tar ett brett fönster (publicering täcks).
    const end   = new Date().toISOString().slice(0, 10)
    const start = '2020-01-01'
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
    url.searchParams.set('ids', 'channel==MINE')
    url.searchParams.set('startDate', start)
    url.searchParams.set('endDate', end)
    url.searchParams.set('metrics', 'averageViewPercentage')
    url.searchParams.set('filters', `video==${videoId}`)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${credential.accessToken}` },
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
    const data = await res.json() as { rows?: number[][]; error?: { message?: string } }
    if (!res.ok || data.error) return null            // 403 = saknad scope / API ej aktiverat → degradera
    const val = data.rows?.[0]?.[0]
    return typeof val === 'number' ? Math.round(val * 10) / 10 : null
  } catch {
    return null
  }
}

/**
 * Bygger en YouTube-titel + beskrivning från ett scripts fält.
 */
export function buildYouTubeMeta(opts: {
  hook:        string
  cta?:        string | null
  hashtags?:   string[]
  sourceName?: string | null
  sourceUrl?:  string | null
}): { title: string; description: string; tags: string[] } {
  const title = opts.hook

  const tags = (opts.hashtags ?? [])
    .map(h => h.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 15)
  // Bas-taggar för upptäckbarhet
  for (const t of ['AI', 'AI news', 'tech', 'artificial intelligence']) {
    if (!tags.some(x => x.toLowerCase() === t.toLowerCase())) tags.push(t)
  }

  const hashtagLine = (opts.hashtags ?? []).slice(0, 8).join(' ')
  const sourceLine  = opts.sourceName
    ? `Källa: ${opts.sourceName}${opts.sourceUrl ? ` — ${opts.sourceUrl}` : ''}`
    : ''

  const description = [
    opts.hook,
    opts.cta ?? '',
    '',
    sourceLine,
    '',
    'The Prompt — AI news, daily, no fluff.',
    '',
    hashtagLine,
    '#Shorts #AI #TechNews',
  ].filter(s => s !== null && s !== undefined).join('\n').trim()

  return { title, description, tags }
}
