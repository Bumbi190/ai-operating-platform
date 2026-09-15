/**
 * lib/media/social-bindings.ts — the Project → Platform → Verified External Account
 * relation, as the application reads and writes it.
 *
 * supabase/migrations/20260914120000_social_account_bindings.sql owns the
 * invariants: one active account per project and platform, one project per external
 * account (owner decision O1), immutable identity, one-way verification,
 * supersession and blocks, and no deletes. This module maps rows and database
 * refusals to closed values. It never throws, never returns a database message, and
 * holds no credential: a binding says which account a project owns, never how to act
 * as it.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXTERNAL_ACCOUNT_ID } from './social-identity'

// The table is newer than the generated database types; same boundary cast as the
// credential audit writer (lib/media/credential-events.ts).
type AnyDb = any

export type SocialPlatform = 'instagram' | 'facebook' | 'youtube'
/**
 * The platforms whose credential each project stores itself. YouTube joined with project
 * connections (Y2a); its one transitional binding (Y1) still uses the platform's
 * credential until Y2b.
 */
export type StoredSocialPlatform = 'instagram' | 'facebook' | 'youtube'
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['instagram', 'facebook', 'youtube']

export type CredentialSource = 'project_store' | 'platform_env_transitional'
export type BindingVerification = 'provider_attested' | 'runtime_evidence'

export interface SocialAccountBinding {
  bindingId: string
  projectId: string
  platform: SocialPlatform
  externalAccountId: string
  accountLabel: string | null
  credentialSource: CredentialSource
  verification: BindingVerification
  verifiedAt: string
  boundBy: string
  boundAt: string
  blockedAt: string | null
  blockedReason: string | null
}

export const BINDING_COLUMNS =
  'binding_id, project_id, platform, external_account_id, account_label, credential_source, verification, verified_at, bound_by, bound_at, blocked_at, blocked_reason'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPERATOR_ACTOR = /^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A project id as the relation accepts it: a UUID read from a server-side row. Never a slug, never a default. */
export function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

const PLATFORMS: ReadonlySet<string> = new Set(SOCIAL_PLATFORMS)
const SOURCES: ReadonlySet<string> = new Set(['project_store', 'platform_env_transitional'])
const VERIFICATIONS: ReadonlySet<string> = new Set(['provider_attested', 'runtime_evidence'])

/** A row as the table guarantees it, or null — a malformed row is never half-trusted. */
function toBinding(row: any): SocialAccountBinding | null {
  if (!row || typeof row !== 'object') return null
  if (!isProjectId(row.binding_id) || !isProjectId(row.project_id)) return null
  if (!PLATFORMS.has(row.platform) || !SOURCES.has(row.credential_source) || !VERIFICATIONS.has(row.verification)) return null
  if (typeof row.external_account_id !== 'string' || !EXTERNAL_ACCOUNT_ID.test(row.external_account_id)) return null
  if (typeof row.verified_at !== 'string' || typeof row.bound_at !== 'string' || typeof row.bound_by !== 'string') return null
  return {
    bindingId: row.binding_id,
    projectId: row.project_id,
    platform: row.platform,
    externalAccountId: row.external_account_id,
    accountLabel: typeof row.account_label === 'string' && row.account_label.length > 0 ? row.account_label : null,
    credentialSource: row.credential_source,
    verification: row.verification,
    verifiedAt: row.verified_at,
    boundBy: row.bound_by,
    boundAt: row.bound_at,
    blockedAt: typeof row.blocked_at === 'string' ? row.blocked_at : null,
    blockedReason: typeof row.blocked_reason === 'string' ? row.blocked_reason : null,
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

export type BindingRead = { ok: true; binding: SocialAccountBinding | null } | { ok: false }
export type BindingList = { ok: true; bindings: SocialAccountBinding[] } | { ok: false }

/** The project's active binding on a platform. `ok: false` is unreadable — never "no binding". */
export async function readActiveBinding(projectId: string, platform: SocialPlatform, client?: AnyDb): Promise<BindingRead> {
  if (!isProjectId(projectId) || !PLATFORMS.has(platform)) return { ok: false }
  try {
    const db = client ?? createAdminClient()
    const { data, error } = await (db as AnyDb).from('social_account_bindings')
      .select(BINDING_COLUMNS)
      .eq('project_id', projectId)
      .eq('platform', platform)
      .is('superseded_at', null)
      .maybeSingle()
    if (error) return { ok: false }
    if (!data) return { ok: true, binding: null }
    const binding = toBinding(data)
    return binding && binding.projectId === projectId && binding.platform === platform
      ? { ok: true, binding }
      : { ok: false }
  } catch {
    return { ok: false }
  }
}

/** The one project an external account is actively bound to, if any (O1). */
export async function readActiveBindingForAccount(
  platform: SocialPlatform, externalAccountId: string, client?: AnyDb,
): Promise<BindingRead> {
  if (!PLATFORMS.has(platform) || !EXTERNAL_ACCOUNT_ID.test(externalAccountId)) return { ok: false }
  try {
    const db = client ?? createAdminClient()
    const { data, error } = await (db as AnyDb).from('social_account_bindings')
      .select(BINDING_COLUMNS)
      .eq('platform', platform)
      .eq('external_account_id', externalAccountId)
      .is('superseded_at', null)
      .maybeSingle()
    if (error) return { ok: false }
    if (!data) return { ok: true, binding: null }
    const binding = toBinding(data)
    return binding && binding.externalAccountId === externalAccountId ? { ok: true, binding } : { ok: false }
  } catch {
    return { ok: false }
  }
}

/** Active bindings: of the given projects, or — for platform crons — of every project. */
export async function listActiveBindings(projectIds?: readonly string[], client?: AnyDb): Promise<BindingList> {
  if (projectIds) {
    if (projectIds.length === 0) return { ok: true, bindings: [] }
    if (!projectIds.every(isProjectId)) return { ok: false }
  }
  try {
    const db = client ?? createAdminClient()
    let query = (db as AnyDb).from('social_account_bindings')
      .select(BINDING_COLUMNS)
      .is('superseded_at', null)
    if (projectIds) query = query.in('project_id', projectIds)
    const { data, error } = await query.order('project_id', { ascending: true }).order('platform', { ascending: true })
    if (error || !Array.isArray(data)) return { ok: false }
    const bindings = data.map(toBinding)
    if (bindings.some(b => b === null)) return { ok: false }
    return { ok: true, bindings: bindings as SocialAccountBinding[] }
  } catch {
    return { ok: false }
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export type BindingWriteFailure =
  /** O1: the account is actively bound to another project. */
  | 'account_bound_to_other_project'
  /** The project already has an active binding on the platform (a concurrent first bind). */
  | 'project_already_bound'
  /** The binding a rebind expected is no longer the project's active one. */
  | 'binding_changed'
  | 'write_failed'

export type BindingWrite = { ok: true; bindingId: string } | { ok: false; failure: BindingWriteFailure }

export interface NewBinding {
  projectId: string
  platform: StoredSocialPlatform
  /** Provider-attested just now — never taken from a request. */
  externalAccountId: string
  accountLabel: string | null
  /** The server-authenticated operator: `user:<uuid>`. */
  boundBy: string
}

function validNewBinding(input: NewBinding): boolean {
  return isProjectId(input.projectId)
    && (input.platform === 'instagram' || input.platform === 'facebook' || input.platform === 'youtube')
    && EXTERNAL_ACCOUNT_ID.test(input.externalAccountId)
    && (input.accountLabel === null || (input.accountLabel.length >= 1 && input.accountLabel.length <= 200))
    && OPERATOR_ACTOR.test(input.boundBy)
}

function writeFailure(error: any): BindingWriteFailure {
  const code = typeof error?.code === 'string' ? error.code : ''
  const said = `${typeof error?.message === 'string' ? error.message : ''} ${typeof error?.details === 'string' ? error.details : ''}`
  if (code === '23505') {
    if (said.includes('social_account_bindings_account_single_project')) return 'account_bound_to_other_project'
    if (said.includes('social_account_bindings_one_active_per_project_platform')) return 'project_already_bound'
    return 'write_failed'
  }
  if (code === 'P0002') return 'binding_changed'
  return 'write_failed'
}

/** A project's first binding on a platform, for an account the provider has just attested. */
export async function createBinding(input: NewBinding, client?: AnyDb): Promise<BindingWrite> {
  if (!validNewBinding(input)) return { ok: false, failure: 'write_failed' }
  try {
    const db = client ?? createAdminClient()
    const { data, error } = await (db as AnyDb).from('social_account_bindings')
      .insert({
        project_id: input.projectId,
        platform: input.platform,
        external_account_id: input.externalAccountId,
        account_label: input.accountLabel,
        credential_source: 'project_store',
        verification: 'provider_attested',
        verified_at: new Date().toISOString(),
        bound_by: input.boundBy,
      })
      .select('binding_id')
      .single()
    if (error) return { ok: false, failure: writeFailure(error) }
    return isProjectId(data?.binding_id) ? { ok: true, bindingId: data.binding_id } : { ok: false, failure: 'write_failed' }
  } catch {
    return { ok: false, failure: 'write_failed' }
  }
}

/**
 * An explicit operator account change: supersedes `expectedBindingId` and binds the
 * new, provider-attested account in one database transaction
 * (public.social_account_rebind). A refusal leaves the old binding untouched.
 */
export async function rebindAccount(input: NewBinding & { expectedBindingId: string }, client?: AnyDb): Promise<BindingWrite> {
  if (!validNewBinding(input) || !isProjectId(input.expectedBindingId)) return { ok: false, failure: 'write_failed' }
  try {
    const db = client ?? createAdminClient()
    const { data, error } = await (db as AnyDb).rpc('social_account_rebind', {
      p_project_id: input.projectId,
      p_platform: input.platform,
      p_expected_binding_id: input.expectedBindingId,
      p_external_account_id: input.externalAccountId,
      p_account_label: input.accountLabel,
      p_bound_by: input.boundBy,
    })
    if (error) return { ok: false, failure: writeFailure(error) }
    return isProjectId(data) ? { ok: true, bindingId: data } : { ok: false, failure: 'write_failed' }
  } catch {
    return { ok: false, failure: 'write_failed' }
  }
}

/**
 * Records that a provider has just answered with the binding's own account. Upgrades
 * runtime evidence to a provider attestation and keeps the display name the provider
 * gave; never downgrades and never touches identity (the table refuses both).
 */
export async function recordProviderAttestation(
  binding: SocialAccountBinding, accountLabel: string | null, client?: AnyDb,
): Promise<boolean> {
  try {
    const db = client ?? createAdminClient()
    const { error } = await (db as AnyDb).from('social_account_bindings')
      .update({
        verification: 'provider_attested',
        verified_at: new Date().toISOString(),
        ...(accountLabel ? { account_label: accountLabel } : {}),
      })
      .eq('binding_id', binding.bindingId)
      .is('superseded_at', null)
    return !error
  } catch {
    return false
  }
}

/**
 * Blocks a binding whose account a provider contradicted after the fact (YouTube Y1:
 * an upload landed on another channel). Permanent — the table refuses to lift a block;
 * only a new binding clears it.
 */
export async function blockBinding(bindingId: string, client?: AnyDb): Promise<boolean> {
  if (!isProjectId(bindingId)) return false
  try {
    const db = client ?? createAdminClient()
    const { error } = await (db as AnyDb).from('social_account_bindings')
      .update({ blocked_at: new Date().toISOString(), blocked_reason: 'account_mismatch' })
      .eq('binding_id', bindingId)
      .is('superseded_at', null)
      .is('blocked_at', null)
    return !error
  } catch {
    return false
  }
}
