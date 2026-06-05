/**
 * lib/media/account-insights.ts — KONTO-nivå mått (distinkt från per-inlägg insights).
 *
 * Hämtar följarantal m.m. på kontonivå så Atlas kan bygga en tillväxt-tidsserie
 * (account_snapshots). Allt degraderar tyst: kan ett mått inte hämtas (t.ex. för
 * litet konto eller saknad scope) lämnas det null istället för att kasta — vi
 * hittar aldrig på siffror.
 *
 * IG: Instagram API with Instagram Login (graph.instagram.com, IGAA-token).
 *     followers_count kräver bara instagram_business_basic. reach/profile_views
 *     kräver instagram_manage_insights (kan saknas → null).
 * FB: Page-token → fan_count / followers_count. OBS: FACEBOOK_PAGE_ACCESS_TOKEN
 *     är ofta ett USER-token; vi växlar det till page-token via /me/accounts och
 *     frågar page-noden direkt ({pageId}) — annars pekar /me på användarnoden som
 *     saknar fan_count (= felet "(#100) nonexisting field fan_count").
 * YT: YouTube Data API v3 med API-nyckel (publik kanaldata, ingen OAuth behövs).
 */

const IG_HOST = 'https://graph.instagram.com/v22.0'
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

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  return res.json()
}

/** Instagram (IGAA). followers_count är robust; insights degraderar till null. */
export async function igAccountSnapshot(token: string): Promise<AccountSnapshot> {
  const snap: AccountSnapshot = { followers: null, following: null, mediaCount: null, reach: null, profileViews: null, raw: null }

  // 1) Basfält (instagram_business_basic)
  try {
    const j = await getJson(`${IG_HOST}/me?fields=user_id,username,followers_count,follows_count,media_count&access_token=${token}`)
    snap.raw = j
    if (!j?.error) {
      snap.followers  = num(j.followers_count)
      snap.following  = num(j.follows_count)
      snap.mediaCount = num(j.media_count)
    }
  } catch { /* degradera */ }

  // 2) Konto-insights (kräver instagram_manage_insights — kan saknas)
  try {
    const j = await getJson(`${IG_HOST}/me/insights?metric=reach,profile_views&period=day&access_token=${token}`)
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

/**
 * Växlar ett user-token mot page-token via /me/accounts. Är tokenet redan ett
 * page-token (eller pageId saknas i listan) returneras inkommande token oförändrat.
 * Samma logik som publiceringen i facebook.ts använder.
 */
async function resolveFbPageToken(userOrPageToken: string, pageId: string): Promise<string> {
  try {
    const j = await getJson(`${FB_HOST}/me/accounts?fields=id,access_token&limit=200&access_token=${userOrPageToken}`)
    const page = (j?.data as Array<{ id: string; access_token: string }> | undefined)?.find(p => p.id === pageId)
    return page?.access_token ?? userOrPageToken
  } catch {
    return userOrPageToken
  }
}

/**
 * Facebook Page. Kräver page-id för att fråga page-noden direkt.
 * Utan page-id kan vi inte säkert nå fan_count (/me kan peka på användaren) → degraderar.
 */
export async function fbAccountSnapshot(token: string, pageId: string | null): Promise<AccountSnapshot> {
  const snap: AccountSnapshot = { followers: null, following: null, mediaCount: null, reach: null, profileViews: null, raw: null }
  if (!pageId) { snap.raw = { error: 'no_page_id', note: 'FACEBOOK_PAGE_ID saknas — kan inte fråga page-noden.' }; return snap }
  try {
    const pageToken = await resolveFbPageToken(token, pageId)
    const j = await getJson(`${FB_HOST}/${pageId}?fields=followers_count,fan_count&access_token=${pageToken}`)
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
