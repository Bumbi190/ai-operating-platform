import { beforeEach, describe, expect, it, vi } from 'vitest'

const PID = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SCRIPT = '2304ab91-d790-4112-a995-f126062583f1'
const OTHER_SCRIPT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NEWS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const mocks = vi.hoisted(() => ({
  operator: vi.fn(),
  access: vi.fn(),
  grant: vi.fn(),
  queries: [] as Array<{ table: string; op: string; key: string; value: unknown }>,
  failing: '' as string,
}))

vi.mock('@/lib/auth/platform-operator', () => ({
  resolvePlatformOperator: mocks.operator,
}))
vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: mocks.access,
}))
vi.mock('@/lib/ai/bedrock-pilot/operator-grant', () => ({
  resolveManualBedrockOperatorGrant: mocks.grant,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const where: Record<string, unknown> = {}
      const sets: Record<string, unknown[]> = {}
      const rows: Record<string, Array<Record<string, any>>> = {
        projects: [
          { id: 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
            name: 'The Prompt', slug: 'ai-media-automation' },
          { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            name: 'Private Project', slug: 'other-project' },
        ],
        media_scripts: [
          { id: '2304ab91-d790-4112-a995-f126062583f1',
            project_id: 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
            news_item_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            script: 'This is the saved editorial script.', hook: 'Saved hook',
            topic: 'Google in schools', status: 'published',
            generated_at: '2026-11-05T07:20:51Z' },
          { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            project_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            news_item_id: null,
            script: 'SECRET OTHER PROJECT SCRIPT',
            status: 'pending_review', generated_at: '2026-11-06T07:20:51Z' },
        ],
        media_news_items: [
          { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            project_id: 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
            title: 'Google Is Forcing AI Overviews in Classrooms',
            url: 'https://www.wired.com/story/google-and-schools/',
            source_name: 'WIRED',
            summary: 'AI-produced summary, not an article quotation.',
            raw_output: { sources: ['https://do-not-trust-or-copy.example'] } },
        ],
      }
      const matching = () => (rows[table] || []).filter(r =>
        Object.entries(where).every(([k, v]) => r[k] === v) &&
        Object.entries(sets).every(([k, values]) => values.includes(r[k])))
      const getResult = (single: boolean, limit?: number) => {
        if (mocks.failing === table) return { data: null, error: { message: 'db test error' } }
        const candidates = matching()
        return { data: single ? (candidates[0] ?? null)
          : (limit ? candidates.slice(0, limit) : candidates), error: null }
      }
      const builder = {
        select(_fields: string) { return builder },
        eq(key: string, value: unknown) {
          mocks.queries.push({ table, op: 'eq', key, value })
          where[key] = value
          return builder
        },
        in(key: string, values: unknown[]) {
          mocks.queries.push({ table, op: 'in', key, value: values })
          sets[key] = values
          return builder
        },
        order(_column: string, _options: unknown) { return builder },
        async limit(n: number) { return getResult(false, n) },
        async maybeSingle() { return getResult(true) },
      }
      return builder
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queries.length = 0
  mocks.failing = ''
  mocks.operator.mockResolvedValue({ ok: true, userId: 'owner', actor: 'user:owner' })
  mocks.access.mockResolvedValue({ ok: true, userId: 'owner', allowedProjectIds: [PID] })
  mocks.grant.mockResolvedValue({ ok: true, grant: { projectId: PID } })
})

async function library() { return import('@/lib/ai/bedrock-pilot/saved-review-data') }

describe('Read-only saved The Prompt script library', () => {
  it('lists only owned The Prompt records, with no script text in the list response', async () => {
    const { listSavedPromptReviews } = await library()
    const r = await listSavedPromptReviews()
    expect(r.ok).toBe(true)
    if (!r.ok || !('items' in r)) throw Error('list required')
    expect(r.projectId).toBe(PID)
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ id: SCRIPT, hasPrimarySource: true,
      title: 'Google Is Forcing AI Overviews in Classrooms' })
    expect(JSON.stringify(r)).not.toContain('saved editorial script')
    expect(JSON.stringify(r)).not.toContain('SECRET OTHER PROJECT SCRIPT')
    expect(mocks.grant).toHaveBeenCalledWith(PID)
    expect(mocks.queries).toEqual(expect.arrayContaining([
      { table: 'projects', op: 'in', key: 'id', value: [PID] },
      { table: 'media_scripts', op: 'eq', key: 'project_id', value: PID },
      { table: 'media_news_items', op: 'eq', key: 'project_id', value: PID },
    ]))
  })
  it('returns exact saved script and primary link, with no fabricated source excerpt', async () => {
    const { getSavedPromptReview } = await library()
    const r = await getSavedPromptReview(SCRIPT)
    expect(r.ok).toBe(true)
    if (!r.ok || !('item' in r)) throw Error('detail required')
    expect(r.item.script).toBe('This is the saved editorial script.')
    expect(r.item.primaryUrl).toBe('https://www.wired.com/story/google-and-schools/')
    expect(r.item.sourceExcerpt).toBe(null)
    expect(r.item.secondSourceAvailable).toBe(false)
    expect(r.item.sourcesVerified).toBe(false)
    expect(r.item.aiNewsSummary).toContain('AI-produced summary')
    expect(JSON.stringify(r.item)).not.toContain('do-not-trust-or-copy')
  })
  it('cannot fetch script belonging to a different project even with its real UUID', async () => {
    const { getSavedPromptReview } = await library()
    const r = await getSavedPromptReview(OTHER_SCRIPT)
    expect(r).toEqual({ ok: false, reason: 'script_not_found' })
    expect(mocks.queries).toEqual(expect.arrayContaining([
      { table: 'media_scripts', op: 'eq', key: 'project_id', value: PID },
    ]))
  })
  it('non-operator cannot even enumerate project metadata', async () => {
    mocks.operator.mockResolvedValueOnce({ ok: false, reason: 'unauthenticated' })
    const { listSavedPromptReviews } = await library()
    const r = await listSavedPromptReviews()
    expect(r).toEqual({ ok: false, reason: 'operator_required' })
    expect(mocks.queries).toHaveLength(0)
  })
  it('operator without this project is denied', async () => {
    mocks.access.mockResolvedValueOnce({ ok: true, userId: 'owner', allowedProjectIds: [OTHER] })
    const { listSavedPromptReviews } = await library()
    expect(await listSavedPromptReviews()).toEqual({ ok: false, reason: 'prompt_not_owned' })
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it('cross-session principal mismatch is denied', async () => {
    mocks.access.mockResolvedValueOnce({ ok: true, userId: 'different-owner', allowedProjectIds: [PID] })
    const { listSavedPromptReviews } = await library()
    expect(await listSavedPromptReviews()).toEqual({ ok: false, reason: 'project_access_denied' })
    expect(mocks.queries).toHaveLength(0)
  })
  it('invalid script UUID refuses before authentication and storage reads', async () => {
    const { getSavedPromptReview } = await library()
    expect(await getSavedPromptReview('not-uuid')).toEqual({ok:false,reason:'invalid_script'})
    expect(mocks.operator).not.toHaveBeenCalled()
    expect(mocks.queries).toHaveLength(0)
  })
  it('database errors never return a partial list or cross-tenant result', async () => {
    mocks.failing = 'media_news_items'
    const { listSavedPromptReviews } = await library()
    expect(await listSavedPromptReviews()).toEqual({ ok: false, reason: 'sources_unavailable' })
  })
})
