import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import {
  ACCOUNT_SIGN_IN_METHOD,
  CHANNEL_LABELS,
  type ChannelId,
  type CredentialSource,
  type ReplaceableChannelId,
  type ReplacementCapability,
  type TokenHealthStatus,
} from './settings-shared'

/**
 * Inställningar — the read model behind vNext `/settings`.
 *
 * AN OPERATOR SURFACE, NOT AN AUTHORITY SOURCE. Settings shows the account, each
 * publishing channel's credential status and which platform configuration is
 * present. The one write it offers is the existing `POST /api/media/token`, and
 * whether it is offered is `capability`: this session evaluated through the same
 * two checks the route makes — the canonical platform-operator predicate, then
 * ownership of the default social project. The route re-checks both every time.
 *
 * CREDENTIAL-BLIND. Every read selects metadata only:
 *   platform_tokens            platform, token_type, expires_at, refreshed_at —
 *                              never access_token. The column is NOT NULL, so a
 *                              row existing is itself the proof a credential is
 *                              stored.
 *   token_health               platform, status, days_left, expires_at,
 *                              last_verified_at, last_refreshed_at — never
 *                              last_error, which can quote a provider's answer.
 *   platform_credential_events platform, outcome, occurred_at.
 * Environment variables are read as presence booleans. No value leaves this file.
 *
 * SCOPE. `resolveProjectAccess()` resolves the session's projects first. The two
 * project-dimensioned reads run only when the default social project is among
 * them, and are filtered to that project; otherwise they are not made at all.
 * `token_health` is platform-level and read as every attention surface reads it.
 *
 * UNREADABLE IS NOT MISSING, AND ABSENT IS NOT HEALTHY. A failed read renders as
 * unreadable; a platform with no token-check row renders as unchecked.
 */

// ── Contract ─────────────────────────────────────────────────────────────────

/** `DEFAULT_SOCIAL_PROJECT_SLUG` in lib/media/token-store.ts — the project the route writes to. */
export const SOCIAL_PROJECT_SLUG = 'ai-media-automation'

/** `ENV_VAR_MAP` in lib/media/token-store.ts — the fallback getToken() reads. */
export const ENV_FALLBACK: Record<ReplaceableChannelId, string> = {
  instagram: 'INSTAGRAM_ACCESS_TOKEN',
  facebook: 'FACEBOOK_PAGE_ACCESS_TOKEN',
}

/** The OAuth variables lib/media/youtube.ts publishes with. */
export const YOUTUBE_OAUTH_VARS = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'] as const

/**
 * The platform configuration reported, by provider. Each entry names providers
 * deployed code actually reads, and each purpose is what that code uses it for.
 */
export const PLATFORM_CONFIG: readonly { id: string; label: string; purpose: string; vars: readonly string[] }[] = [
  { id: 'supabase', label: 'Supabase', purpose: 'Databas, inloggning och serverns tjänsteroll', vars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { id: 'anthropic', label: 'Anthropic', purpose: 'Atlas-chatten och Claude-agenterna', vars: ['ANTHROPIC_API_KEY'] },
  { id: 'openai', label: 'OpenAI', purpose: 'Chattsvar, bildgenerering (gpt-image-1) och uppläsning', vars: ['OPENAI_API_KEY'] },
  { id: 'ideogram', label: 'Ideogram', purpose: 'Bildgenerering', vars: ['IDEOGRAM_API_KEY'] },
  { id: 'elevenlabs', label: 'ElevenLabs', purpose: 'Röst och musik i mediapipelinen', vars: ['ELEVENLABS_API_KEY'] },
  { id: 'meta', label: 'Meta-app', purpose: 'Tokenväxling, token-kontroll och Instagram-webhooks', vars: ['META_APP_ID', 'META_APP_SECRET'] },
  { id: 'youtube', label: 'YouTube', purpose: 'Publicering (OAuth) och statistik (API-nyckel)', vars: [...YOUTUBE_OAUTH_VARS, 'YOUTUBE_API_KEY'] },
  { id: 'brevo', label: 'Brevo', purpose: 'E-postutskick', vars: ['BREVO_API_KEY'] },
  { id: 'stripe', label: 'Stripe', purpose: 'Intäktsmått (begränsad nyckel)', vars: ['STRIPE_RESTRICTED_KEY'] },
  { id: 'pixabay', label: 'Pixabay', purpose: 'Musik till videor', vars: ['PIXABAY_API_KEY'] },
  { id: 'cron', label: 'Schemaläggning', purpose: 'Autentiserar de schemalagda jobben', vars: ['CRON_SECRET'] },
]

export interface SettingsChannel {
  id: ChannelId
  label: string
  /** Instagram and Facebook are replaced through the route; YouTube is not replaceable here. */
  replaceable: boolean
  source: CredentialSource
  /** platform_tokens metadata, when a credential is stored. */
  stored: { tokenType: string | null; expiresAt: string | null; refreshedAt: string | null } | null
  health: {
    readable: boolean
    status: TokenHealthStatus
    daysLeft: number | null
    expiresAt: string | null
    lastVerifiedAt: string | null
    lastRefreshedAt: string | null
  }
  /** The latest `replaced` event. `not_read` when the project is not this session's to read. */
  lastReplacement: { state: 'ok' | 'error' | 'not_read' | 'not_applicable'; at: string | null }
}

export interface SettingsConfigItem {
  id: string
  label: string
  purpose: string
  vars: string[]
  /** How many of `vars` hold a non-empty value. Presence only. */
  set: number
}

export interface SettingsWarning {
  id: string
  tone: 'attention' | 'unreadable'
  title: string
  detail: string | null
}

export interface SettingsModel {
  generatedAt: string
  account: { email: string | null; userId: string; signInMethod: string }
  capability: ReplacementCapability
  channels: SettingsChannel[]
  warnings: SettingsWarning[]
  config: SettingsConfigItem[]
}

// ── Raw shapes ───────────────────────────────────────────────────────────────

export type Read<T> = { ok: true; rows: T[] } | { ok: false; reason: 'error' | 'not_read' }

export interface RawStoredToken {
  platform?: string | null; token_type?: string | null; expires_at?: string | null; refreshed_at?: string | null
}
export interface RawTokenHealth {
  platform?: string | null; status?: string | null; days_left?: number | null
  expires_at?: string | null; last_verified_at?: string | null; last_refreshed_at?: string | null
}
export interface RawReplacement { platform?: string | null; outcome?: string | null; occurred_at?: string | null }

/** The default social project, from this session's point of view. */
export type SocialProjectState = 'owned' | 'foreign' | 'missing' | 'error'

export interface AssembleSettingsInput {
  now: string
  account: { email: string | null; userId: string }
  operatorOk: boolean
  socialProject: SocialProjectState
  storedTokens: Read<RawStoredToken>
  tokenHealth: Read<RawTokenHealth>
  replacements: Read<RawReplacement>
  /** Presence only: variable name → whether it holds a non-empty value. */
  env: Record<string, boolean>
}

// ── Pure assembly ────────────────────────────────────────────────────────────

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}
const KNOWN_HEALTH: readonly TokenHealthStatus[] = ['ok', 'warning', 'expired', 'error']

export function assembleSettings(input: AssembleSettingsInput): SettingsModel {
  // The route's order: the platform operator first, then the project it writes to.
  const capability: ReplacementCapability =
    !input.operatorOk ? { allowed: false, reason: 'operator_required' }
    : input.socialProject === 'error' ? { allowed: false, reason: 'project_unreadable' }
    : input.socialProject === 'missing' ? { allowed: false, reason: 'project_missing' }
    : input.socialProject === 'foreign' ? { allowed: false, reason: 'ownership_required' }
    : { allowed: true }

  const health = (id: ChannelId): SettingsChannel['health'] => {
    const none = { daysLeft: null, expiresAt: null, lastVerifiedAt: null, lastRefreshedAt: null }
    if (!input.tokenHealth.ok) return { readable: false, status: 'unchecked', ...none }
    const row = input.tokenHealth.rows.find((r) => text(r.platform) === id)
    if (!row) return { readable: true, status: 'unchecked', ...none }
    const raw = text(row.status)
    return {
      readable: true,
      status: raw && KNOWN_HEALTH.includes(raw as TokenHealthStatus) ? (raw as TokenHealthStatus) : 'unknown',
      daysLeft: typeof row.days_left === 'number' && Number.isFinite(row.days_left) ? row.days_left : null,
      expiresAt: text(row.expires_at),
      lastVerifiedAt: text(row.last_verified_at),
      lastRefreshedAt: text(row.last_refreshed_at),
    }
  }

  const replaceable = (id: ReplaceableChannelId): SettingsChannel => {
    const row = input.storedTokens.ok ? input.storedTokens.rows.find((r) => text(r.platform) === id) ?? null : null
    const storedUnreadable = !input.storedTokens.ok && input.storedTokens.reason === 'error'
    const source: CredentialSource =
      input.socialProject === 'error' || storedUnreadable ? 'unreadable'
      : input.socialProject === 'foreign' ? 'out_of_scope'
      : row ? 'stored'
      : input.env[ENV_FALLBACK[id]] ? 'environment'
      : 'missing'
    const lastReplacement: SettingsChannel['lastReplacement'] = input.replacements.ok
      ? {
          state: 'ok',
          at: text(input.replacements.rows.find((r) => text(r.platform) === id && text(r.outcome) === 'replaced')?.occurred_at),
        }
      : { state: input.replacements.reason, at: null }
    return {
      id,
      label: CHANNEL_LABELS[id],
      replaceable: true,
      source,
      stored: row ? { tokenType: text(row.token_type), expiresAt: text(row.expires_at), refreshedAt: text(row.refreshed_at) } : null,
      health: health(id),
      lastReplacement,
    }
  }

  const youtubeSet = YOUTUBE_OAUTH_VARS.filter((name) => input.env[name]).length
  const channels: SettingsChannel[] = [
    replaceable('instagram'),
    replaceable('facebook'),
    {
      id: 'youtube',
      label: CHANNEL_LABELS.youtube,
      replaceable: false,
      source: youtubeSet === YOUTUBE_OAUTH_VARS.length ? 'vercel' : youtubeSet === 0 ? 'missing' : 'vercel_incomplete',
      stored: null,
      health: health('youtube'),
      lastReplacement: { state: 'not_applicable', at: null },
    },
  ]

  // Every warning names the stored condition that produced it.
  const warnings: SettingsWarning[] = []
  for (const channel of channels) {
    const h = channel.health
    if (h.status === 'expired') {
      warnings.push({ id: `health:${channel.id}`, tone: 'attention',
        title: `${channel.label}: tokenet är ogiltigt, utgånget eller saknas`,
        detail: 'Enligt den senaste token-kontrollen. Publicering till kanalen misslyckas tills det åtgärdas.' })
    } else if (h.status === 'warning') {
      warnings.push({ id: `health:${channel.id}`, tone: 'attention',
        title: `${channel.label}: tokenet löper snart ut`,
        detail: h.daysLeft != null ? `${h.daysLeft} dagar kvar vid senaste kontroll.` : null })
    } else if (h.status === 'error') {
      warnings.push({ id: `health:${channel.id}`, tone: 'attention',
        title: `${channel.label}: token-kontrollen rapporterade fel`, detail: null })
    }
    if (channel.source === 'unreadable') {
      warnings.push({ id: `unreadable:${channel.id}`, tone: 'unreadable',
        title: `${channel.label}: lagrad metadata kunde inte läsas`,
        detail: 'Läsfel — det betyder inte att tokenet saknas.' })
    }
  }
  if (!input.tokenHealth.ok) {
    warnings.push({ id: 'unreadable:token_health', tone: 'unreadable',
      title: 'Token-kontrollen kunde inte läsas', detail: 'Läsfel — inte ett friskt resultat.' })
  }
  if (!input.replacements.ok && input.replacements.reason === 'error') {
    warnings.push({ id: 'unreadable:replacements', tone: 'unreadable',
      title: 'Revisionsloggen för ersättningar kunde inte läsas', detail: null })
  }

  const config: SettingsConfigItem[] = PLATFORM_CONFIG.map((item) => ({
    id: item.id,
    label: item.label,
    purpose: item.purpose,
    vars: [...item.vars],
    set: item.vars.filter((name) => input.env[name]).length,
  }))

  return {
    generatedAt: input.now,
    account: { email: input.account.email, userId: input.account.userId, signInMethod: ACCOUNT_SIGN_IN_METHOD },
    capability,
    channels,
    warnings,
    config,
  }
}

// ── Loader ───────────────────────────────────────────────────────────────────

/** Every variable the model reports on, as presence only. The values never leave this function. */
export function envPresence(): Record<string, boolean> {
  const names = new Set<string>([
    ...Object.values(ENV_FALLBACK),
    ...YOUTUBE_OAUTH_VARS,
    ...PLATFORM_CONFIG.flatMap((item) => item.vars),
  ])
  const presence: Record<string, boolean> = {}
  for (const name of names) {
    const value = process.env[name]
    presence[name] = typeof value === 'string' && value.trim() !== ''
  }
  return presence
}

type QueryResult = { data: unknown; error: unknown }

function toRead<T>(res: PromiseSettledResult<QueryResult>): Read<T> {
  if (res.status !== 'fulfilled' || res.value.error) return { ok: false, reason: 'error' }
  return { ok: true, rows: (res.value.data ?? []) as T[] }
}

const NOT_READ = { ok: false, reason: 'not_read' } as const

/**
 * Read the settings for this session. Returns `null` when the session or its
 * scope cannot be resolved, which the page turns into the redirect the legacy
 * body relied on — an authorization failure must never render as a page.
 */
export async function loadSettings(): Promise<SettingsModel | null> {
  const access = await resolveProjectAccess()
  if (!access.ok) return null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // The canonical predicate, evaluated for this session. Capability only.
  const operator = await resolvePlatformOperator()
  const db = createAdminClient()

  let socialProject: SocialProjectState = 'error'
  let projectId: string | null = null
  try {
    const { data, error } = await (db.from('projects') as any)
      .select('id').eq('slug', SOCIAL_PROJECT_SLUG).maybeSingle()
    if (!error) {
      projectId = text((data as { id?: unknown } | null)?.id)
      socialProject = !projectId ? 'missing'
        : assertProjectAllowed(projectId, access.allowedProjectIds) ? 'owned'
        : 'foreign'
    }
  } catch {
    socialProject = 'error'
  }

  const owned = socialProject === 'owned' && projectId !== null
  const skipped: Promise<QueryResult> = Promise.resolve({ data: [], error: null })

  const [storedRes, healthRes, replacementsRes] = await Promise.allSettled([
    owned
      ? (db.from('platform_tokens') as any)
          .select('platform, token_type, expires_at, refreshed_at')
          .eq('project_id', projectId).in('platform', ['instagram', 'facebook'])
      : skipped,
    (db.from('token_health') as any)
      .select('platform, status, days_left, expires_at, last_verified_at, last_refreshed_at'),
    owned
      ? // The table is newer than the generated database types; cast the client, as its writer does.
        (db as any).from('platform_credential_events')
          .select('platform, outcome, occurred_at')
          .eq('project_id', projectId).eq('outcome', 'replaced')
          .order('occurred_at', { ascending: false }).limit(20)
      : skipped,
  ])

  return assembleSettings({
    now: new Date().toISOString(),
    account: { email: user.email ?? null, userId: user.id },
    operatorOk: operator.ok,
    socialProject,
    storedTokens: owned ? toRead<RawStoredToken>(storedRes) : NOT_READ,
    tokenHealth: toRead<RawTokenHealth>(healthRes),
    replacements: owned ? toRead<RawReplacement>(replacementsRes) : NOT_READ,
    env: envPresence(),
  })
}
