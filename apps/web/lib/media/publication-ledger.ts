import type { SupabaseClient } from '@supabase/supabase-js'

export type PublicationChannel = 'youtube' | 'instagram' | 'facebook'

type PublicationProviderState = {
  providerAttemptId?: string | null
  providerContainerId?: string | null
  providerUploadUrl?: string | null
}

export type PublicationLedgerClaim =
  | ({ status: 'claimed'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'already_published'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'in_progress'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'retry_claimed'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'stale_claim_recovered'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'unknown_external_outcome'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'reconciliation_required'; ledgerId: string; externalPublicationId?: string | null } & PublicationProviderState)
  | ({ status: 'blocked'; ledgerId?: string; reason: string; externalPublicationId?: string | null } & PublicationProviderState)

type PublicationClaimRow = {
  status: PublicationLedgerClaim['status']
  ledger_id: string | null
  externalPublicationId?: string | null
  external_publication_id?: string | null
  provider_attempt_id?: string | null
  provider_container_id?: string | null
  provider_upload_url?: string | null
  reason?: string | null
}

export function publicationIdempotencyKey(input: {
  projectId: string
  scriptId: string
  mediaAssetId: string
  channel: PublicationChannel
}) {
  return `${input.projectId}:${input.scriptId}:${input.mediaAssetId}:${input.channel}`
}

export async function claimPublicationChannel(
  db: SupabaseClient,
  input: {
    projectId: string
    newsItemId?: string | null
    scriptId: string
    mediaAssetId: string
    channel: PublicationChannel
    scheduledTime?: string | null
  },
): Promise<PublicationLedgerClaim> {
  const idempotencyKey = publicationIdempotencyKey(input)

  const { data, error } = await (db as any).rpc('claim_media_publication', {
    p_project_id: input.projectId,
    p_news_item_id: input.newsItemId ?? null,
    p_script_id: input.scriptId,
    p_media_asset_id: input.mediaAssetId,
    p_channel: input.channel,
    p_scheduled_time: input.scheduledTime ?? null,
    p_idempotency_key: idempotencyKey,
  })

  if (error) throw new Error(`publication ledger claim failed: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as PublicationClaimRow | null
  if (!row?.status) return { status: 'blocked', reason: 'claim returned no status' }
  const externalPublicationId = row.external_publication_id ?? row.externalPublicationId ?? null
  const providerState = {
    providerAttemptId: row.provider_attempt_id ?? null,
    providerContainerId: row.provider_container_id ?? null,
    providerUploadUrl: row.provider_upload_url ?? null,
  }
  if (row.status === 'blocked') {
    return { status: 'blocked', ledgerId: row.ledger_id ?? undefined, reason: row.reason ?? 'blocked', externalPublicationId, ...providerState }
  }
  if (!row.ledger_id) return { status: 'blocked', reason: 'claim returned no ledger id', externalPublicationId, ...providerState }
  return { status: row.status, ledgerId: row.ledger_id, externalPublicationId, ...providerState } as PublicationLedgerClaim
}

export async function markPublicationPublished(
  db: SupabaseClient,
  ledgerId: string | undefined,
  externalPublicationId: string,
) {
  if (!ledgerId) return
  const { error } = await (db.from('media_publication_ledger') as any)
    .update({
      state: 'published',
      external_publication_id: externalPublicationId,
      published_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ledgerId)
  if (error) throw new Error(`publication ledger publish mark failed: ${error.message}`)
}

export async function markPublicationProviderAttempt(
  db: SupabaseClient,
  ledgerId: string | undefined,
  input: {
    providerAttemptId?: string | null
    providerContainerId?: string | null
    providerUploadUrl?: string | null
  },
) {
  if (!ledgerId) return
  const patch: Record<string, string> = { updated_at: new Date().toISOString() }
  if (input.providerAttemptId) patch.provider_attempt_id = input.providerAttemptId
  if (input.providerContainerId) patch.provider_container_id = input.providerContainerId
  if (input.providerUploadUrl) patch.provider_upload_url = input.providerUploadUrl
  const { error } = await (db.from('media_publication_ledger') as any)
    .update(patch)
    .eq('id', ledgerId)
  if (error) throw new Error(`publication ledger provider attempt mark failed: ${error.message}`)
}

export async function markPublicationUnknownExternalOutcome(
  db: SupabaseClient,
  ledgerId: string | undefined,
  errorState: string,
  externalPublicationId?: string | null,
) {
  if (!ledgerId) return
  const { error } = await (db.from('media_publication_ledger') as any)
    .update({
      state: 'unknown_external_outcome',
      external_publication_id: externalPublicationId ?? undefined,
      error_state: errorState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ledgerId)
  if (error) throw new Error(`publication ledger unknown-outcome mark failed: ${error.message}`)
}

export async function markPublicationFailed(
  db: SupabaseClient,
  ledgerId: string | undefined,
  errorState: string,
) {
  if (!ledgerId) return
  const { error } = await (db.from('media_publication_ledger') as any)
    .update({
      state: 'retryable_failed',
      error_state: errorState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ledgerId)
  if (error) throw new Error(`publication ledger failure mark failed: ${error.message}`)
}