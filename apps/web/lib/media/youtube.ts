/**
 * youtube.ts — Laddar upp en renderad video som YouTube Short via YouTube Data API v3.
 *
 * Auth: OAuth2 refresh token (kanalägaren auktoriserar en gång → vi byter refresh
 * token mot access token vid varje uppladdning). YouTube tillåter inte service
 * accounts för uppladdning — det måste vara en riktig kanalägare.
 *
 * Krävda env vars (sätts i Vercel):
 *   YOUTUBE_CLIENT_ID      — OAuth client ID (Google Cloud)
 *   YOUTUBE_CLIENT_SECRET  — OAuth client secret
 *   YOUTUBE_REFRESH_TOKEN  — refresh token för The Prompt-kanalen (scope youtube.upload)
 */

const TOKEN_URL  = 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'

export function isYouTubeConfigured(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  )
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID ?? '',
      client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN ?? '',
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; error_description?: string; error?: string }
  if (!data.access_token) {
    throw new Error(`YouTube token-refresh misslyckades: ${data.error_description ?? data.error ?? res.status}`)
  }
  return data.access_token
}

/**
 * Verifierar att YouTube-tokenet (refresh-token → access-token) fungerar.
 * Refresh-token är långlivat → vi rapporterar giltig/ogiltig, inte "dagar kvar".
 */
export async function verifyYouTubeToken(): Promise<{ ok: boolean; error?: string }> {
  if (!isYouTubeConfigured()) return { ok: false, error: 'YouTube ej konfigurerat (saknar env-vars)' }
  try {
    await getAccessToken()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'okänt fel' }
  }
}

export interface YouTubeUploadOptions {
  videoUrl:    string       // publik MP4-URL (Supabase Storage)
  title:       string       // max ~100 tecken
  description: string
  tags?:       string[]
}

/**
 * Laddar upp videon som en Short. Returnerar videoId + publik URL.
 * Lägger till #Shorts i titeln om det saknas (hjälper YouTube klassa den som Short).
 */
export async function uploadShort(opts: YouTubeUploadOptions): Promise<{ videoId: string; url: string }> {
  const token = await getAccessToken()

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
  const upData = await upRes.json() as { id?: string; error?: { message: string } }
  if (!upRes.ok || !upData.id) {
    throw new Error(upData.error?.message ?? `YouTube-uppladdning misslyckades (${upRes.status})`)
  }

  return { videoId: upData.id, url: `https://www.youtube.com/shorts/${upData.id}` }
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
