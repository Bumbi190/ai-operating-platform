import { describe, expect, it } from 'vitest'
import {
  claimPublicationChannel,
  markPublicationFailed,
  markPublicationProviderAttempt,
  markPublicationPublished,
  markPublicationUnknownExternalOutcome,
  type PublicationChannel,
} from '@/lib/media/publication-ledger'

function makeLedgerDb(claimRows: Record<string, unknown>[]) {
  const updates: Array<{ table: string; id: string; patch: Record<string, unknown> }> = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

  return {
    updates,
    rpcCalls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return { data: claimRows.shift(), error: null }
    },
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_field: string, id: string) => {
          updates.push({ table, id, patch })
          return { data: null, error: null }
        },
      }),
    }),
  } as any
}

async function claim(db: any, channel: PublicationChannel) {
  return claimPublicationChannel(db, {
    projectId: 'project-1',
    newsItemId: 'news-1',
    scriptId: 'script-1',
    mediaAssetId: 'https://cdn.example/video.mp4',
    channel,
  })
}

describe('media publication ledger', () => {
  it('12. records YouTube successful, Instagram failed, Facebook successful independently', async () => {
    const db = makeLedgerDb([
      { status: 'claimed', ledger_id: 'yt-ledger' },
      { status: 'claimed', ledger_id: 'ig-ledger' },
      { status: 'claimed', ledger_id: 'fb-ledger' },
    ])

    const yt = await claim(db, 'youtube')
    const ig = await claim(db, 'instagram')
    const fb = await claim(db, 'facebook')

    await markPublicationPublished(db, yt.ledgerId, 'yt-1')
    await markPublicationFailed(db, ig.ledgerId, 'container timeout')
    await markPublicationPublished(db, fb.ledgerId, 'fb-1')

    expect(db.rpcCalls.map((call: any) => call.args.p_channel)).toEqual(['youtube', 'instagram', 'facebook'])
    expect(db.updates).toMatchObject([
      { id: 'yt-ledger', patch: { state: 'published', external_publication_id: 'yt-1' } },
      { id: 'ig-ledger', patch: { state: 'retryable_failed', error_state: 'container timeout' } },
      { id: 'fb-ledger', patch: { state: 'published', external_publication_id: 'fb-1' } },
    ])
  })

  it('13. Instagram retry does not republish YouTube or Facebook', async () => {
    const db = makeLedgerDb([
      { status: 'already_published', ledger_id: 'yt-ledger', external_publication_id: 'yt-1' },
      { status: 'already_published', ledger_id: 'fb-ledger', external_publication_id: 'fb-1' },
      { status: 'retry_claimed', ledger_id: 'ig-ledger' },
    ])

    await expect(claim(db, 'youtube')).resolves.toMatchObject({ status: 'already_published', ledgerId: 'yt-ledger' })
    await expect(claim(db, 'facebook')).resolves.toMatchObject({ status: 'already_published', ledgerId: 'fb-ledger' })
    await expect(claim(db, 'instagram')).resolves.toMatchObject({ status: 'retry_claimed', ledgerId: 'ig-ledger' })
  })

  it('14. publishing is not confused with published', async () => {
    const db = makeLedgerDb([{ status: 'in_progress', ledger_id: 'ig-ledger' }])
    await expect(claim(db, 'instagram')).resolves.toMatchObject({ status: 'in_progress', ledgerId: 'ig-ledger' })
  })

  it('15. provider attempt ids and unknown external outcomes are distinct from retryable failures', async () => {
    const db = makeLedgerDb([{ status: 'claimed', ledger_id: 'ig-ledger' }])
    const ig = await claim(db, 'instagram')

    await markPublicationProviderAttempt(db, ig.ledgerId, { providerContainerId: 'container-1', providerAttemptId: 'container-1' })
    await markPublicationUnknownExternalOutcome(db, ig.ledgerId, 'ledger update failed after provider success', 'media-1')

    expect(db.updates).toMatchObject([
      { id: 'ig-ledger', patch: { provider_container_id: 'container-1', provider_attempt_id: 'container-1' } },
      { id: 'ig-ledger', patch: { state: 'unknown_external_outcome', external_publication_id: 'media-1' } },
    ])
  })

  it('16. reconciliation-required claims do not permit another provider publish', async () => {
    const db = makeLedgerDb([{ status: 'reconciliation_required', ledger_id: 'ig-ledger', reason: 'external outcome must be reconciled' }])
    await expect(claim(db, 'instagram')).resolves.toMatchObject({ status: 'reconciliation_required', ledgerId: 'ig-ledger' })
  })
})