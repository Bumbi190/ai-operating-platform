/**
 * token-store.ts — Supabase-backed token storage för sociala medieplattformar.
 *
 * G1 (multi-tenant): tokens är nu PROJEKT-medvetna. Samma pipeline kan därmed
 * posta för The Prompt, Familje-Stunden, GainPilot m.fl. UTAN specialfall —
 * anropa bara med ett projekt (uuid eller slug). Utelämnas projekt används
 * The Prompt (ai-media-automation) som bakåtkompatibel default, så alla
 * befintliga anrop fungerar oförändrat.
 *
 * Prioritetsordning för att hämta ett token:
 *   1. platform_tokens-raden för (projekt, plattform)
 *   2. Env-variabel som fallback — ENDAST för default-projektet (The Prompt),
 *      eftersom env-tokens hör till just det kontot.
 *
 * Env-variabel-mappning:
 *   instagram → INSTAGRAM_ACCESS_TOKEN
 *   facebook  → FACEBOOK_PAGE_ACCESS_TOKEN (+ FACEBOOK_PAGE_ID som account_id)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

const WARN_DAYS_BEFORE_EXPIRY = 10

const ENV_VAR_MAP: Record<string, string> = {
  instagram: 'INSTAGRAM_ACCESS_TOKEN',
  facebook:  'FACEBOOK_PAGE_ACCESS_TOKEN',
}

// The Prompt äger de tokens som env-variablerna/legacy-raderna pekar på.
const DEFAULT_SOCIAL_PROJECT_SLUG = 'ai-media-automation'
const UUID_RE = /^[0-9a-fA-F-]{36}$/

// ─── Types ────────────────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'facebook'

export interface StoredToken {
  accessToken: string
  accountId:   string | null   // IG business id / FB page id (per projekt)
  expiresAt:   Date | null
  source:      'supabase' | 'env'
}

export interface SetTokenOptions {
  /** Projekt (uuid eller slug). Default: The Prompt. */
  project?:   string
  /** Plattformens konto-id (IG business id / FB page id). Bevaras om utelämnat. */
  accountId?: string
}

// ─── Projektupplösning ──────────────────────────────────────────────────────

type AnyDb = ReturnType<typeof createAdminClient>

async function resolveProjectId(db: AnyDb, project?: string): Promise<string | null> {
  const ref = project ?? DEFAULT_SOCIAL_PROJECT_SLUG
  if (UUID_RE.test(ref)) return ref
  const { data } = await db.from('projects').select('id').eq('slug', ref).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

async function defaultProjectId(db: AnyDb): Promise<string | null> {
  const { data } = await db.from('projects').select('id').eq('slug', DEFAULT_SOCIAL_PROJECT_SLUG).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

function envAccountId(platform: Platform): string | null {
  if (platform === 'facebook') return process.env.FACEBOOK_PAGE_ID ?? null
  return null   // IG-konto härleds ur token via /me
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Hämtar access token (+ account_id) för en plattform och ett projekt.
 * @param project uuid eller slug. Utelämnas → The Prompt (default).
 */
export async function getToken(platform: Platform, project?: string): Promise<StoredToken | null> {
  const db = createAdminClient()
  const [projectId, defId] = await Promise.all([resolveProjectId(db, project), defaultProjectId(db)])
  const isDefault = !!projectId && projectId === defId

  if (projectId) {
    const { data, error } = await db
      .from('platform_tokens')
      .select('access_token, account_id, expires_at')
      .eq('platform', platform)
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) console.warn(`[token-store] Supabase-fel vid läsning av ${platform}-token:`, error.message)

    if (data?.access_token) {
      const expiresAt = data.expires_at ? new Date(data.expires_at) : null
      if (expiresAt) {
        const daysLeft = (expiresAt.getTime() - Date.now()) / 86_400_000
        if (daysLeft < WARN_DAYS_BEFORE_EXPIRY) {
          // Maila ALDRIG härifrån (getToken körs på varje pipeline-tick). Bara logg.
          console.warn(`[token-store] ⚠️  ${platform}-token (projekt ${projectId}) löper ut om ${Math.round(daysLeft)} dagar.`)
        }
      }
      return {
        accessToken: data.access_token,
        accountId:   data.account_id ?? envAccountId(platform),
        expiresAt,
        source: 'supabase',
      }
    }
  }

  // Env-fallback — ENDAST för default-projektet (env-tokens hör till The Prompt).
  if (isDefault || project === undefined) {
    const envKey = ENV_VAR_MAP[platform]
    const envToken = envKey ? process.env[envKey] : undefined
    if (envToken) {
      console.log(`[token-store] ${platform}: Supabase tom — env-fallback (The Prompt).`)
      return { accessToken: envToken, accountId: envAccountId(platform), expiresAt: null, source: 'env' }
    }
  }

  return null
}

/** Returnerar enbart access token-strängen (eller kastar). */
export async function requireToken(platform: Platform, project?: string): Promise<string> {
  const stored = await getToken(platform, project)
  if (!stored) {
    throw new Error(
      `[token-store] Inget ${platform}-token för projekt "${project ?? DEFAULT_SOCIAL_PROJECT_SLUG}". ` +
      `Lägg in det via /api/media/token eller refresh-tokens-cronen.`,
    )
  }
  return stored.accessToken
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Sparar/uppdaterar ett token för (projekt, plattform).
 * Bakåtkompatibel signatur: setToken(platform, token, expiresAt?) fungerar som
 * förr (→ The Prompt). Ange opts.project för andra verksamheter.
 */
export async function setToken(
  platform:    Platform,
  accessToken: string,
  expiresAt?:  Date,
  opts:        SetTokenOptions = {},
): Promise<void> {
  const db = createAdminClient()
  const projectId = await resolveProjectId(db, opts.project)
  if (!projectId) throw new Error(`[token-store] Okänt projekt "${opts.project}" — kan inte spara ${platform}-token.`)

  const tokenType = platform === 'facebook' ? 'page' : 'user'
  const row: Database['public']['Tables']['platform_tokens']['Insert'] = {
    project_id:   projectId,
    platform,
    token_type:   tokenType,
    access_token: accessToken,
    expires_at:   expiresAt?.toISOString() ?? null,
    refreshed_at: new Date().toISOString(),
  }
  if (opts.accountId !== undefined) row.account_id = opts.accountId   // bevara befintligt om utelämnat

  const { error } = await db
    .from('platform_tokens')
    .upsert(row, { onConflict: 'project_id,platform,token_type' })

  if (error) throw new Error(`[token-store] Kunde inte spara ${platform}-token: ${error.message}`)

  console.log(`[token-store] ✓ ${platform}-token sparat för projekt ${projectId}.` +
    (expiresAt ? ` Löper ut: ${expiresAt.toISOString()}` : ''))
}
