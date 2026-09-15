import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { listActiveBindings, type BindingList } from '@/lib/media/social-bindings'
import {
  ACCOUNT_SIGN_IN_METHOD,
  CHANNEL_LABELS,
  type AccountVerification,
  type ChannelId,
  type CredentialHealthStatus,
  type CredentialState,
  type ReplacementCapability,
} from './settings-shared'

/**
 * Inställningar — the read model behind vNext `/settings`.
 *
 * AN OPERATOR SURFACE, NOT AN AUTHORITY SOURCE. Settings shows the account, every
 * project this session owns with its social accounts — Project → Platform → Verified
 * External Account → Credential — and which platform configuration is present. Its
 * writes are the existing `POST /api/media/token`,
 * `POST /api/media/social-accounts/verify` and `POST /api/media/youtube/oauth/start`
 * (Google's consent for one project's YouTube channel), offered only when `capability` says this
 * session passes the canonical platform-operator predicate; each route re-checks the
 * operator and ownership of the project it is given, every time.
 *
 * PROJECT-SCOPED. Every read is filtered to the projects `resolveProjectAccess()` says
 * this session owns, and nothing is read for any other project. No project is special:
 * The Prompt, Familje-Stunden, GainPilot and every future project are shown the same way.
 *
 * CREDENTIAL-BLIND. Every read selects metadata only:
 *   social_account_bindings    the bound account: id, attested name, verification,
 *                              provenance and block — the table holds no credential.
 *   platform_tokens            project_id, platform, token_type, account_id, expires_at,
 *                              refreshed_at — never access_token. The column is NOT
 *                              NULL, so a row is itself the proof a credential is stored.
 *   social_credential_health   closed status codes and bounded ids — never text.
 *   platform_credential_events project_id, platform, outcome, occurred_at, binding_action.
 * Environment variables are read as presence booleans. No value leaves this file.
 *
 * UNREADABLE IS NOT MISSING, AND ABSENT IS NOT HEALTHY. A failed read renders as
 * unreadable; a channel with no verification row renders as unchecked.
 */

// ── Contract ─────────────────────────────────────────────────────────────────

/** The OAuth variables the YouTube Y1 transition publishes with. */
export const YOUTUBE_OAUTH_VARS = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'] as const

/** The platform's OAuth client — what a project's YouTube connection needs. Never an account credential. */
export const YOUTUBE_OAUTH_CLIENT_VARS = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'] as const

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
  { id: 'meta', label: 'Meta-app', purpose: 'Tokenväxling och Instagram-webhooks', vars: ['META_APP_ID', 'META_APP_SECRET'] },
  { id: 'youtube', label: 'YouTube', purpose: 'Kanalanslutning per projekt och publicering under övergången (OAuth) samt statistik (API-nyckel)', vars: [...YOUTUBE_OAUTH_VARS, 'YOUTUBE_API_KEY'] },
  { id: 'brevo', label: 'Brevo', purpose: 'E-postutskick', vars: ['BREVO_API_KEY'] },
  { id: 'stripe', label: 'Stripe', purpose: 'Intäktsmått (begränsad nyckel)', vars: ['STRIPE_RESTRICTED_KEY'] },
  { id: 'pixabay', label: 'Pixabay', purpose: 'Musik till videor', vars: ['PIXABAY_API_KEY'] },
  { id: 'cron', label: 'Schemaläggning', purpose: 'Autentiserar de schemalagda jobben', vars: ['CRON_SECRET'] },
]

const CHANNEL_ORDER: readonly ChannelId[] = ['instagram', 'facebook', 'youtube']

export interface SettingsBoundAccount {
  externalAccountId: string
  /** The name a platform attested. Null until one has — the surface says so instead of guessing. */
  label: string | null
  verification: AccountVerification
  verifiedAt: string
  blocked: boolean
}

export interface SettingsChannel {
  id: ChannelId
  label: string
  /** Instagram and Facebook credentials are stored per project and replaceable here with a token. */
  replaceable: boolean
  /**
   * YouTube is connected per project with Google's consent here, when the platform's OAuth
   * client is configured. Never true for Instagram or Facebook.
   */
  connectable: boolean
  /** The project's verified external account on this platform. */
  account: { state: 'bound'; bound: SettingsBoundAccount } | { state: 'none' } | { state: 'unreadable' }
  credential: {
    state: CredentialState
    expiresAt: string | null
    refreshedAt: string | null
    /** Whether the stored credential's recorded account is the bound account; null when either is unknown. */
    matchesBinding: boolean | null
  }
  health: {
    readable: boolean
    status: CredentialHealthStatus
    identityVerified: boolean
    checkedAt: string | null
    expiresAt: string | null
    daysLeft: number | null
    lastRefreshedAt: string | null
  }
  /** The latest audited replacement for this project and platform. */
  lastReplacement: { state: 'ok' | 'error'; at: string | null; bindingAction: string | null }
}

export interface SettingsProject {
  id: string
  name: string
  slug: string | null
  channels: SettingsChannel[]
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
  projects: { state: 'ok'; items: SettingsProject[] } | { state: 'error' }
  warnings: SettingsWarning[]
  config: SettingsConfigItem[]
}

// ── Raw shapes ───────────────────────────────────────────────────────────────

export type Read<T> = { ok: true; rows: T[] } | { ok: false }

export interface RawProject { id?: unknown; name?: unknown; slug?: unknown }
export interface RawStoredToken {
  project_id?: unknown; platform?: unknown; token_type?: unknown; account_id?: unknown
  expires_at?: unknown; refreshed_at?: unknown
}
export interface RawHealth {
  project_id?: unknown; platform?: unknown; status?: unknown; identity_verified?: unknown
  verified_account_id?: unknown; checked_at?: unknown; expires_at?: unknown; days_left?: unknown; last_refreshed_at?: unknown
}
export interface RawReplacement {
  project_id?: unknown; platform?: unknown; outcome?: unknown; occurred_at?: unknown; binding_action?: unknown
}

export interface AssembleSettingsInput {
  now: string
  account: { email: string | null; userId: string }
  operatorOk: boolean
  projects: Read<RawProject>
  bindings: BindingList
  storedTokens: Read<RawStoredToken>
  health: Read<RawHealth>
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

const KNOWN_HEALTH: readonly CredentialHealthStatus[] =
  ['ok', 'warning', 'expired', 'account_mismatch', 'binding_blocked', 'credential_missing', 'verification_failed']

const HEALTH_ATTENTION: Partial<Record<CredentialHealthStatus, { title: string; detail: string }>> = {
  expired: { title: 'credentialen är ogiltig eller har gått ut', detail: 'Enligt den senaste verifieringen. Inget publiceras på kanalen förrän den ersätts.' },
  account_mismatch: { title: 'credentialen tillhör inte projektets konto', detail: 'Plattformen svarade med ett annat konto. Inget publiceras med den.' },
  credential_missing: { title: 'credential saknas för det kopplade kontot', detail: 'Inget publiceras på kanalen förrän en credential läggs till.' },
  verification_failed: { title: 'credentialen kunde inte verifieras vid senaste kontrollen', detail: 'Plattformen gick inte att fråga. Nästa kontroll försöker igen.' },
}

export function assembleSettings(input: AssembleSettingsInput): SettingsModel {
  // The operator predicate is what both credential routes check first; ownership is
  // implied by the project list and re-checked by the routes per project.
  const capability: ReplacementCapability =
    input.operatorOk ? { allowed: true } : { allowed: false, reason: 'operator_required' }

  const warnings: SettingsWarning[] = []
  const youtubeVarsSet = YOUTUBE_OAUTH_VARS.filter((name) => input.env[name]).length
  const youtubeClientConfigured = YOUTUBE_OAUTH_CLIENT_VARS.every((name) => input.env[name])

  const channelFor = (projectId: string, projectName: string, platform: ChannelId): SettingsChannel => {
    const binding = input.bindings.ok
      ? input.bindings.bindings.find((b) => b.projectId === projectId && b.platform === platform) ?? null
      : null
    const account: SettingsChannel['account'] = !input.bindings.ok
      ? { state: 'unreadable' }
      : binding
        ? {
            state: 'bound',
            bound: {
              externalAccountId: binding.externalAccountId,
              label: binding.accountLabel,
              verification: binding.verification,
              verifiedAt: binding.verifiedAt,
              blocked: binding.blockedAt !== null,
            },
          }
        : { state: 'none' }

    let credential: SettingsChannel['credential']
    if (platform === 'youtube' && (!input.bindings.ok || binding?.credentialSource === 'platform_env_transitional')) {
      // Y1: the transitional binding publishes with the platform's Vercel credential.
      const state: CredentialState = !input.bindings.ok ? 'unreadable'
        : youtubeVarsSet === YOUTUBE_OAUTH_VARS.length ? 'environment_transitional' : 'environment_incomplete'
      credential = { state, expiresAt: null, refreshedAt: null, matchesBinding: null }
    } else if (!input.storedTokens.ok) {
      credential = { state: 'unreadable', expiresAt: null, refreshedAt: null, matchesBinding: null }
    } else {
      const row = input.storedTokens.rows.find((r) => text(r.project_id) === projectId && text(r.platform) === platform)
      if (!row) {
        credential = { state: 'missing', expiresAt: null, refreshedAt: null, matchesBinding: null }
      } else {
        const recorded = text(row.account_id)
        credential = {
          state: 'stored',
          expiresAt: text(row.expires_at),
          refreshedAt: text(row.refreshed_at),
          matchesBinding: recorded && binding ? recorded === binding.externalAccountId : null,
        }
      }
    }

    const healthRow = input.health.ok
      ? input.health.rows.find((r) => text(r.project_id) === projectId && text(r.platform) === platform) ?? null
      : null
    const rawStatus = text(healthRow?.status)
    const health: SettingsChannel['health'] = {
      readable: input.health.ok,
      status: !input.health.ok || !healthRow ? 'unchecked'
        : rawStatus && KNOWN_HEALTH.includes(rawStatus as CredentialHealthStatus) ? rawStatus as CredentialHealthStatus
        : 'unknown',
      identityVerified: healthRow?.identity_verified === true,
      checkedAt: text(healthRow?.checked_at),
      expiresAt: text(healthRow?.expires_at),
      daysLeft: typeof healthRow?.days_left === 'number' && Number.isFinite(healthRow.days_left) ? healthRow.days_left : null,
      lastRefreshedAt: text(healthRow?.last_refreshed_at),
    }

    const replacement = input.replacements.ok
      ? input.replacements.rows.find((r) =>
          text(r.project_id) === projectId && text(r.platform) === platform && text(r.outcome) === 'replaced') ?? null
      : null
    const lastReplacement: SettingsChannel['lastReplacement'] = input.replacements.ok
      ? { state: 'ok', at: text(replacement?.occurred_at), bindingAction: text(replacement?.binding_action) }
      : { state: 'error', at: null, bindingAction: null }

    // Every warning names the project, the channel and the stored condition that produced it.
    const who = `${projectName} · ${CHANNEL_LABELS[platform]}`
    if (binding?.blockedAt) {
      warnings.push({ id: `blocked:${projectId}:${platform}`, tone: 'attention',
        title: `${who}: kontobindningen är spärrad`,
        detail: 'Plattformen rapporterade ett annat konto än det bundna. Inget publiceras på kanalen förrän den binds om.' })
    }
    if (credential.matchesBinding === false) {
      warnings.push({ id: `mismatch:${projectId}:${platform}`, tone: 'attention',
        title: `${who}: den sparade credentialn är registrerad för ett annat konto än projektets`,
        detail: 'Inget publiceras med den. Ersätt den med en credential för projektets konto.' })
    }
    const attention = health.readable ? HEALTH_ATTENTION[health.status] : undefined
    if (attention) {
      warnings.push({ id: `health:${projectId}:${platform}`, tone: 'attention', title: `${who}: ${attention.title}`, detail: attention.detail })
    } else if (health.status === 'warning') {
      warnings.push({ id: `health:${projectId}:${platform}`, tone: 'attention',
        title: `${who}: credentialen löper snart ut`,
        detail: health.daysLeft != null ? `${health.daysLeft} dagar kvar vid senaste kontroll.` : null })
    }

    return {
      id: platform,
      label: CHANNEL_LABELS[platform],
      replaceable: platform !== 'youtube',
      connectable: platform === 'youtube' && youtubeClientConfigured,
      account,
      credential,
      health,
      lastReplacement,
    }
  }

  let projects: SettingsModel['projects']
  if (!input.projects.ok) {
    projects = { state: 'error' }
    warnings.push({ id: 'unreadable:projects', tone: 'unreadable',
      title: 'Dina projekt kunde inte läsas', detail: 'Läsfel — inga konton eller credentials visas, vilket inte betyder att de saknas.' })
  } else {
    const items: SettingsProject[] = []
    for (const raw of input.projects.rows) {
      const id = text(raw.id)
      if (!id) continue
      const name = text(raw.name) ?? 'Namnlöst projekt'
      items.push({ id, name, slug: text(raw.slug), channels: CHANNEL_ORDER.map((platform) => channelFor(id, name, platform)) })
    }
    projects = { state: 'ok', items }
  }

  if (!input.bindings.ok) {
    warnings.push({ id: 'unreadable:bindings', tone: 'unreadable',
      title: 'Kontobindningarna kunde inte läsas', detail: 'Läsfel — det betyder inte att projekten saknar konton.' })
  }
  if (!input.storedTokens.ok) {
    warnings.push({ id: 'unreadable:credentials', tone: 'unreadable',
      title: 'Lagrad credential-metadata kunde inte läsas', detail: 'Läsfel — det betyder inte att credentials saknas.' })
  }
  if (!input.health.ok) {
    warnings.push({ id: 'unreadable:health', tone: 'unreadable',
      title: 'Verifieringarna kunde inte läsas', detail: 'Läsfel — inte ett friskt resultat.' })
  }
  if (!input.replacements.ok) {
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
    projects,
    warnings,
    config,
  }
}

// ── Loader ───────────────────────────────────────────────────────────────────

/** Every variable the model reports on, as presence only. The values never leave this function. */
export function envPresence(): Record<string, boolean> {
  const names = new Set<string>([
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

async function settle<T>(query: PromiseLike<QueryResult>): Promise<Read<T>> {
  try {
    const { data, error } = await query
    if (error) return { ok: false }
    return { ok: true, rows: (Array.isArray(data) ? data : []) as T[] }
  } catch {
    return { ok: false }
  }
}

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
  const owned = access.allowedProjectIds
  const nothing: PromiseLike<QueryResult> = Promise.resolve({ data: [], error: null })

  const [projects, storedTokens, health, replacements, bindings] = await Promise.all([
    settle<RawProject>(owned.length
      ? (db.from('projects') as any).select('id, name, slug').in('id', owned).order('created_at', { ascending: true })
      : nothing),
    settle<RawStoredToken>(owned.length
      ? (db.from('platform_tokens') as any)
          .select('project_id, platform, token_type, account_id, expires_at, refreshed_at')
          .in('project_id', owned).in('platform', ['instagram', 'facebook', 'youtube'])
      : nothing),
    // The tables are newer than the generated database types; cast the client, as their writers do.
    settle<RawHealth>(owned.length
      ? (db as any).from('social_credential_health')
          .select('project_id, platform, status, identity_verified, verified_account_id, checked_at, expires_at, days_left, last_refreshed_at')
          .in('project_id', owned)
      : nothing),
    settle<RawReplacement>(owned.length
      ? (db as any).from('platform_credential_events')
          .select('project_id, platform, outcome, occurred_at, binding_action')
          .in('project_id', owned).eq('outcome', 'replaced')
          .order('occurred_at', { ascending: false }).limit(200)
      : nothing),
    listActiveBindings(owned, db),
  ])

  return assembleSettings({
    now: new Date().toISOString(),
    account: { email: user.email ?? null, userId: user.id },
    operatorOk: operator.ok,
    projects,
    bindings,
    storedTokens,
    health,
    replacements,
    env: envPresence(),
  })
}
