/**
 * Behavioral tests for the fail-closed provider-side-effect boundary in
 * GET /api/media/cron/youtube.
 *
 * The publication-ledger module is REAL — only the Supabase client, the
 * YouTube provider module, and side-channel helpers (alert/run-log/eligibility)
 * are mocked. The fake Supabase client keeps an in-memory publication ledger
 * whose `claim_media_publication` RPC follows the state contract of
 * supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql
 * (claimed / already_published / in_progress / retry_claimed /
 * reconciliation_required, including the retryable_failed + provider-attempt
 * defense-in-depth branch). Real PostgreSQL semantics of the RPC itself are
 * verified separately against an isolated PostgreSQL instance
 * (supabase/tests/claim_media_publication_guard.test.sql).
 *
 * Proven behaviors:
 *  - a failure strictly before the resumable session is registered stays retryable
 *  - a failure while persisting the session (before the upload body) stays retryable
 *  - a failure after the session is durably persisted but before a video id is
 *    observed becomes unknown_external_outcome (fail closed)
 *  - a lost/malformed success response cannot produce a second upload
 *  - a second cron invocation after an ambiguous failure never calls the provider
 *  - channel independence: a reconciliation-required YouTube attempt does not
 *    block an Instagram claim for the same media asset
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { claimPublicationChannel } from '@/lib/media/publication-ledger'

const youtube = vi.hoisted(() => ({
  isYouTubeConfigured: vi.fn(() => true),
  uploadShort: vi.fn(),
  buildYouTubeMeta: vi.fn(() => ({ title: 'title', description: 'desc', tags: [] as string[] })),
}))

const adminDb = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/lib/media/youtube', () => ({
  isYouTubeConfigured: youtube.isYouTubeConfigured,
  uploadShort: youtube.uploadShort,
  buildYouTubeMeta: youtube.buildYouTubeMeta,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminDb.current,
}))
vi.mock('@/lib/media/alert', () => ({
  sendPipelineAlert: vi.fn(async () => undefined),
}))
vi.mock('@/lib/media/run-log', () => ({
  logRun: vi.fn(async () => undefined),
}))
vi.mock('@/lib/media/eligibility', () => ({
  assertMediaProductionEligible: vi.fn(async () => undefined),
}))

import { GET } from '@/app/api/media/cron/youtube/route'

type LedgerRow = {
  id: string
  channel: string
  state: string
  provider_attempt_id: string | null
  provider_container_id: string | null
  provider_upload_url: string | null
  external_publication_id: string | null
  error_state: string | null
  retry_count: number
}

const SCRIPT = {
  id: 'script-1',
  project_id: 'project-1',
  hook: 'Hook',
  cta: 'CTA',
  hashtags: ['#ai'],
  video_url: 'https://cdn.example/video.mp4',
  youtube_video_id: null,
  media_news_items: [{ id: 'news-1', url: 'https://source.example/a', source_name: 'Source' }],
}

function makeFakeDb() {
  const ledgerByKey = new Map<string, LedgerRow>()
  const ledgerById = new Map<string, LedgerRow>()
  const scriptUpdates: Array<Record<string, unknown>> = []
  let seq = 0
  const state = {
    ledgerByKey,
    ledgerById,
    scriptUpdates,
    failNextLedgerUpdate: null as string | null,
  }

  function claimRow(row: LedgerRow, status: string, reason: string | null = null) {
    return {
      status,
      ledger_id: row.id,
      external_publication_id: row.external_publication_id,
      provider_attempt_id: row.provider_attempt_id,
      provider_container_id: row.provider_container_id,
      provider_upload_url: row.provider_upload_url,
      reason,
    }
  }

  // Mirrors the state contract of public.claim_media_publication in
  // 20260707190359_media_semantic_duplicate_guard.sql.
  async function rpc(name: string, args: Record<string, unknown>) {
    if (name !== 'claim_media_publication') {
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    }
    const key = String(args.p_idempotency_key)
    let row = ledgerByKey.get(key)
    if (!row) {
      row = {
        id: `ledger-${++seq}`,
        channel: String(args.p_channel),
        state: 'publishing',
        provider_attempt_id: null,
        provider_container_id: null,
        provider_upload_url: null,
        external_publication_id: null,
        error_state: null,
        retry_count: 0,
      }
      ledgerByKey.set(key, row)
      ledgerById.set(row.id, row)
      return { data: [claimRow(row, 'claimed')], error: null }
    }
    if (row.state === 'published') {
      return { data: [claimRow(row, 'already_published')], error: null }
    }
    if (row.state === 'unknown_external_outcome' || row.state === 'reconciliation_required') {
      row.state = 'reconciliation_required'
      return { data: [claimRow(row, 'reconciliation_required', 'external outcome must be reconciled before retry')], error: null }
    }
    if (row.state === 'retryable_failed') {
      // Defense-in-depth branch: persisted upload-session evidence without an
      // external id is never an actionable retry.
      if (row.provider_attempt_id !== null && row.provider_container_id === null && row.external_publication_id === null) {
        row.state = 'reconciliation_required'
        return { data: [claimRow(row, 'reconciliation_required', 'provider upload-session evidence exists without an external id; reconcile before retry')], error: null }
      }
      row.state = 'publishing'
      row.retry_count += 1
      return { data: [claimRow(row, 'retry_claimed')], error: null }
    }
    return { data: [claimRow(row, 'in_progress')], error: null }
  }

  function scriptsQueryBuilder() {
    const builder: any = {}
    for (const m of ['select', 'not', 'is', 'eq', 'gte', 'order', 'limit']) {
      builder[m] = () => builder
    }
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: [SCRIPT], error: null })
    return builder
  }

  const db = {
    rpc,
    from: (table: string) => {
      if (table === 'media_publication_ledger') {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async (_field: string, id: string) => {
              if (state.failNextLedgerUpdate) {
                const message = state.failNextLedgerUpdate
                state.failNextLedgerUpdate = null
                return { data: null, error: { message } }
              }
              const row = ledgerById.get(id)
              if (row) {
                for (const [k, v] of Object.entries(patch)) {
                  if (k in row && v !== undefined) (row as unknown as Record<string, unknown>)[k] = v
                }
              }
              return { data: null, error: null }
            },
          }),
        }
      }
      if (table === 'media_scripts') {
        const maybeUpdate = {
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              scriptUpdates.push(patch)
              return { data: null, error: null }
            },
          }),
          ...scriptsQueryBuilder(),
        }
        return maybeUpdate
      }
      throw new Error(`unexpected table ${table}`)
    },
  }

  return { db: db as any, state }
}

function cronRequest() {
  return new Request('http://localhost/api/media/cron/youtube?scriptId=script-1', {
    headers: { authorization: 'Bearer test-cron-secret' },
  })
}

function singleLedgerRow(state: ReturnType<typeof makeFakeDb>['state']) {
  const rows = [...state.ledgerById.values()].filter(r => r.channel === 'youtube')
  expect(rows).toHaveLength(1)
  return rows[0]
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  youtube.isYouTubeConfigured.mockReturnValue(true)
  youtube.uploadShort.mockReset()
  youtube.buildYouTubeMeta.mockReturnValue({ title: 'title', description: 'desc', tags: [] })
})

describe('YouTube upload fail-closed provider-side-effect boundary', () => {
  it('1. a failure strictly before the resumable session is registered stays retryable', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    // Token refresh / video fetch / session init / missing Location header all
    // throw before onUploadSession is ever invoked.
    youtube.uploadShort.mockRejectedValue(new Error('YouTube init misslyckades (503)'))

    const res = await GET(cronRequest())
    expect(res.status).toBe(500)

    const row = singleLedgerRow(state)
    expect(row.state).toBe('retryable_failed')
    expect(row.provider_attempt_id).toBeNull()
    expect(row.external_publication_id).toBeNull()
  })

  it('2. a failure persisting the upload session before the upload body begins stays retryable', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    state.failNextLedgerUpdate = 'ledger write refused'
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      // uploadShort awaits session persistence BEFORE sending any upload bytes;
      // if persistence fails the provider upload never begins.
      await opts.onUploadSession?.('https://upload.youtube.example/session-1')
      throw new Error('unreachable: upload must not start when session persistence failed')
    })

    const res = await GET(cronRequest())
    expect(res.status).toBe(500)

    const row = singleLedgerRow(state)
    expect(row.state).toBe('retryable_failed')
    expect(row.provider_attempt_id).toBeNull()
  })

  it('3. a failure after the session is durably persisted but before a video id becomes unknown_external_outcome', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      await opts.onUploadSession?.('https://upload.youtube.example/session-1')
      // Connection reset / timeout / truncated body / JSON parse failure after
      // the upload body was sent — no video id was observed.
      throw new Error('socket hang up')
    })

    const res = await GET(cronRequest())
    expect(res.status).toBe(500)

    const row = singleLedgerRow(state)
    expect(row.state).toBe('unknown_external_outcome')
    expect(row.provider_attempt_id).toBe('https://upload.youtube.example/session-1')
    expect(row.provider_upload_url).toBe('https://upload.youtube.example/session-1')
    expect(row.external_publication_id).toBeNull()
    expect(row.error_state).toMatch(/fail closed/)
  })

  it('4. a second cron invocation after an ambiguous failure does not call the YouTube provider again', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      await opts.onUploadSession?.('https://upload.youtube.example/session-1')
      throw new Error('response timeout')
    })

    await GET(cronRequest())
    expect(youtube.uploadShort).toHaveBeenCalledTimes(1)
    expect(singleLedgerRow(state).state).toBe('unknown_external_outcome')

    const res2 = await GET(cronRequest())
    const body2 = await res2.json()

    expect(youtube.uploadShort).toHaveBeenCalledTimes(1) // provider NOT called again
    expect(singleLedgerRow(state).state).toBe('reconciliation_required')
    expect(JSON.stringify(body2)).toContain('not_claimed:reconciliation_required')
  })

  it('5. a lost or malformed success response after upload cannot produce a second upload', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    // YouTube processed the upload and returned 200, but the body was truncated:
    // uploadShort throws after the upload body was sent, with no video id.
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      await opts.onUploadSession?.('https://upload.youtube.example/session-1')
      throw new Error('Unexpected end of JSON input')
    })

    await GET(cronRequest())
    await GET(cronRequest())
    await GET(cronRequest())

    expect(youtube.uploadShort).toHaveBeenCalledTimes(1)
    const row = singleLedgerRow(state)
    expect(row.state).toBe('reconciliation_required')
    expect(row.external_publication_id).toBeNull()
    // No second youtube upload was recorded on the script either.
    expect(state.scriptUpdates.filter(u => 'youtube_video_id' in u)).toHaveLength(0)
  })

  it('6. a known external video id still uses the id-preserving reconciliation path', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    state.failNextLedgerUpdate = null
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      await opts.onUploadSession?.('https://upload.youtube.example/session-1')
      return { videoId: 'vid-1', url: 'https://www.youtube.com/shorts/vid-1' }
    })
    // markPublicationPublished fails after the video id is known.
    const origFrom = db.from.bind(db)
    let publishedMarkAttempted = false
    db.from = (table: string) => {
      const t = origFrom(table)
      if (table !== 'media_publication_ledger') return t
      return {
        update: (patch: Record<string, unknown>) => {
          if (patch.state === 'published') {
            publishedMarkAttempted = true
            return { eq: async () => ({ data: null, error: { message: 'ledger publish write down' } }) }
          }
          return t.update(patch)
        },
      }
    }

    const res = await GET(cronRequest())
    expect(res.status).toBe(500)
    expect(publishedMarkAttempted).toBe(true)

    const row = singleLedgerRow(state)
    expect(row.state).toBe('unknown_external_outcome')
    expect(row.external_publication_id).toBe('vid-1')
  })

  it('7. a genuinely pre-provider retryable failure is reclaimable and can then succeed', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    youtube.uploadShort.mockRejectedValueOnce(new Error('Kunde inte hämta video (502)'))
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      await opts.onUploadSession?.('https://upload.youtube.example/session-2')
      return { videoId: 'vid-2', url: 'https://www.youtube.com/shorts/vid-2' }
    })

    await GET(cronRequest())
    expect(singleLedgerRow(state).state).toBe('retryable_failed')

    const res2 = await GET(cronRequest())
    const body2 = await res2.json()

    expect(youtube.uploadShort).toHaveBeenCalledTimes(2) // retry allowed
    expect(res2.status).toBe(200)
    expect(body2.status).toBe('uploaded')
    const row = singleLedgerRow(state)
    expect(row.state).toBe('published')
    expect(row.external_publication_id).toBe('vid-2')
  })

  it('8. a reconciliation-required YouTube attempt does not block Instagram or Facebook claims for the same asset', async () => {
    const { db, state } = makeFakeDb()
    adminDb.current = db
    youtube.uploadShort.mockImplementation(async (opts: { onUploadSession?: (u: string) => Promise<void> | void }) => {
      await opts.onUploadSession?.('https://upload.youtube.example/session-1')
      throw new Error('connection reset')
    })

    await GET(cronRequest())
    expect(singleLedgerRow(state).state).toBe('unknown_external_outcome')

    // Claims for other channels on the SAME media asset are independent rows.
    const ig = await claimPublicationChannel(db, {
      projectId: SCRIPT.project_id,
      newsItemId: 'news-1',
      scriptId: SCRIPT.id,
      mediaAssetId: SCRIPT.video_url,
      channel: 'instagram',
    })
    const fb = await claimPublicationChannel(db, {
      projectId: SCRIPT.project_id,
      newsItemId: 'news-1',
      scriptId: SCRIPT.id,
      mediaAssetId: SCRIPT.video_url,
      channel: 'facebook',
    })

    expect(ig.status).toBe('claimed')
    expect(fb.status).toBe('claimed')
  })
})
