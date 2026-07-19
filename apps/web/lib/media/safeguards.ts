/**
 * lib/media/safeguards.ts
 *
 * Operationella säkerhetsskydd för media-pipelinen.
 * Varje cron-route anropar dessa kontroller vid start.
 *
 * Skydd:
 *  1. Global paus (automation_paused i platform_config)
 *  2. MAX_DAILY_RENDERS — stoppar nya render-jobb om gränsen nåtts
 *  3. Retry-cap — stoppar publish-loopar och skickar till operatörsgranskning
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ─── Typer ────────────────────────────────────────────────────────────────────

export interface PlatformConfig {
  automation_paused:  boolean
  max_daily_renders:  number
  max_retry_attempts: number
  paused_at:          string | null
  paused_reason:      string | null
}

export interface SafeguardResult {
  allowed:  boolean
  reason?:  string
  config?:  PlatformConfig
}

// ─── Hämta plattformskonfiguration ───────────────────────────────────────────

export async function getPlatformConfig(db: SupabaseClient): Promise<PlatformConfig> {
  const { data } = await db
    .from('platform_config')
    .select('automation_paused, max_daily_renders, max_retry_attempts, paused_at, paused_reason')
    .eq('id', 1)
    .single()

  // Säkra fallback-värden om raden saknas (t.ex. migration ej körts ännu)
  return {
    automation_paused:  data?.automation_paused  ?? false,
    max_daily_renders:  data?.max_daily_renders  ?? 4,
    max_retry_attempts: data?.max_retry_attempts ?? 3,
    paused_at:          data?.paused_at          ?? null,
    paused_reason:      data?.paused_reason      ?? null,
  }
}

// ─── 1. Global pauscheck ──────────────────────────────────────────────────────

export async function checkAutomationPaused(db: SupabaseClient): Promise<SafeguardResult> {
  const config = await getPlatformConfig(db)

  if (config.automation_paused) {
    return {
      allowed: false,
      reason:  config.paused_reason
        ? `Automation pausad: ${config.paused_reason}`
        : 'Automation är pausad av operatör',
      config,
    }
  }

  return { allowed: true, config }
}

// ─── 2. Daglig render-gräns ───────────────────────────────────────────────────

export async function checkDailyRenderLimit(db: SupabaseClient): Promise<SafeguardResult> {
  const config = await getPlatformConfig(db)

  // Räkna renders startade idag (UTC)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { count } = await db
    .from('media_scripts')
    .select('id', { count: 'exact', head: true })
    .neq('video_status', 'none')        // har triggat en render
    .gte('created_at', todayStart.toISOString())

  const todayCount = count ?? 0

  if (todayCount >= config.max_daily_renders) {
    return {
      allowed: false,
      reason:  `Daglig render-gräns nådd: ${todayCount}/${config.max_daily_renders} renders idag`,
      config,
    }
  }

  return { allowed: true, config }
}

// ─── 3. Retry-cap check ───────────────────────────────────────────────────────

export async function checkRetryCapReached(
  db: SupabaseClient,
  scriptId: string,
): Promise<SafeguardResult> {
  const config = await getPlatformConfig(db)

  const { data } = await db
    .from('media_scripts')
    .select('retry_count')
    .eq('id', scriptId)
    .single()

  const retryCount = data?.retry_count ?? 0

  if (retryCount >= config.max_retry_attempts) {
    return {
      allowed: false,
      reason:  `Retry-gräns nådd (${retryCount}/${config.max_retry_attempts}) — skickat till operatörsgranskning`,
      config,
    }
  }

  return { allowed: true, config }
}

// ─── Hjälpare: incrementera retry + markera pending_review om cap nådd ────────

export async function handlePublishFailure(
  db: SupabaseClient,
  scriptId: string,
  errorMsg: string,
  opts: { permanent?: boolean } = {},
): Promise<{ sentToReview: boolean; newRetryCount: number }> {
  const config = await getPlatformConfig(db)

  // Hämta nuvarande retry_count
  const { data } = await db
    .from('media_scripts')
    .select('retry_count')
    .eq('id', scriptId)
    .single()

  const newCount = (data?.retry_count ?? 0) + 1

  // Permanenta fel (t.ex. ogiltig token, korrupt video, obrukbar container) kan
  // aldrig läka av sig själva. Att låta dem konsumera hela retry-budgeten
  // blockerade färskare godkänt innehåll i FIFO-kön i upp till 1,5 dygn
  // (incident 2026-07-19). De går därför direkt till operatörsgranskning.
  if (opts.permanent || newCount >= config.max_retry_attempts) {
    // Cap nådd — skicka till operatörsgranskning
    await db.from('media_scripts').update({
      retry_count:           newCount,
      publish_failed_reason: errorMsg,
      status:                'pending_review',
    }).eq('id', scriptId)

    // Skapa en approval-post så operatören ser det i granskningscentret
    await db.from('approvals').insert({
      output_key:    `publish_failed_${scriptId}`,
      content:       JSON.stringify({
        type:         'publish_failure',
        scriptId,
        retryCount:   newCount,
        permanent:    opts.permanent === true,
        error:        errorMsg,
        message:      opts.permanent
          ? `Publish misslyckades med ett permanent fel. Manuell åtgärd krävs.`
          : `Publish misslyckades ${newCount} gånger. Manuell åtgärd krävs.`,
      }),
      status:        'pending',
      reviewer_notes: null,
    })

    return { sentToReview: true, newRetryCount: newCount }
  } else {
    // Öka bara räknaren
    await db.from('media_scripts').update({
      retry_count:           newCount,
      publish_failed_reason: errorMsg,
    }).eq('id', scriptId)

    return { sentToReview: false, newRetryCount: newCount }
  }
}

// ─── Pausa/återuppta automation (används av dashboard-toggle) ─────────────────

export async function setAutomationPaused(
  db: SupabaseClient,
  paused: boolean,
  reason?: string,
): Promise<void> {
  await db.from('platform_config').update({
    automation_paused: paused,
    paused_at:         paused ? new Date().toISOString() : null,
    paused_reason:     paused ? (reason ?? null) : null,
    updated_at:        new Date().toISOString(),
  }).eq('id', 1)
}
