/**
 * GET /api/media/cron/token-health
 *
 * Proaktiv token-monitorering för Instagram, Facebook och YouTube.
 * Körs dagligen 06:15 UTC (cron: omnira_token_health). Skriver status till
 * token_health-tabellen (läses av Operations Center + Action Center + Atlas) och
 * larmar via mail INNAN ett token går ut. Read-mostly mot externa API:er.
 *
 * Utgångsmodeller skiljer sig:
 *   - Instagram: long-lived, expires_at i platform_tokens → exakt dagräkning.
 *   - Facebook:  debug_token (kräver META_APP_ID|META_APP_SECRET) → exakt utgång.
 *   - YouTube:   refresh-token (långlivat) → verifiera giltig/ogiltig, ej dagar.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getToken } from '@/lib/media/token-store'
import { verifyYouTubeToken } from '@/lib/media/youtube'
import { sendTokenExpiryWarning } from '@/lib/media/alert'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

const DAY = 86_400_000
const THRESHOLDS = [0, 3, 7, 14]   // strängast först

function statusFor(daysLeft: number | null, valid: boolean): string {
  if (!valid) return 'expired'
  if (daysLeft === null) return 'ok'        // giltigt men ingen dagräkning (youtube / fb-never)
  if (daysLeft <= 0)  return 'expired'
  if (daysLeft <= 14) return 'warning'
  return 'ok'
}

// Minsta tröskel som daysLeft fallit under (eller null om >14).
function thresholdFor(daysLeft: number | null): number | null {
  if (daysLeft === null) return null
  for (const t of THRESHOLDS) if (daysLeft <= t) return t
  return null
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: existingRows } = await db.from('token_health').select('platform, last_warned_threshold')
  const warnedBy = new Map<string, number | null>((existingRows ?? []).map((r: any) => [r.platform, r.last_warned_threshold ?? null]))

  const results: Record<string, unknown> = {}

  // Skriv status + larma (deduperat) för en plattform.
  async function record(platform: string, opts: {
    valid: boolean; expiresAt: Date | null; daysLeft: number | null; error?: string | null; refreshedAt?: string | null
  }) {
    const status = statusFor(opts.daysLeft, opts.valid)
    const t = thresholdFor(opts.daysLeft)
    const prevWarned = warnedBy.get(platform) ?? null

    // Larma: ny/strängare tröskel, eller dagligen vid ≤3 dagar, eller expired/error.
    let nextWarned = prevWarned
    const tighter = t !== null && (prevWarned === null || t < prevWarned)
    const daily   = t !== null && t <= 3
    if (!opts.valid) {
      try { await sendTokenExpiryWarning(platform, opts.daysLeft ?? 0, opts.expiresAt?.toISOString() ?? 'ogiltigt/utgånget') } catch { /* non-blocking */ }
      nextWarned = 0
    } else if (t !== null && (tighter || daily)) {
      try { await sendTokenExpiryWarning(platform, opts.daysLeft ?? t, opts.expiresAt?.toISOString() ?? 'okänt') } catch { /* non-blocking */ }
      nextWarned = t
    } else if (t === null) {
      nextWarned = null   // återställ när token är friskt igen (>14 d)
    }

    await db.from('token_health').update({
      expires_at:            opts.expiresAt?.toISOString() ?? null,
      days_left:             opts.daysLeft,
      status,
      last_verified_at:      nowIso,
      ...(opts.refreshedAt ? { last_refreshed_at: opts.refreshedAt } : {}),
      last_error:            opts.error ?? null,
      last_warned_threshold: nextWarned,
      updated_at:            nowIso,
    }).eq('platform', platform)

    results[platform] = { status, daysLeft: opts.daysLeft, expiresAt: opts.expiresAt?.toISOString() ?? null }
  }

  // ── Instagram ───────────────────────────────────────────────────────────────
  try {
    const ig = await getToken('instagram')
    if (!ig) {
      await record('instagram', { valid: false, expiresAt: null, daysLeft: null, error: 'Inget Instagram-token hittat' })
    } else {
      const expiresAt = ig.expiresAt ?? null
      const daysLeft  = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / DAY) : null
      await record('instagram', { valid: daysLeft === null ? true : daysLeft > 0, expiresAt, daysLeft })
    }
  } catch (e) {
    await record('instagram', { valid: false, expiresAt: null, daysLeft: null, error: e instanceof Error ? e.message : 'fel' })
  }

  // ── Facebook (debug_token) ──────────────────────────────────────────────────
  try {
    const fb = await getToken('facebook')
    const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET
    if (!fb) {
      await record('facebook', { valid: false, expiresAt: null, daysLeft: null, error: 'Inget Facebook-token' })
    } else if (!appId || !appSecret) {
      // Ingen app-token → kan inte hämta exakt utgång; gör liveness-koll.
      const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${fb.accessToken}`)
      await record('facebook', { valid: res.ok, expiresAt: null, daysLeft: null, error: res.ok ? null : `liveness ${res.status}` })
    } else {
      const appToken = `${appId}|${appSecret}`
      const res  = await fetch(`https://graph.facebook.com/debug_token?input_token=${fb.accessToken}&access_token=${appToken}`)
      const data = await res.json() as { data?: { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; error?: { message: string } } }
      const d = data.data
      const isValid = !!d?.is_valid
      const expUnix = d?.expires_at ?? 0   // 0 = aldrig
      const expiresAt = expUnix > 0 ? new Date(expUnix * 1000) : null
      const daysLeft  = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / DAY) : null
      await record('facebook', { valid: isValid, expiresAt, daysLeft, error: isValid ? null : (d?.error?.message ?? 'ogiltigt token') })
    }
  } catch (e) {
    await record('facebook', { valid: false, expiresAt: null, daysLeft: null, error: e instanceof Error ? e.message : 'fel' })
  }

  // ── YouTube (refresh-token verifiering) ─────────────────────────────────────
  try {
    const yt = await verifyYouTubeToken()
    await record('youtube', { valid: yt.ok, expiresAt: null, daysLeft: null, error: yt.ok ? null : (yt.error ?? 'fel') })
  } catch (e) {
    await record('youtube', { valid: false, expiresAt: null, daysLeft: null, error: e instanceof Error ? e.message : 'fel' })
  }

  return NextResponse.json({ ranAt: nowIso, results })
}
