import { afterEach, describe, expect, it, vi } from 'vitest'

const adminFactory = vi.hoisted(() => vi.fn(() => { throw new Error('implicit admin factory forbidden') }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: adminFactory }))
import { readGrowthDashboardAdmission } from '../content-growth/growth-dashboard-admission'

const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const PROJECT = '00000000-0000-4000-8000-000000000003'
const BINDING = '00000000-0000-4000-8000-000000000004'
const ACCOUNT = 'synthetic_account'
const projectRow = { id: PROJECT, owner_id: USER, slug: 'ai-media-automation' }
const bindingRow = {
  binding_id: BINDING, project_id: PROJECT, platform: 'instagram', external_account_id: ACCOUNT,
  account_label: 'synthetic label', credential_source: 'project_store', verification: 'provider_attested',
  verified_at: '2026-01-01T00:00:00Z', bound_at: '2026-01-01T00:00:00Z', bound_by: 'synthetic',
  blocked_at: null, blocked_reason: null,
}
type Options = {
  user?: { id: string } | null
  authError?: boolean
  authThrows?: boolean
  allowed?: { id: string }[] | null
  allowedThrows?: boolean
  project?: Record<string, unknown> | null
  projectError?: boolean
  binding?: Record<string, unknown> | null
  bindingError?: boolean
  metadataThrows?: boolean
  metadataNull?: boolean
}
function fixture(o: Options = {}) {
  const calls: unknown[][] = []
  const network = vi.fn(() => { throw new Error('network forbidden') })
  vi.stubGlobal('fetch', network)
  const request = {
    auth: {
      getUser: vi.fn(async () => {
        calls.push(['auth'])
        if (o.authThrows) throw Error('private failure')
        return { data: { user: o.user === undefined ? { id: USER } : o.user }, error: o.authError ? { message: 'private auth failure' } : null }
      }),
    },
    from(table: string) {
      expect(table).toBe('projects')
      const filters: unknown[][] = []
      const q = {
        select(columns: string) { calls.push(['request', table, columns]); return q },
        eq(key: string, value: string) { filters.push([key, value]); calls.push(['request-filter', key, value]); return q },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          expect(filters).toEqual([['owner_id', USER]])
          if (o.allowedThrows) return Promise.reject(Error('private failure')).then(resolve, reject)
          return Promise.resolve({ data: o.allowed === undefined ? [{ id: PROJECT }] : o.allowed, error: null }).then(resolve, reject)
        },
        async maybeSingle() {
          expect(filters).toEqual([['id', PROJECT], ['owner_id', USER]])
          return { data: o.project === undefined ? projectRow : o.project, error: o.projectError ? { message: 'private database failure' } : null }
        },
      }
      return q
    },
  }
  const metadata = vi.fn(() => {
    calls.push(['metadata-factory'])
    if (o.metadataThrows) throw Error('private failure')
    if (o.metadataNull) return null
    return {
      from(table: string) {
        expect(table).toBe('social_account_bindings')
        const filters: unknown[][] = []
        const q = {
          select(columns: string) {
            expect(columns).not.toMatch(/token|secret|\*/)
            calls.push(['metadata', table, columns])
            return q
          },
          eq(key: string, value: string) { filters.push([key, value]); return q },
          is(key: string, value: null) { filters.push([key, value]); return q },
          async maybeSingle() {
            expect(filters).toEqual([['project_id', PROJECT], ['platform', 'instagram'], ['superseded_at', null]])
            return { data: o.binding === undefined ? bindingRow : o.binding, error: o.bindingError ? { message: 'private binding failure' } : null }
          },
        }
        return q
      },
    }
  })
  const run = (id: unknown = PROJECT) => readGrowthDashboardAdmission(
    request as unknown as Parameters<typeof readGrowthDashboardAdmission>[0],
    id,
    metadata as unknown as Parameters<typeof readGrowthDashboardAdmission>[2],
  )
  const check = async (status: string, id: unknown = PROJECT) => {
    const value = await run(id)
    expect(value).toEqual({ status, projection: null, authorizesPilot: false })
    expect(JSON.stringify(value)).not.toMatch(/synthetic_account|private|00000000/)
    expect(network).not.toHaveBeenCalled()
    expect(adminFactory).not.toHaveBeenCalled()
    return value
  }
  return { calls, metadata, check }
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('unmounted Growth Engine admission with real Atlas isolation and binding reader, fake DB only', () => {
  it('rejects invalid project ID before any auth, database or metadata access', async () => {
    const f = fixture()
    for (const id of [null, 'bad', '00000000-0000-0000-0000-000000000000']) await f.check('no_access', id)
    expect(f.calls).toEqual([])
  })
  it('rejects absent authenticated user without database or metadata access', async () => {
    const f = fixture({ user: null })
    await f.check('no_access')
    expect(f.calls).toEqual([['auth']])
  })
  it('does not trust a user returned together with an auth error', async () => {
    const f = fixture({ authError: true })
    await f.check('no_access')
    expect(f.calls).toEqual([['auth']])
  })
  it('fails closed on auth exception', async () => {
    const f = fixture({ authThrows: true })
    await f.check('unavailable')
    expect(f.metadata).not.toHaveBeenCalled()
  })
  it('does not read project details or binding for an empty or foreign owner allow-list', async () => {
    for (const allowed of [[], [{ id: OTHER }], null]) {
      const f = fixture({ allowed })
      await f.check('no_access')
      expect(f.metadata).not.toHaveBeenCalled()
      expect(f.calls.filter(c => c[0] === 'request')).toEqual([['request', 'projects', 'id']])
    }
  })
  it('fails closed when owner allow-list lookup throws', async () => {
    const f = fixture({ allowedThrows: true })
    await f.check('no_access')
    expect(f.metadata).not.toHaveBeenCalled()
  })
  it('rechecks owner and requested project rather than trusting allow-list alone', async () => {
    for (const project of [null, { ...projectRow, owner_id: OTHER }, { ...projectRow, id: OTHER }]) {
      const f = fixture({ project })
      await f.check('no_access')
      expect(f.metadata).not.toHaveBeenCalled()
    }
  })
  it('does not admit Familje-Stunden or other owned projects to this first pilot', async () => {
    for (const slug of ['familje-stunden', 'gainpilot', 'unknown']) {
      const f = fixture({ project: { ...projectRow, slug } })
      await f.check('no_access')
      expect(f.metadata).not.toHaveBeenCalled()
    }
  })
  it('does not query metadata on failed exact ownership read', async () => {
    const f = fixture({ projectError: true })
    await f.check('unavailable')
    expect(f.metadata).not.toHaveBeenCalled()
  })
  it('never falls back to implicit admin if supplied metadata client is null or throws', async () => {
    await fixture({ metadataNull: true }).check('unavailable')
    await fixture({ metadataThrows: true }).check('unavailable')
  })
  it('distinguishes absent binding from an unreadable or mismatched binding', async () => {
    await fixture({ binding: null }).check('account_missing')
    await fixture({ bindingError: true }).check('unavailable')
    await fixture({ binding: { ...bindingRow, project_id: OTHER } }).check('unavailable')
    await fixture({ binding: { ...bindingRow, platform: 'facebook' } }).check('unavailable')
  })
  it('rejects blocked or runtime-only bindings and malformed verification timestamps', async () => {
    await fixture({ binding: { ...bindingRow, blocked_at: '2026-01-02T00:00:00Z' } }).check('account_blocked')
    await fixture({ binding: { ...bindingRow, blocked_reason: 'account_mismatch' } }).check('account_blocked')
    await fixture({ binding: { ...bindingRow, verification: 'runtime_evidence' } }).check('account_unverified')
    await fixture({ binding: { ...bindingRow, verified_at: 'not-a-date' } }).check('account_unverified')
  })
  it('even stored provider attestation admits no projection or pilot; only metadata is read', async () => {
    const f = fixture()
    await f.check('post_evidence_not_established')
    expect(f.metadata).toHaveBeenCalledTimes(1)
    expect(f.calls.map(c=>c[0])).toEqual([
      'auth','request','request-filter','request','request-filter','request-filter','metadata-factory','metadata',
    ])
  })
})