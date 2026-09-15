/**
 * lib/media/token-store.ts — the storage underneath the project-scoped credential
 * relation (2026-09-14).
 *
 * Every read and write names a project UUID and a platform; there is no default
 * project, no slug lookup, no environment fallback and no read across projects. A store
 * records the account the provider attested, under the credential type the database
 * pins for the platform. Failures come back as { ok: false } — never a throw, never a
 * database message, which can quote the row being written.
 *
 * Callers are pinned elsewhere: storeCredential is used only by /api/media/token, the
 * YouTube connection callback and the refresh cron, readStoredCredential only by the resolver and the refresh cron
 * (media-token-authority.test.ts), and every consumer goes through the resolver
 * (social-credentials.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROMPT = '33333333-3333-4333-8333-333333333333'
const PAGE = '1138612202672850'
const TOKEN = `EAAP${'p'.repeat(60)}`
const CHANNEL = 'UCUM9JDi75ziLssYcGLo8IPA'
const REFRESH = `1//${'r'.repeat(60)}`

let OPS: unknown[][] = []
let RESULT: { data: unknown; error: unknown } = { data: null, error: null }
let CLIENT_THROWS = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (CLIENT_THROWS) throw new Error(`connection refused ${TOKEN}`)
    const q: any = {
      select: (columns: string) => { OPS.push(['select', columns]); return q },
      eq: (column: string, value: unknown) => { OPS.push(['eq', column, value]); return q },
      maybeSingle: async () => RESULT,
      upsert: async (row: unknown, options: unknown) => {
        OPS.push(['upsert', row, options])
        return { error: RESULT.error }
      },
    }
    return { from: (table: string) => { OPS.push(['from', table]); return q } }
  },
}))

import { readStoredCredential, storeCredential, STORED_TOKEN_TYPE } from '@/lib/media/token-store'

beforeEach(() => {
  OPS = []
  RESULT = { data: null, error: null }
  CLIENT_THROWS = false
})

describe('token store · reads name the project, the platform and its credential type', () => {
  it('reads exactly the named project’s credential of the platform’s pinned type', async () => {
    RESULT = { data: { access_token: TOKEN, account_id: PAGE, expires_at: null, refreshed_at: '2026-06-05T08:51:09.423Z' }, error: null }
    expect(await readStoredCredential(PROMPT, 'facebook')).toEqual({
      ok: true,
      credential: { accessToken: TOKEN, accountId: PAGE, expiresAt: null, refreshedAt: new Date('2026-06-05T08:51:09.423Z') },
    })
    expect(OPS).toEqual([
      ['from', 'platform_tokens'],
      ['select', 'access_token, account_id, expires_at, refreshed_at'],
      ['eq', 'project_id', PROMPT],
      ['eq', 'platform', 'facebook'],
      ['eq', 'token_type', 'page'],
    ])
  })

  it('no project id, a slug, or a platform it does not store reads nothing at all', async () => {
    for (const [projectId, platform] of [
      [undefined, 'instagram'], ['', 'instagram'], ['ai-media-automation', 'instagram'], [PROMPT.replace(/-/g, ''), 'facebook'], [PROMPT, 'tiktok'],
    ] as [string, 'instagram'][]) {
      expect(await readStoredCredential(projectId, platform), `${projectId} ${platform}`).toEqual({ ok: false })
    }
    expect(OPS).toEqual([])
  })

  it('no row is no credential; an unreadable read is unreadable — never “missing” — and never a throw', async () => {
    expect(await readStoredCredential(PROMPT, 'instagram')).toEqual({ ok: true, credential: null })
    RESULT = { data: { access_token: '', account_id: null, expires_at: null, refreshed_at: null }, error: null }
    expect(await readStoredCredential(PROMPT, 'instagram')).toEqual({ ok: true, credential: null })
    RESULT = { data: null, error: { code: '42501', message: `permission denied near ${TOKEN}` } }
    expect(await readStoredCredential(PROMPT, 'instagram')).toEqual({ ok: false })
    CLIENT_THROWS = true
    expect(await readStoredCredential(PROMPT, 'instagram')).toEqual({ ok: false })
  })

  it('a recorded account that is not a bounded provider id is not trusted as one', async () => {
    RESULT = { data: { access_token: TOKEN, account_id: 'not an id', expires_at: 'not a date', refreshed_at: null }, error: null }
    expect(await readStoredCredential(PROMPT, 'instagram')).toEqual({
      ok: true, credential: { accessToken: TOKEN, accountId: null, expiresAt: null, refreshedAt: null },
    })
  })

  it('a YouTube connection is read as the project’s own refresh grant, under its pinned type', async () => {
    RESULT = { data: { access_token: REFRESH, account_id: CHANNEL, expires_at: null, refreshed_at: '2026-09-15T18:30:00.000Z' }, error: null }
    expect(await readStoredCredential(PROMPT, 'youtube')).toEqual({
      ok: true,
      credential: { accessToken: REFRESH, accountId: CHANNEL, expiresAt: null, refreshedAt: new Date('2026-09-15T18:30:00.000Z') },
    })
    expect(OPS).toEqual([
      ['from', 'platform_tokens'],
      ['select', 'access_token, account_id, expires_at, refreshed_at'],
      ['eq', 'project_id', PROMPT],
      ['eq', 'platform', 'youtube'],
      ['eq', 'token_type', 'oauth_refresh'],
    ])
  })
})

describe('token store · a store is one project’s credential for its attested account', () => {
  it('writes one row for the named project, under the platform’s pinned type, with the attested account', async () => {
    const expiresAt = new Date('2026-11-13T06:00:06.627Z')
    expect(await storeCredential(PROMPT, 'instagram', { accessToken: TOKEN, accountId: '17841437027967629', expiresAt })).toEqual({ ok: true })
    expect(OPS).toEqual([
      ['from', 'platform_tokens'],
      ['upsert', {
        project_id: PROMPT, platform: 'instagram', token_type: 'user', access_token: TOKEN, account_id: '17841437027967629',
        expires_at: '2026-11-13T06:00:06.627Z', refreshed_at: expect.stringMatching(/Z$/),
      }, { onConflict: 'project_id,platform,token_type' }],
    ])
  })

  it('a YouTube connection is stored as the project’s refresh grant for its confirmed channel, with no expiry', async () => {
    expect(await storeCredential(PROMPT, 'youtube', { accessToken: REFRESH, accountId: CHANNEL, expiresAt: null })).toEqual({ ok: true })
    expect(OPS).toEqual([
      ['from', 'platform_tokens'],
      ['upsert', {
        project_id: PROMPT, platform: 'youtube', token_type: 'oauth_refresh', access_token: REFRESH, account_id: CHANNEL,
        expires_at: null, refreshed_at: expect.stringMatching(/Z$/),
      }, { onConflict: 'project_id,platform,token_type' }],
    ])
  })

  it('without a project, for another platform, without an attested account, without a credential — or a YouTube grant with an expiry — nothing is written', async () => {
    const good = { accessToken: TOKEN, accountId: PAGE, expiresAt: null }
    const cases: [string, string, { accessToken: string; accountId: string; expiresAt: Date | null }][] = [
      ['', 'facebook', good],
      ['ai-media-automation', 'facebook', good],
      [PROMPT, 'tiktok', good],
      [PROMPT, 'youtube', { ...good, accountId: CHANNEL, expiresAt: new Date('2026-12-01T00:00:00.000Z') }],
      [PROMPT, 'facebook', { ...good, accountId: '' }],
      [PROMPT, 'facebook', { ...good, accountId: 'not an id' }],
      [PROMPT, 'facebook', { ...good, accessToken: '' }],
    ]
    for (const [projectId, platform, input] of cases) {
      expect(await storeCredential(projectId, platform as 'facebook', input), `${projectId} ${platform} ${JSON.stringify({ ...input, accessToken: input.accessToken ? 'set' : '' })}`)
        .toEqual({ ok: false })
    }
    expect(OPS).toEqual([])
  })

  it('a failed or impossible write is exactly { ok: false } — no message, no throw', async () => {
    RESULT = { data: null, error: { code: '23502', message: `null value in column "project_id" … ${TOKEN}` } }
    expect(await storeCredential(PROMPT, 'facebook', { accessToken: TOKEN, accountId: PAGE, expiresAt: null })).toEqual({ ok: false })
    CLIENT_THROWS = true
    expect(await storeCredential(PROMPT, 'facebook', { accessToken: TOKEN, accountId: PAGE, expiresAt: null })).toEqual({ ok: false })
  })

  it('the credential type per platform is the one the database pins', () => {
    expect(STORED_TOKEN_TYPE).toEqual({ instagram: 'user', facebook: 'page', youtube: 'oauth_refresh' })
  })
})
