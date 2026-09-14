/**
 * lib/media/account-insights.ts — KONTO-nivå mått (distinkt från per-inlägg insights).
 *
 * Hämtar följarantal m.m. på kontonivå så Atlas kan bygga en tillväxt-tidsserie
 * (account_snapshots). Allt degraderar tyst: kan ett mått inte hämtas (t.ex. för
 * litet konto eller saknad scope) lämnas det null istället för att kasta — vi
 * hittar aldrig på siffror.
 *
 * CREDENTIALS (project-scoped social credentials, 2026-09-14): Instagram och Facebook
 * mäts med en VERIFIERAD credential för projektets bundna konto
 * (lib/media/social-credentials.ts), skickad som Authorization-header — aldrig i
 * URL:en. YouTube läses som publik data med plattformens API-nyckel, för en video som
 * projektet självt har laddat upp.
 *
 * IG: followers_count kräver bara instagram_business_basic. reach/profile_views
 *     kräver instagram_manage_insights (kan saknas → null).
 * FB: sid-noden ({pageId}) med sidans eget token → fan_count / followers_count.
 * YT: YouTube Data API v3 med API-nyckel (publik kanaldata, ingen OAuth behövs).
 */

const FB_HOST = 'https://graph.facebook.com/v21.0'
const YT_HOST = 'https://www.googleapis.com/youtube/v3'

export interface AccountSnapshot {
  followers: number | null
  following: number | null
  mediaCount: number | null
  reach: number | null
  profileViews: number | null
  raw: unknown
}

const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v))

async function getJson(url: string, token?: string): Promise<any> {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  })
  return res.json()
}

/** What an Instagram account read needs. A verified InstagramCredential satisfies it. */
export interface InstagramSnapshotCredential {
  accountId: string
  token: string
  apiBase: string
  isIgLogin: boolean
}

/** Instagram. followers_count är robust; insights degraderar till null. */
export async function igAccountSnapshot(credential: InstagramSnapshotCredential): Promise<AccountSnapshot> {
  const snap: AccountSnapshot = { followers: null, following: null, mediaCount: null, reach: null, profileViews: null, raw: null }

  // Instagram-login credentials read /me (which also answers user_id); Facebook-login
  // credentials read the verified account's own node.
  const node = credential.isIgLogin ? 'me' : credential.accountId
  const fields = credential.isIgLogin
    ? 'user_id,username,followers_count,follows_count,media_count'
    : 'id,username,followers_count,follows_count,media_count'

  // 1) Basfält (instagram_business_basic)
  try {
    const j = await getJson(`${credential.apiBase}/${node}?fields=${fields}`, credential.token)
    snap.raw = j
    if (!j?.error) {
      snap.followers  = num(j.followers_count)
      snap.following  = num(j.follows_count)
      snap.mediaCount = num(j.media_count)
    }
  } catch { /* degradera */ }

  // 2) Konto-insights (kräver instagram_manage_insights — kan saknas)
  try {
    const j = await getJson(`${credential.apiBase}/${node}/insights?metric=reach,profile_views&period=day`, credential.token)
    if (!j?.error && Array.isArray(j.data)) {
      for (const m of j.data) {
        const v = num(m?.values?.[0]?.value)
        if (m?.name === 'reach') snap.reach = v
        if (m?.name === 'profile_views') snap.profileViews = v
      }
    }
  } catch { /* degradera */ }

  return snap
}

/** What a Facebook page read needs. A verified FacebookCredential satisfies it. */
export interface FacebookSnapshotCredential {
  pageId: string
  pageToken: string
}

/** Facebook Page — the verified page's own node, read with the page's own token. */
export async function fbAccountSnapshot(credential: FacebookSnapshotCredential): Promise<AccountSnapshot> {
  const snap: AccountSnapshot = { followers: null, following: null, mediaCount: null, reach: null, profileViews: null, raw: null }
  try {
    const j = await getJson(`${FB_HOST}/${credential.pageId}?fields=followers_count,fan_count`, credential.pageToken)
    snap.raw = j
    if (!j?.error) {
      // followers_count = sidföljare (modernt); fan_count = sidgillningar (äldre, fallback).
      snap.followers = num(j.followers_count ?? j.fan_count)
    }
  } catch { /* degradera */ }
  return snap
}

/**
 * YouTube-kanalsnapshot via Data API v3 (API-nyckel, publik data).
 * Härleder channelId från ett känt videoId (sample), hämtar sedan kanalstatistik.
 * subscriberCount → followers, videoCount → mediaCount, viewCount → reach (kumulativ).
 */
export async function ytAccountSnapshot(apiKey: string, sampleVideoId: string | null): Promise<AccountSnapshot> {
  const snap: AccountSnapshot = { followers: null, following: null, mediaCount: null, reach: null, profileViews: null, raw: null }
  if (!apiKey || !sampleVideoId) {
    snap.raw = { error: 'missing_input', note: !apiKey ? 'YOUTUBE_API_KEY saknas' : 'inget youtube_video_id att härleda kanal från' }
    return snap
  }
  try {
    const v = await getJson(`${YT_HOST}/videos?part=snippet&id=${sampleVideoId}&key=${apiKey}`)
    const channelId = v?.items?.[0]?.snippet?.channelId as string | undefined
    if (!channelId) { snap.raw = v; return snap }
    const c = await getJson(`${YT_HOST}/channels?part=statistics&id=${channelId}&key=${apiKey}`)
    snap.raw = c
    const stats = c?.items?.[0]?.statistics
    if (stats) {
      snap.followers  = num(stats.subscriberCount)   // kan vara dold → null
      snap.mediaCount = num(stats.videoCount)
      snap.reach      = num(stats.viewCount)          // kumulativa visningar för kanalen
    }
  } catch { /* degradera */ }
  return snap
}
