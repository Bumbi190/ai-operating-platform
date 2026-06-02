/**
 * token-store.ts — Supabase-backed token storage för sociala medieplattformar.
 *
 * Prioritetsordning för att hämta ett token:
 *   1. platform_tokens-tabellen i Supabase (uppdateras av refresh-cron)
 *   2. Env-variabel som fallback (bakåtkompatibilitet och första körning)
 *
 * Env-variabel-mappning:
 *   instagram → INSTAGRAM_ACCESS_TOKEN
 *   facebook  → FACEBOOK_PAGE_ACCESS_TOKEN
 *
 * Varning loggas om tokenet löper ut om < WARN_DAYS_BEFORE_EXPIRY dagar.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const WARN_DAYS_BEFORE_EXPIRY = 10

const ENV_VAR_MAP: Record<string, string> = {
  instagram: 'INSTAGRAM_ACCESS_TOKEN',
  facebook:  'FACEBOOK_PAGE_ACCESS_TOKEN',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'facebook'

export interface StoredToken {
  accessToken: string
  expiresAt:   Date | null
  source:      'supabase' | 'env'
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Hämtar access token för en plattform.
 * Returnerar null om varken Supabase eller env-variabel har ett värde.
 */
export async function getToken(platform: Platform): Promise<StoredToken | null> {
  const db = createAdminClient()

  const { data, error } = await db
    .from('platform_tokens')
    .select('access_token, expires_at')
    .eq('platform', platform)
    .maybeSingle()

  if (error) {
    console.warn(`[token-store] Supabase-fel vid läsning av ${platform}-token:`, error.message)
  }

  if (data?.access_token) {
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null

    if (expiresAt) {
      const daysLeft = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      if (daysLeft < WARN_DAYS_BEFORE_EXPIRY) {
        // OBS: Skicka ALDRIG mail härifrån. getToken() anropas på varje
        // pipeline-tick (publish, reply-comments var 2:e minut, m.m.) — att maila
        // här spammade inkorgen med 70+ mail på en natt. Vi loggar bara.
        // Den faktiska utgångsvarningen skickas en gång av refresh-tokens-cronen.
        console.warn(
          `[token-store] ⚠️  ${platform} token löper ut om ${Math.round(daysLeft)} dagar! ` +
          `refresh-tokens-cronen ska förnya det automatiskt.`
        )
      }
    }

    return { accessToken: data.access_token, expiresAt, source: 'supabase' }
  }

  // Fallback: env-variabel (fungerar på första körningen innan tabellen populeras)
  const envKey = ENV_VAR_MAP[platform]
  const envToken = envKey ? process.env[envKey] : undefined

  if (envToken) {
    console.log(`[token-store] ${platform}: Supabase tom — använder env-variabel som fallback.`)
    return { accessToken: envToken, expiresAt: null, source: 'env' }
  }

  return null
}

/**
 * Returnerar enbart access token-strängen (eller kastar om ingen finns).
 * Praktisk wrapper för cron-routes.
 */
export async function requireToken(platform: Platform): Promise<string> {
  const stored = await getToken(platform)
  if (!stored) {
    throw new Error(
      `[token-store] Inget ${platform}-token hittat. ` +
      `Sätt ${ENV_VAR_MAP[platform] ?? platform.toUpperCase() + '_TOKEN'} i Vercel, ` +
      `eller kör /api/media/cron/refresh-tokens en gång för att populera Supabase.`
    )
  }
  return stored.accessToken
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Sparar eller uppdaterar ett token i Supabase.
 * Anropas av refresh-cron efter lyckad token-förnyelse.
 */
export async function setToken(
  platform:    Platform,
  accessToken: string,
  expiresAt?:  Date,
): Promise<void> {
  const db = createAdminClient()

  const tokenType = platform === 'facebook' ? 'page' : 'user'

  const { error } = await db
    .from('platform_tokens')
    .upsert(
      {
        platform,
        token_type:   tokenType,
        access_token: accessToken,
        expires_at:   expiresAt?.toISOString() ?? null,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'platform,token_type' },
    )

  if (error) {
    throw new Error(`[token-store] Kunde inte spara ${platform}-token: ${error.message}`)
  }

  console.log(
    `[token-store] ✓ ${platform} token sparat.` +
    (expiresAt ? ` Löper ut: ${expiresAt.toISOString()}` : ' (inget utgångsdatum satt)')
  )
}
