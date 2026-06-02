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
 * FB: Page-token → fan_count / followers_count.
 */

const IG_HOST = 'https://graph.instagram.com/v22.0'
const FB_HOST = 'https://graph.facebook.com/v21.0'

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

/** Facebook Page. fan_count/followers_count via page-token. */
export async function fbAccountSnapshot(token: string): Promise<AccountSnapshot> {
  const snap: AccountSnapshot = { followers: null, following: null, mediaCount: null, reach: null, profileViews: null, raw: null }
  try {
    const j = await getJson(`${FB_HOST}/me?fields=fan_count,followers_count&access_token=${token}`)
    snap.raw = j
    if (!j?.error) {
      snap.followers = num(j.followers_count ?? j.fan_count)
    }
  } catch { /* degradera */ }
  return snap
}
