/**
 * Bounded Insights ingestion for Instagram posts published through the separate
 * social_publications workflow (Familje-Stunden, etc.).
 *
 * READS: existing verified project/account bindings and provider-confirmed
 * publication receipts. WRITES: existing media_insights only.
 *
 * No account credentials or provider errors are returned to the caller.
 * No publish, comment, DM, new schema, or new scheduler.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listActiveBindings } from './social-bindings'
import { resolveInstagramCredential } from './social-credentials'
import { fetchMediaInsights, type MediaInsight } from './insights'

type AnyDb = any
export const SOCIAL_IG_INSIGHTS_PER_PROJECT = 4
export const SOCIAL_IG_INSIGHTS_PROJECT_CAP = 10
// At most two provider hosts each using 12s timeout; leave a buffer at the end.
export const SOCIAL_IG_INSIGHTS_DEADLINE_BUFFER_MS = 27_000

export type SocialInsightsOutcome = {
  status: 'complete' | 'partial' | 'unavailable' | 'time_budget_exhausted'
  planned: number
  attempted: number
  written: number
  skipped: number
}

type VerifiedCredential = {
  projectId: string
  bindingId: string
  accountId: string
  token: string
}

type Binding = {
  projectId: string
  bindingId: string
  externalAccountId: string
  platform: string
}
type Dependencies = {
  db: AnyDb
  activeBindings: () => Promise<{ ok: true; bindings: Binding[] } | { ok: false }>
  resolve: (projectId: string) => Promise<{ ok: true; credential: VerifiedCredential } | { ok: false }>
  fetch: (mediaId: string, token: string) => Promise<{ ok: boolean; metrics?: MediaInsight }>
  now: () => number
}
export type SocialInsightsOptions = {
  deadlineAt?: number
  perProject?: number
}

const mediaIdValid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9]{1,80}$/.test(value)

function validCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

async function run(deps: Dependencies, options: SocialInsightsOptions): Promise<SocialInsightsOutcome> {
  const deadlineAt = options.deadlineAt
  const expired = () => deadlineAt !== undefined &&
    deps.now() + SOCIAL_IG_INSIGHTS_DEADLINE_BUFFER_MS >= deadlineAt
  let planned = 0, attempted = 0, written = 0, skipped = 0, sourceFailures = 0
  const complete = (): SocialInsightsOutcome => ({
    status: skipped > 0 ? 'time_budget_exhausted'
      : sourceFailures > 0 ? (written > 0 ? 'partial' : 'unavailable')
      : written < attempted ? 'partial' : 'complete',
    planned, attempted, written, skipped,
  })
  if (expired()) return { ...complete(), status: 'time_budget_exhausted' }
  const active = await deps.activeBindings()
  if (!active.ok) return { status: 'unavailable', planned, attempted, written, skipped }

  // The cap bounds Meta calls even with many connected projects.
  const bindings = active.bindings.filter(b => b.platform === 'instagram')
    .slice(0, SOCIAL_IG_INSIGHTS_PROJECT_CAP)
  const requestedLimit = options.perProject ?? SOCIAL_IG_INSIGHTS_PER_PROJECT
  const perProject = Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(SOCIAL_IG_INSIGHTS_PER_PROJECT, requestedLimit))
    : SOCIAL_IG_INSIGHTS_PER_PROJECT
  for (const binding of bindings) {
    if (expired()) return { ...complete(), status: 'time_budget_exhausted' }
    // A cheap, project/binding-scoped DB read comes before the provider
    // identity check. Accounts with no social_publications cost zero Meta calls.
    const { data: pubs, error } = await deps.db.from('social_publications')
      .select('id, project_id, binding_id, account_id, provider_id, updated_at, state, channel')
      .eq('project_id', binding.projectId)
      .eq('binding_id', binding.bindingId)
      .eq('account_id', binding.externalAccountId)
      .eq('channel', 'instagram')
      .eq('state', 'published')
      .not('provider_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(perProject)

    if (error || !Array.isArray(pubs)) {
      sourceFailures++
      continue
    }
    if (pubs.length === 0) continue

    // Resolve a credential only for a project with matching published receipts.
    // The provider-confirmed project, binding and account must all agree.
    const credential = await deps.resolve(binding.projectId)
    if (!credential.ok || credential.credential.projectId !== binding.projectId ||
      credential.credential.bindingId !== binding.bindingId ||
      credential.credential.accountId !== binding.externalAccountId) {
      sourceFailures++
      continue
    }
    // Count only rows we could potentially measure. Each project has its own
    // selection; there is no cross-account union or unscoped lookup.
    for (const row of pubs) {
      if (row.project_id !== binding.projectId || row.binding_id !== binding.bindingId ||
        row.account_id !== binding.externalAccountId || row.channel !== 'instagram' ||
        row.state !== 'published' || !mediaIdValid(row.provider_id)) continue
      planned++
      if (expired()) {
        skipped++
        continue
      }
      attempted++

      try {
        // media_insights already has UNIQUE(instagram_media_id). Avoid rewriting
        // another project's record or anything owned by the media_scripts job.
        const existing = await deps.db.from('media_insights')
          .select('id, project_id, script_id, platform')
          .eq('instagram_media_id', row.provider_id)
          .maybeSingle()
        if (existing.error) continue
        if (existing.data && (existing.data.project_id !== binding.projectId ||
          existing.data.script_id !== null || existing.data.platform !== 'instagram')) continue

        if (expired()) { skipped++; attempted--; continue }
        const response = await deps.fetch(row.provider_id, credential.credential.token)
        if (!response.ok || !response.metrics) continue
        const metrics = response.metrics
        const counts = {
          // MISSING is null, never a fabricated zero.
          views: validCount(metrics.views),
          reach: validCount(metrics.reach),
          saved: validCount(metrics.saved),
          shares: validCount(metrics.shares),
          likes: validCount(metrics.likes),
          comments: validCount(metrics.comments),
          total_interactions: validCount(metrics.total_interactions),
          fetched_at: new Date(deps.now()).toISOString(),
        }
        if (existing.data) {
          // Atomic ownership predicate at WRITE time, not just a prior read.
          // A concurrent project transfer/claim cannot be overwritten.
          const { data: updated, error: saveError } = await deps.db.from('media_insights')
            .update(counts)
            .eq('id', existing.data.id)
            .eq('project_id', binding.projectId)
            .eq('instagram_media_id', row.provider_id)
            .eq('platform', 'instagram')
            .is('script_id', null)
            .select('id')
            .maybeSingle()
          if (!saveError && updated?.id === existing.data.id) written++
        } else {
          // INSERT, never UPSERT: a concurrent unique-key claim must fail,
          // not update a post belonging to another project or a script.
          const { error: saveError } = await deps.db.from('media_insights').insert({
            ...counts,
            project_id: binding.projectId,
            script_id: null,
            platform: 'instagram',
            instagram_media_id: row.provider_id,
            published_at: typeof row.updated_at === 'string' ? row.updated_at : null,
          })
          if (!saveError) written++
        }
      } catch {
        // No provider errors or credential details leave this function.
      }
    }
  }
  return complete()
}

/** Testable with injected DB/credentials/network; production uses existing providers. */
export async function refreshSocialPublicationInstagramInsights(
  options: SocialInsightsOptions = {},
  overrides: Partial<Dependencies> = {},
): Promise<SocialInsightsOutcome> {
  try {
    return await run({
      db: overrides.db ?? createAdminClient(),
      activeBindings: overrides.activeBindings ?? (() => listActiveBindings()),
      resolve: overrides.resolve ?? (projectId => resolveInstagramCredential(projectId)),
      fetch: overrides.fetch ?? ((mediaId, token) => fetchMediaInsights(mediaId, token)),
      now: overrides.now ?? Date.now,
    }, options)
  } catch {
    // Best-effort analytics must not break the established daily cron, and
    // untrusted provider / database error strings never leave this boundary.
    return { status: 'unavailable', planned: 0, attempted: 0, written: 0, skipped: 0 }
  }
}
