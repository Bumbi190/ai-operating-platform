import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const io = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }))
vi.mock('@/lib/ai/bedrock-pilot/saved-review-data', () => ({
  listSavedPromptReviews: io.list,
  getSavedPromptReview: io.detail,
}))

const ORIGIN = 'https://aws-private-preview.vercel.app'
const ID = '2304ab91-d790-4112-a995-f126062583f1'
const envKeys = ['VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF']
const previous = Object.fromEntries(envKeys.map(k => [k, process.env[k]]))

function request(body: unknown = { kind: 'list' }, additional: Record<string, string> = {}) {
  return new Request(ORIGIN + '/api/bedrock-review-library', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json', ...additional },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
async function invoke(req: Request) {
  const { POST } = await import('@/app/api/bedrock-review-library/route')
  const res = await POST(req)
  return { code: res.status, body: await res.json(), headers: res.headers }
}
beforeEach(() => {
  vi.clearAllMocks()
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_GIT_COMMIT_REF = 'feat/omnira-bedrock-pilot-20261116'
  io.list.mockResolvedValue({ ok: true, projectId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    projectName:'The Prompt', items: [{ id:ID,title:'Saved Google report',
      status:'published',generatedAt:'2026-11-05T00:00:00Z',hasPrimarySource:true }] })
  io.detail.mockResolvedValue({ ok: true, projectId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    item: { id:ID, projectId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title:'Saved Google report',script:'Saved original words',
      status:'published',generatedAt:'2026-11-05T00:00:00Z',
      primaryUrl:'https://www.wired.com/story/test/',primarySourceName:'WIRED',
      sourceExcerpt:null,secondSourceAvailable:false,sourcesVerified:false,
      aiNewsSummary:'Not source verified' } })
})
afterAll(() => { for (const k of envKeys) previous[k] === undefined
  ? delete process.env[k] : process.env[k] = previous[k] })

describe('read-only The Prompt library endpoint in isolated Preview', () => {
  it('loads a scoped list, no-store, and never calls detail on list', async () => {
    const r=await invoke(request())
    expect(r.code).toBe(200)
    expect(r.body.projectName).toBe('The Prompt')
    expect(r.body.items).toHaveLength(1)
    expect(r.headers.get('cache-control')).toContain('no-store')
    expect(io.list).toHaveBeenCalledOnce()
    expect(io.detail).not.toHaveBeenCalled()
  })
  it('fetches one specific saved script, not every project', async () => {
    const r=await invoke(request({kind:'detail',scriptId:ID}))
    expect(r.code).toBe(200)
    expect(r.body.item.script).toBe('Saved original words')
    expect(r.body.item.sourceExcerpt).toBe(null)
    expect(io.detail).toHaveBeenCalledWith(ID)
    expect(io.list).not.toHaveBeenCalled()
  })
  it('production cannot even load script metadata', async () => {
    process.env.VERCEL_ENV='production'
    expect((await invoke(request())).code).toBe(404)
    expect(io.list).not.toHaveBeenCalled()
  })
  it('other preview branch is denied', async () => {
    process.env.VERCEL_GIT_COMMIT_REF='main'
    expect((await invoke(request())).code).toBe(404)
    expect(io.list).not.toHaveBeenCalled()
  })
  it('cross-origin and cross-site reads are blocked before any DB access', async () => {
    expect((await invoke(request({kind:'list'}, {Origin:'https://evil.example'}))).code).toBe(403)
    expect((await invoke(request({kind:'list'}, {'Sec-Fetch-Site':'cross-site'}))).code).toBe(403)
    expect((await invoke(request({kind:'list'}, {'Sec-Fetch-Site':''}))).code).toBe(403)
    expect(io.list).not.toHaveBeenCalled()
  })
  it('malformed or oversized requests cannot trigger DB access', async () => {
    expect((await invoke(request('{bad'))).code).toBe(400)
    expect((await invoke(request({kind:'list'}, {'Content-Type':'text/plain'}))).code).toBe(415)
    expect((await invoke(request({kind:'detail',scriptId:'bad-id'}))).code).toBe(400)
    expect((await invoke(request({kind:'unknown'}))).code).toBe(400)
    expect((await invoke(request({kind:'list', padding:'x'.repeat(1000)}))).code).toBe(413)
    expect(io.list).not.toHaveBeenCalled()
    expect(io.detail).not.toHaveBeenCalled()
  })
  it('authorization failures never return script content', async () => {
    io.list.mockResolvedValueOnce({ok:false,reason:'operator_required'})
    const r=await invoke(request())
    expect(r.code).toBe(403)
    expect(r.body).toEqual({ok:false,reason:'operator_required'})
  })
  it('unavailable saved data never generates fallback/fake sources', async () => {
    io.detail.mockResolvedValueOnce({ok:false,reason:'sources_unavailable'})
    const r=await invoke(request({kind:'detail',scriptId:ID}))
    expect(r.code).toBe(503)
    expect(r.body).toEqual({ok:false,reason:'sources_unavailable'})
  })
  it('route never imports Bedrock SDK, cost reservation, storage writes or publication', () => {
    const src=readFileSync(join(process.cwd(),'app/api/bedrock-review-library/route.ts'),'utf8')
    expect(src).toContain('listSavedPromptReviews')
    expect(src).not.toMatch(/@aws-sdk|client\.send|withGovernedSpend|obtainPreviewCredentials/)
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
    expect(src).not.toContain('/api/media/publish')
  })
})
