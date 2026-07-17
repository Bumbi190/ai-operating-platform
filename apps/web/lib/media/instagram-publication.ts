import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import {
  createReelContainer,
  pollUntilReady,
  publishContainer,
  type PublishResult,
} from '@/lib/media/instagram'
import {
  claimPublicationChannel,
  markPublicationFailed,
  markPublicationProviderAttempt,
  markPublicationPublished,
  markPublicationUnknownExternalOutcome,
  type PublicationLedgerClaim,
} from '@/lib/media/publication-ledger'

type ProgressStep = 'uploading' | 'processing' | 'publishing'

export type InstagramPublicationResult =
  | { status: 'published'; ledgerId: string; result: PublishResult; claim: PublicationLedgerClaim }
  | { status: 'already_published'; ledgerId: string; result: PublishResult; claim: PublicationLedgerClaim }
  | { status: 'not_claimed'; claim: PublicationLedgerClaim }
  | { status: 'reconciliation_required'; ledgerId: string; reason: string; claim: PublicationLedgerClaim }

export async function publishInstagramWithLedger(
  db: SupabaseClient,
  input: {
    projectId: string
    newsItemId?: string | null
    scriptId: string
    mediaAssetId: string
    caption: string
    existingContainerId?: string | null
    scheduledTime?: string | null
    pollTimeoutMs?: number
    persistContainerId?: (containerId: string) => Promise<void>
    onProgress?: (step: ProgressStep, pct: number) => void
  },
): Promise<InstagramPublicationResult> {
  const claim = await claimPublicationChannel(db, {
    projectId: input.projectId,
    newsItemId: input.newsItemId ?? null,
    scriptId: input.scriptId,
    mediaAssetId: input.mediaAssetId,
    channel: 'instagram',
    scheduledTime: input.scheduledTime ?? null,
  })

  if (claim.status === 'already_published') {
    return {
      status: 'already_published',
      ledgerId: claim.ledgerId,
      claim,
      result: { mediaId: claim.externalPublicationId ?? 'already-published' },
    }
  }

  if (claim.status === 'reconciliation_required' || claim.status === 'unknown_external_outcome') {
    if (claim.externalPublicationId) {
      await markPublicationPublished(db, claim.ledgerId, claim.externalPublicationId)
      return {
        status: 'already_published',
        ledgerId: claim.ledgerId,
        claim,
        result: { mediaId: claim.externalPublicationId },
      }
    }
    return {
      status: 'reconciliation_required',
      ledgerId: claim.ledgerId,
      claim,
      reason: 'Instagram external outcome must be reconciled before retry',
    }
  }

  if (claim.status !== 'claimed' && claim.status !== 'retry_claimed' && claim.status !== 'stale_claim_recovered') {
    return { status: 'not_claimed', claim }
  }

  const ledgerId = claim.ledgerId
  let creationId = claim.providerContainerId ?? input.existingContainerId ?? null
  let mediaId: string | null = null

  if (creationId) {
    await markPublicationProviderAttempt(db, ledgerId, {
      providerAttemptId: claim.providerAttemptId ?? creationId,
      providerContainerId: creationId,
    })
  } else {
    const providerAttemptId = randomUUID()
    await markPublicationProviderAttempt(db, ledgerId, { providerAttemptId })

    input.onProgress?.('uploading', 10)
    try {
      creationId = await createReelContainer(input.mediaAssetId, input.caption)
    } catch (error) {
      await markPublicationUnknownExternalOutcome(
        db,
        ledgerId,
        `Instagram container creation outcome unknown: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }

    try {
      await markPublicationProviderAttempt(db, ledgerId, {
        providerAttemptId,
        providerContainerId: creationId,
      })
    } catch (error) {
      await markPublicationUnknownExternalOutcome(
        db,
        ledgerId,
        `Could not persist Instagram container id after provider interaction: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }

    if (input.persistContainerId) {
      try {
        await input.persistContainerId(creationId)
      } catch (error) {
        await markPublicationUnknownExternalOutcome(
          db,
          ledgerId,
          `Could not persist Instagram script container id after provider interaction: ${error instanceof Error ? error.message : String(error)}`,
        )
        throw error
      }
    }
  }

  try {
    input.onProgress?.('processing', 45)
    await pollUntilReady(creationId, input.pollTimeoutMs)
  } catch (error) {
    await markPublicationFailed(db, ledgerId, error instanceof Error ? error.message : String(error))
    throw error
  }

  let result: PublishResult
  try {
    input.onProgress?.('publishing', 90)
    result = await publishContainer(creationId)
    mediaId = result.mediaId
  } catch (error) {
    await markPublicationUnknownExternalOutcome(
      db,
      ledgerId,
      `Instagram publish outcome unknown: ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }

  try {
    await markPublicationPublished(db, ledgerId, result.mediaId)
  } catch (error) {
    await markPublicationUnknownExternalOutcome(
      db,
      ledgerId,
      error instanceof Error ? error.message : String(error),
      mediaId,
    )
    throw error
  }

  input.onProgress?.('publishing', 100)
  return { status: 'published', ledgerId, claim, result }
}