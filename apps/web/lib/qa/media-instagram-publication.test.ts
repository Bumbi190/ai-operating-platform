import { describe, expect, it, vi, beforeEach } from 'vitest'
import { publishInstagramWithLedger } from '@/lib/media/instagram-publication'

const instagram = vi.hoisted(() => ({
  createReelContainer: vi.fn(),
  pollUntilReady: vi.fn(),
  publishContainer: vi.fn(),
}))

vi.mock('@/lib/media/instagram', () => ({
  createReelContainer: instagram.createReelContainer,
  pollUntilReady: instagram.pollUntilReady,
  publishContainer: instagram.publishContainer,
}))

function makeDb(claimRows: Record<string, unknown>[]) {
  const updates: Array<{ table: string; id: string; patch: Record<string, unknown> }> = []
  const calls: string[] = []
  return {
    updates,
    calls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}:${args.p_channel}`)
      return { data: claimRows.shift(), error: null }
    },
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_field: string, id: string) => {
          calls.push(`update:${table}:${Object.keys(patch).sort().join(',')}`)
          updates.push({ table, id, patch })
          return { data: null, error: null }
        },
      }),
    }),
  } as any
}

describe('ledger-controlled Instagram publication', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    instagram.createReelContainer.mockResolvedValue('container-1')
    instagram.pollUntilReady.mockResolvedValue(undefined)
    instagram.publishContainer.mockResolvedValue({ mediaId: 'media-1', permalink: 'https://instagram.example/p/media-1' })
  })

  it('claims the ledger before creating an Instagram container', async () => {
    const db = makeDb([{ status: 'claimed', ledger_id: 'ledger-1' }])

    const result = await publishInstagramWithLedger(db, {
      projectId: 'project-1',
      newsItemId: 'news-1',
      scriptId: 'script-1',
      mediaAssetId: 'https://cdn.example/video.mp4',
      caption: 'caption',
    })

    expect(result.status).toBe('published')
    expect(db.calls[0]).toBe('rpc:claim_media_publication:instagram')
    expect(db.calls).toEqual(expect.arrayContaining([
      expect.stringContaining('provider_attempt_id'),
      expect.stringContaining('provider_container_id'),
      expect.stringContaining('state'),
    ]))
    expect(instagram.createReelContainer).toHaveBeenCalledOnce()
  })

  it('persists the provider container in the ledger before polling and publishing', async () => {
    const db = makeDb([{ status: 'claimed', ledger_id: 'ledger-1' }])

    await publishInstagramWithLedger(db, {
      projectId: 'project-1',
      scriptId: 'script-1',
      mediaAssetId: 'https://cdn.example/video.mp4',
      caption: 'caption',
    })

    expect(db.updates.find(update => update.patch.provider_attempt_id && !update.patch.provider_container_id)).toBeTruthy()
    expect(db.updates.find(update => update.patch.provider_container_id === 'container-1')).toBeTruthy()
    expect(instagram.pollUntilReady).toHaveBeenCalledWith('container-1', undefined)
    expect(instagram.publishContainer).toHaveBeenCalledWith('container-1')
  })

  it('marks unknown external outcome when a local write fails after provider interaction', async () => {
    const db = makeDb([{ status: 'claimed', ledger_id: 'ledger-1' }])

    await expect(publishInstagramWithLedger(db, {
      projectId: 'project-1',
      scriptId: 'script-1',
      mediaAssetId: 'https://cdn.example/video.mp4',
      caption: 'caption',
      persistContainerId: async () => { throw new Error('script update down') },
    })).rejects.toThrow(/script update down/)

    expect(db.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ patch: expect.objectContaining({ provider_container_id: 'container-1' }) }),
      expect.objectContaining({ patch: expect.objectContaining({ state: 'unknown_external_outcome' }) }),
    ]))
    expect(instagram.publishContainer).not.toHaveBeenCalled()
  })

  it('does not create another provider attempt while reconciliation is required', async () => {
    const db = makeDb([{
      status: 'reconciliation_required',
      ledger_id: 'ledger-1',
      external_publication_id: 'media-1',
    }])

    const result = await publishInstagramWithLedger(db, {
      projectId: 'project-1',
      scriptId: 'script-1',
      mediaAssetId: 'https://cdn.example/video.mp4',
      caption: 'caption',
    })

    expect(result.status).toBe('already_published')
    expect(instagram.createReelContainer).not.toHaveBeenCalled()
    expect(db.updates[0]).toMatchObject({ patch: { state: 'published', external_publication_id: 'media-1' } })
  })
})