import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mocked = vi.hoisted(() => ({
  auth: vi.fn(),
  grantAssert: vi.fn(),
}))
vi.mock('@/lib/ai/bedrock-pilot/operator-grant', () => ({
  resolveManualBedrockOperatorGrant: mocked.auth,
  assertManualBedrockOperatorGrant: mocked.grantAssert,
}))

const PROJECT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ORIGIN = 'https://my-private-preview.vercel.app'
const script = 'A short script awaiting manual editorial QA.'
const sources = [
  { url: 'https://blog.google/products/education', excerpt: 'Schools can control services.' },
  { url: 'https://www.wired.com/story/education', excerpt: 'Teachers describe concerns.' },
]
const valid = { projectId: PROJECT, script, sources, maxOutputTokens: 64 }
const envKeys = ['VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'H1_SPEND_GATE']
const oldEnv = Object.fromEntries(envKeys.map(k => [k, process.env[k]]))

function request(body: unknown = valid, extras: Record<string, string> = {}) {
  return new Request(ORIGIN + '/api/bedrock-review-preflight', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json', ...extras },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_GIT_COMMIT_REF = 'feat/omnira-bedrock-pilot-20261116'
  process.env.H1_SPEND_GATE = '1'
  mocked.auth.mockResolvedValue({ ok: true, grant: { projectId: PROJECT, actor: 'user:verified' } })
  mocked.grantAssert.mockImplementation(() => {})
})
afterAll(() => {
  for (const key of envKeys) oldEnv[key] === undefined
    ? delete process.env[key] : process.env[key] = oldEnv[key]
})

async function preflight(req: Request) {
  const { POST } = await import('@/app/api/bedrock-review-preflight/route')
  const res = await POST(req)
  return { http: res.status, body: await res.json(), headers: res.headers }
}

describe('Preview-only manual Bedrock preflight (never calls a model)', () => {
  it('returns a bounded, non-billable quote with NO user texts or credentials', async () => {
    const { http, body, headers } = await preflight(request())
    expect(http).toBe(200)
    expect(body).toMatchObject({
      status: 'preflight_passed', hardSpendGateActive: true,
      canDispatch: false, modelInvoked: false,
      costReserved: false, sourceReferencesFactChecked: false,
      previewOnly: true, verifiedOperatorAndProject: true, sourceCount: 2,
    })
    expect(body.upperGrossUsdBeforeCredits).toBeGreaterThan(0)
    expect(body.promptBytes).toBeGreaterThan(0)
    expect(JSON.stringify(body)).not.toContain(script)
    expect(JSON.stringify(body)).not.toContain(PROJECT)
    expect(JSON.stringify(body)).not.toContain(sources[0].excerpt)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(mocked.auth).toHaveBeenCalledWith(PROJECT)
    expect(mocked.grantAssert).toHaveBeenCalledOnce()
  })
  it('production cannot even perform a readiness check', async () => {
    process.env.VERCEL_ENV = 'production'
    const { http, body } = await preflight(request())
    expect(http).toBe(404)
    expect(body.canDispatch).toBe(false)
    expect(mocked.auth).not.toHaveBeenCalled()
  })
  it('other preview branch cannot use the endpoint', async () => {
    process.env.VERCEL_GIT_COMMIT_REF = 'main'
    expect((await preflight(request())).http).toBe(404)
    expect(mocked.auth).not.toHaveBeenCalled()
  })
  it('cross-origin and missing fetch metadata are blocked before auth', async () => {
    expect((await preflight(request(valid, { Origin: 'https://evil.example' }))).http).toBe(403)
    expect((await preflight(request(valid, { 'Sec-Fetch-Site': 'cross-site' }))).http).toBe(403)
    expect((await preflight(request(valid, { 'Sec-Fetch-Site': '' }))).http).toBe(403)
    expect(mocked.auth).not.toHaveBeenCalled()
  })
  it('non-JSON, oversized and malformed payloads are refused before auth', async () => {
    expect((await preflight(request(valid, { 'Content-Type': 'text/plain' }))).http).toBe(415)
    expect((await preflight(request('{invalid json'))).http).toBe(400)
    expect((await preflight(request({ ...valid, script: 'x'.repeat(24000) }))).http).toBe(413)
    expect(mocked.auth).not.toHaveBeenCalled()
  })
  it('invalid project ids do not trigger privilege checks', async () => {
    expect((await preflight(request({ ...valid, projectId: 'not-a-uuid' }))).http).toBe(400)
    expect(mocked.auth).not.toHaveBeenCalled()
  })
  it('absent operator or project ownership refuses without leaking account details', async () => {
    mocked.auth.mockResolvedValueOnce({ ok: false, reason: 'not_platform_operator' })
    const { http, body } = await preflight(request())
    expect(http).toBe(403)
    expect(body.reason).toBe('operator_or_project_access_denied')
    expect(body.canDispatch).toBe(false)
    expect(mocked.grantAssert).not.toHaveBeenCalled()
  })
  it('missing hard spend gate still validates format but NEVER grants dispatch', async () => {
    process.env.H1_SPEND_GATE = '0'
    const { http, body } = await preflight(request())
    expect(http).toBe(200)
    expect(body.status).toBe('preflight_blocked')
    expect(body.reason).toBe('hard_spend_gate_required')
    expect(body.hardSpendGateActive).toBe(false)
    expect(body.sourceCount).toBe(2)
    expect(body.upperGrossUsdBeforeCredits).toBeGreaterThan(0)
    expect(body.canDispatch).toBe(false)
    expect(body.modelInvoked).toBe(false)
    expect(body.costReserved).toBe(false)
  })
  it('no source references, no script, or excessive output gets green approval', async () => {
    expect((await preflight(request({ ...valid, sources: [] }))).http).toBe(422)
    expect((await preflight(request({ ...valid, script: '' }))).http).toBe(422)
    expect((await preflight(request({ ...valid, maxOutputTokens: 1000 }))).http).toBe(422)
  })
  it('source code never imports a billable provider, STS, or publishing workflow', () => {
    const code = readFileSync(join(process.cwd(), 'app/api/bedrock-review-preflight/route.ts'), 'utf8')
    const page = readFileSync(join(process.cwd(), 'app/bedrock-review/page.tsx'), 'utf8')
    expect(code).not.toMatch(/@aws-sdk|governed-client|withGovernedSpend|obtainPreviewCredentials|client\.send|fetch\(/)
    expect(code).toMatch(/resolveManualBedrockOperatorGrant\(/)
    expect(code).toMatch(/assertManualBedrockOperatorGrant\(/)
    expect(page).not.toContain('bedrock-pilot-converse')
    expect(page).not.toContain('Kör ett Nova Micro-test')
  })
})
