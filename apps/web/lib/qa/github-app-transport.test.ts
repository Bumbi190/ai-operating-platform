/**
 * GitHub App authentication and the three release observations.
 *
 * The assertions that matter most are the ones about what never happens: the
 * private key, the signed JWT and the installation token must not reach a log,
 * an error, an evidence row or an action output; a green result from the wrong
 * producer must not satisfy anything; and a passive bundle projection must not
 * touch the network or read a credential.
 *
 * Every key here is generated at test time. The production PEM is never opened
 * by a test — a test that needs the real private key is a test that can leak it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { join } from 'node:path'

import {
  getInstallationToken, isGithubAppConfigured, INSTALLATION_TOKEN_PERMISSIONS,
  __resetInstallationTokenCache,
} from '../workflows/adapters/familje-stunden/github-app-auth'
import {
  observeGithubMergeShaMatch, observeGithubPrChecksGreen, observeGithubPrMerged,
  readPullRequest,
} from '../workflows/adapters/familje-stunden/github-observation'
import { ACTION_REGISTRY } from '../workflows/action-registry'
import { checkAnsweredBy } from '../workflows/action-discovery'
import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import { GITHUB_BINDING_CHECKS, GITHUB_BINDING_STATE } from '../workflows/bundle/github-binding'
import type { WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition } from '../workflows/types'

// ── Synthetic credential ─────────────────────────────────────────────────────

const { privateKey: KEY, publicKey: PUBLIC_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const APP_ID = '123456'
const INSTALL_ID = '7890123'
const REPO = 'Bumbi190/familje-stunden-v2'
const TOKEN = 'ghs_synthetic_installation_token'
const NOW = '2026-09-04T12:00:00.000Z'
const HEAD = '3e6ca794b009bc371ae2980f54f285a103bd638c'
const MERGE = '92776b23b599b8808e89b8daaabca9a80f3802c5'
const OTHER = '1'.repeat(40)

function configure(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    FAMILJE_STUNDEN_GITHUB_APP_ID: APP_ID,
    FAMILJE_STUNDEN_GITHUB_INSTALLATION_ID: INSTALL_ID,
    FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY: KEY,
    FAMILJE_STUNDEN_GITHUB_REPO: REPO,
    ...over,
  }
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) vi.stubEnv(k, ''); else vi.stubEnv(k, v)
  }
}

interface Route { status?: number; body?: unknown; link?: string }
function fakeFetch(routes: Record<string, Route | Route[]>) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: string | null }[] = []
  const pageCount: Record<string, number> = {}
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({
      url: u, method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : null,
    })
    if (u.includes('/access_tokens')) {
      const r = (routes['/access_tokens'] ?? {}) as Route
      const status = r.status ?? 201
      return {
        ok: status >= 200 && status < 300, status,
        headers: { get: () => null },
        json: async () => r.body ?? { token: TOKEN, expires_at: new Date(Date.now() + 3600_000).toISOString() },
      } as unknown as Response
    }
    const key = Object.keys(routes).find(k => k !== '/access_tokens' && u.includes(k))
    const entry = key ? routes[key] : { status: 404, body: {} }
    const r = Array.isArray(entry)
      ? entry[Math.min(pageCount[key!] = (pageCount[key!] ?? 0) + 1, entry.length) - 1]
      : entry
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (h: string) => (h.toLowerCase() === 'link' ? (r.link ?? null) : null) },
      json: async () => r.body ?? {},
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const prBody = (over: Record<string, unknown> = {}) => ({
  number: 40, state: 'closed', merged: true, merge_commit_sha: MERGE,
  head: { sha: HEAD }, base: { repo: { full_name: REPO } }, ...over,
})
const statusList = (over: { state?: string; creatorId?: number } = {}) => ([{
  context: 'Vercel', state: over.state ?? 'success',
  created_at: '2026-09-03T12:14:05Z', updated_at: '2026-09-03T12:14:05Z',
  creator: { id: over.creatorId ?? 35613825, login: 'vercel[bot]', type: 'Bot' },
}])
const checkRuns = (over: {
  supabaseApp?: number; commentsApp?: number
  supabase?: string | null; comments?: string | null; sha?: string
} = {}) => ({
  total_count: 2,
  check_runs: [
    { name: 'Supabase Preview', app: { id: over.supabaseApp ?? 330661 },
      status: over.supabase === null ? 'in_progress' : 'completed',
      conclusion: over.supabase === undefined ? 'success' : over.supabase,
      head_sha: over.sha ?? HEAD, started_at: '2026-09-03T12:13:27Z', completed_at: '2026-09-03T12:14:33Z' },
    { name: 'Vercel Preview Comments', app: { id: over.commentsApp ?? 8329 },
      status: over.comments === null ? 'in_progress' : 'completed',
      conclusion: over.comments === undefined ? 'success' : over.comments,
      head_sha: over.sha ?? HEAD, started_at: '2026-09-03T12:14:06Z', completed_at: '2026-09-03T12:14:06Z' },
  ],
})
const GREEN = {
  '/pulls/40': { body: prBody() },
  '/statuses': { body: statusList() },
  '/check-runs': { body: checkRuns() },
}
const ID = { prNumber: 40, expectedMergeSha: MERGE }

beforeEach(() => { __resetInstallationTokenCache() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); __resetInstallationTokenCache() })

// ── 1-11. AUTH ───────────────────────────────────────────────────────────────

describe('1-11. GitHub App authentication', () => {
  it('1/5. a valid synthetic config mints an installation token', async () => {
    configure()
    const f = fakeFetch({})
    const r = await getInstallationToken({ fetchImpl: f.impl })
    expect(r.ok).toBe(true)
    const mint = f.calls.find(c => c.url.includes('/access_tokens'))!
    expect(mint.method).toBe('POST')
    // A three-segment RS256 JWT was presented, and it is NOT the private key.
    const authHeader = (mint.headers as Record<string, string>).Authorization
    expect(authHeader.startsWith('Bearer ')).toBe(true)
    expect(authHeader.split('.')).toHaveLength(3)
    expect(authHeader).not.toContain('PRIVATE KEY')
  })

  it('1b. the JWT signature actually VERIFIES, and carries the right claims', async () => {
    // Counting three segments proves only that a string has two dots in it. A
    // signature can be structurally present and cryptographically meaningless —
    // GitHub answers "a JSON web token could not be decoded" and the shape test
    // still passes. So the signature is verified here against the matching
    // public key, which is the only assertion that can fail for the real reason.
    configure()
    const f = fakeFetch({})
    await getInstallationToken({ fetchImpl: f.impl })
    const jwt = (f.calls[0].headers as Record<string, string>).Authorization.slice('Bearer '.length)
    const [h, p, sig] = jwt.split('.')

    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${h}.${p}`)
    verifier.end()
    expect(verifier.verify(PUBLIC_KEY, Buffer.from(sig, 'base64url'))).toBe(true)

    const header = JSON.parse(Buffer.from(h, 'base64url').toString())
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(String(claims.iss)).toBe(APP_ID)
    // Backdated against clock skew, and well inside GitHub's 10-minute ceiling.
    const now = Math.floor(Date.now() / 1000)
    expect(claims.iat).toBeLessThanOrEqual(now)
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600)
    expect(claims.exp).toBeGreaterThan(now)
  })

  it('2/3/4. malformed app id, installation id or key fails closed', async () => {
    for (const bad of [
      { FAMILJE_STUNDEN_GITHUB_APP_ID: 'not-a-number' },
      { FAMILJE_STUNDEN_GITHUB_APP_ID: '' },
      { FAMILJE_STUNDEN_GITHUB_INSTALLATION_ID: 'abc' },
      { FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY: 'nonsense' },
      { FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY: '' },
    ]) {
      vi.unstubAllEnvs(); __resetInstallationTokenCache()
      configure(bad)
      expect(isGithubAppConfigured(), JSON.stringify(bad)).toBe(false)
      const spy = vi.fn()
      const r = await getInstallationToken({ fetchImpl: spy as unknown as typeof fetch })
      expect(r.ok, JSON.stringify(bad)).toBe(false)
      expect(r.ok === false && r.failure).toBe('credential_missing')
      // Fails BEFORE any request: a malformed credential is never sent.
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('4b. a structurally-valid but unusable key fails closed without throwing', async () => {
    configure({ FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nbroken\n-----END PRIVATE KEY-----' })
    const r = await getInstallationToken({ fetchImpl: fakeFetch({}).impl })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure).toBe('credential_missing')
    // The crypto error is discarded, never quoted: it can echo key material.
    expect(r.ok === false && r.detail).not.toContain('BEGIN')
  })

  it('5b. the mint request narrows to exactly the three read permissions', async () => {
    configure()
    const f = fakeFetch({})
    await getInstallationToken({ fetchImpl: f.impl })
    const body = JSON.parse(f.calls.find(c => c.url.includes('/access_tokens'))!.body!)
    expect(body).toEqual({ permissions: INSTALLATION_TOKEN_PERMISSIONS })
    expect(Object.values(INSTALLATION_TOKEN_PERMISSIONS).every(v => v === 'read')).toBe(true)
    expect(JSON.stringify(body)).not.toContain('write')
  })

  it('6/7. a 401 or 403 from the mint endpoint fails closed', async () => {
    for (const status of [401, 403]) {
      __resetInstallationTokenCache(); configure()
      const r = await getInstallationToken({ fetchImpl: fakeFetch({ '/access_tokens': { status } }).impl })
      expect(r.ok, String(status)).toBe(false)
      expect(r.ok === false && r.failure).toBe('unauthorized')
    }
  })

  it('8/9/10. the token is cached, then reminted inside the safety margin', async () => {
    configure()
    const t0 = Date.parse('2026-09-04T12:00:00.000Z')
    const expires = new Date(t0 + 3600_000).toISOString()
    const f = fakeFetch({ '/access_tokens': { body: { token: TOKEN, expires_at: expires } } })
    const mints = () => f.calls.filter(c => c.url.includes('/access_tokens')).length

    await getInstallationToken({ fetchImpl: f.impl, nowMs: t0 })
    expect(mints()).toBe(1)
    // 9. Well inside the window: reused, no second mint.
    await getInstallationToken({ fetchImpl: f.impl, nowMs: t0 + 30 * 60_000 })
    expect(mints()).toBe(1)
    // 10. Inside the 5-minute safety margin: reminted rather than raced.
    await getInstallationToken({ fetchImpl: f.impl, nowMs: t0 + 56 * 60_000 })
    expect(mints()).toBe(2)
    // 8. And past expiry, certainly reminted.
    await getInstallationToken({ fetchImpl: f.impl, nowMs: t0 + 90 * 60_000 })
    expect(mints()).toBe(3)
  })

  it('10b. a malformed token response is not treated as a token', async () => {
    for (const body of [{}, { token: '' }, { token: TOKEN }, { token: TOKEN, expires_at: 'soon' }]) {
      __resetInstallationTokenCache(); configure()
      const r = await getInstallationToken({ fetchImpl: fakeFetch({ '/access_tokens': { body } }).impl })
      expect(r.ok, JSON.stringify(body)).toBe(false)
    }
  })

  it('11. nothing in the auth module can print a secret', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/github-app-auth.ts'), 'utf8')
    expect(src).not.toMatch(/console\.(log|info|warn|error|debug)/)
    // No error object is ever interpolated: a fetch error carries the request,
    // and the request carries the JWT.
    expect(src).not.toMatch(/\$\{e\}|\$\{err|e\.message|String\(e\)/)
    expect(src).not.toContain('FAMILJE_STUNDEN_GITHUB_TOKEN')
  })
})

// ── 12-20. PR ────────────────────────────────────────────────────────────────

describe('12-20. the exact bound pull request', () => {
  it('12/13. the bound PR is fetched by number, with no listing or search', async () => {
    configure()
    const f = fakeFetch(GREEN)
    await readPullRequest(40, { fetchImpl: f.impl })
    const repoCalls = f.calls.filter(c => c.url.includes('/repos/'))
    expect(repoCalls.some(c => c.url.endsWith(`/repos/${REPO}/pulls/40`))).toBe(true)
    // No "latest PR" anywhere: not a list, not a search, not a sort.
    for (const c of f.calls) {
      expect(c.url).not.toMatch(/\/pulls\?|\/search\/|sort=|state=all/)
    }
  })

  it('14/15. a PR from another base repository is refused, not interpreted', async () => {
    configure()
    const r = await readPullRequest(40, {
      fetchImpl: fakeFetch({ '/pulls/40': { body: prBody({ base: { repo: { full_name: 'attacker/evil' } } }) } }).impl,
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure).toBe('not_found')
  })

  it('16. merged=true passes github_pr_merged', async () => {
    configure()
    const e = await observeGithubPrMerged(ID, NOW, { fetchImpl: fakeFetch(GREEN).impl })
    expect(e.result).toBe('pass')
    expect(e.check_key).toBe('github_pr_merged')
  })

  it('17. closed but unmerged fails — and yields no merge SHA', async () => {
    configure()
    const routes = { ...GREEN, '/pulls/40': { body: prBody({ state: 'closed', merged: false, merge_commit_sha: MERGE }) } }
    const e = await observeGithubPrMerged(ID, NOW, { fetchImpl: fakeFetch(routes).impl })
    expect(e.result).toBe('fail')
    // GitHub populates merge_commit_sha speculatively; it must not be trusted.
    const pr = await readPullRequest(40, { fetchImpl: fakeFetch(routes).impl })
    expect(pr.ok && pr.value.mergeCommitSha).toBeNull()
  })

  it('18/19. a missing or malformed PR fails closed', async () => {
    configure()
    const missing = await observeGithubPrMerged(ID, NOW, {
      fetchImpl: fakeFetch({ '/pulls/40': { status: 404, body: {} } }).impl })
    expect(missing.result).not.toBe('pass')

    for (const body of [{}, { number: 40 }, { number: 40, head: {} }, { number: 'x', head: { sha: HEAD } }]) {
      const r = await readPullRequest(40, { fetchImpl: fakeFetch({ '/pulls/40': { body } }).impl })
      expect(r.ok, JSON.stringify(body)).toBe(false)
    }
  })

  it('20. head SHA and merge SHA stay distinct', async () => {
    configure()
    const r = await readPullRequest(40, { fetchImpl: fakeFetch(GREEN).impl })
    expect(r.ok && r.value.headSha).toBe(HEAD)
    expect(r.ok && r.value.mergeCommitSha).toBe(MERGE)
    expect(HEAD).not.toBe(MERGE)
  })
})

// ── 21-26. MERGE SHA ─────────────────────────────────────────────────────────

describe('21-26. the merge SHA is compared to the instance pin only', () => {
  it('21. exact full-SHA equality passes', async () => {
    configure()
    const e = await observeGithubMergeShaMatch(ID, NOW, { fetchImpl: fakeFetch(GREEN).impl })
    expect(e.result).toBe('pass')
  })

  it('22. a mismatch fails with SHA_MISMATCH', async () => {
    configure()
    const e = await observeGithubMergeShaMatch(
      { prNumber: 40, expectedMergeSha: OTHER }, NOW, { fetchImpl: fakeFetch(GREEN).impl })
    expect(e.result).toBe('fail')
    expect(e.detail.reason).toBe('SHA_MISMATCH')
  })

  it('23. a missing pin blocks — it never passes', async () => {
    configure()
    const e = await observeGithubMergeShaMatch(
      { prNumber: 40, expectedMergeSha: null }, NOW, { fetchImpl: fakeFetch(GREEN).impl })
    expect(e.result).toBe('blocked')
    expect(e.result).not.toBe('pass')
  })

  it('24. a missing actual merge SHA blocks', async () => {
    configure()
    const e = await observeGithubMergeShaMatch(ID, NOW, {
      fetchImpl: fakeFetch({ ...GREEN, '/pulls/40': { body: prBody({ merged: false, state: 'open' }) } }).impl })
    expect(e.result).toBe('blocked')
  })

  it('25. the HEAD SHA can never satisfy the merge-SHA check', async () => {
    configure()
    // Pin the head commit. It is a real, full, valid SHA — and the wrong one.
    const e = await observeGithubMergeShaMatch(
      { prNumber: 40, expectedMergeSha: HEAD }, NOW, { fetchImpl: fakeFetch(GREEN).impl })
    expect(e.result).toBe('fail')
    expect(e.detail.merge_commit_sha).toBe(MERGE)
  })

  it('26. the deployment-global env vars cannot supply the identity', async () => {
    configure({
      FAMILJE_STUNDEN_RELEASE_PR: '40',
      FAMILJE_STUNDEN_EXPECTED_MERGE_SHA: MERGE,
    } as Record<string, string>)
    // The pin passed in is what decides, and it says null.
    const e = await observeGithubMergeShaMatch(
      { prNumber: 40, expectedMergeSha: null }, NOW, { fetchImpl: fakeFetch(GREEN).impl })
    expect(e.result).toBe('blocked')
    // And the module never names those variables at all.
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/github-observation.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toContain('FAMILJE_STUNDEN_RELEASE_PR')
    expect(code).not.toContain('FAMILJE_STUNDEN_EXPECTED_MERGE_SHA')
  })
})

// ── 27-45. CI ────────────────────────────────────────────────────────────────

describe('27-45. required CI on the head commit', () => {
  const ci = (routes: Record<string, Route | Route[]>) => {
    configure()
    return observeGithubPrChecksGreen(ID, NOW, { fetchImpl: fakeFetch(routes).impl })
  }

  it('27. all three signals green from the correct producers → PASS', async () => {
    const e = await ci(GREEN)
    expect(e.result).toBe('pass')
    expect(e.detail.head_sha).toBe(HEAD)
  })

  it('27b. CI is read on the HEAD commit, never the merge commit', async () => {
    configure()
    const f = fakeFetch(GREEN)
    await observeGithubPrChecksGreen(ID, NOW, { fetchImpl: f.impl })
    expect(f.calls.some(c => c.url.includes(`/commits/${HEAD}/statuses`))).toBe(true)
    expect(f.calls.some(c => c.url.includes(`/commits/${HEAD}/check-runs`))).toBe(true)
    expect(f.calls.some(c => c.url.includes(MERGE))).toBe(false)
  })

  it('28. the Vercel status from the WRONG creator does not satisfy it', async () => {
    const e = await ci({ ...GREEN, '/statuses': { body: statusList({ creatorId: 999 }) } })
    expect(e.result).not.toBe('pass')
    expect(String(e.detail.checks)).toContain('Vercel=WRONG_PRODUCER')
  })

  it('29/30. a check run from the WRONG app does not satisfy it', async () => {
    const a = await ci({ ...GREEN, '/check-runs': { body: checkRuns({ supabaseApp: 999 }) } })
    expect(a.result).not.toBe('pass')
    expect(String(a.detail.checks)).toContain('Supabase Preview=WRONG_PRODUCER')

    const b = await ci({ ...GREEN, '/check-runs': { body: checkRuns({ commentsApp: 999 }) } })
    expect(b.result).not.toBe('pass')
    expect(String(b.detail.checks)).toContain('Vercel Preview Comments=WRONG_PRODUCER')
  })

  it('31/32. one source alone can never answer', async () => {
    const statusOnly = await ci({ ...GREEN, '/check-runs': { status: 503, body: {} } })
    expect(statusOnly.result).not.toBe('pass')
    const runsOnly = await ci({ ...GREEN, '/statuses': { status: 503, body: {} } })
    expect(runsOnly.result).not.toBe('pass')
  })

  it('33/34. results on another commit never satisfy anything', async () => {
    const wrong = await ci({ ...GREEN, '/check-runs': { body: checkRuns({ sha: OTHER }) } })
    expect(wrong.result).not.toBe('pass')
    expect(String(wrong.detail.checks)).toContain('WRONG_SHA')
  })

  it('35. a missing required signal fails closed', async () => {
    const e = await ci({ ...GREEN, '/check-runs': { body: { total_count: 1, check_runs: [
      checkRuns().check_runs[0] ] } } })
    expect(e.result).not.toBe('pass')
    expect(String(e.detail.checks)).toContain('Vercel Preview Comments=MISSING')
  })

  it('36-40. pending, failure, skipped, neutral and cancelled are all NOT PASS', async () => {
    for (const conclusion of [null, 'failure', 'skipped', 'neutral', 'cancelled', 'timed_out', 'stale']) {
      const e = await ci({ ...GREEN, '/check-runs': { body: checkRuns({ supabase: conclusion }) } })
      expect(e.result, String(conclusion)).not.toBe('pass')
    }
    const pendingStatus = await ci({ ...GREEN, '/statuses': { body: statusList({ state: 'pending' }) } })
    expect(pendingStatus.result).not.toBe('pass')
  })

  it('41. a malformed response fails closed', async () => {
    for (const body of ['nope', { check_runs: 'x' }, { check_runs: [null] }]) {
      const e = await ci({ ...GREEN, '/check-runs': { body } })
      expect(e.result, JSON.stringify(body)).not.toBe('pass')
    }
  })

  it('42. the newest rerun decides', async () => {
    const runs = checkRuns()
    const e = await ci({ ...GREEN, '/check-runs': { body: { total_count: 3, check_runs: [
      { ...runs.check_runs[0], conclusion: 'success', completed_at: '2026-09-03T12:00:00Z' },
      { ...runs.check_runs[0], conclusion: 'failure', completed_at: '2026-09-03T13:00:00Z' },
      runs.check_runs[1],
    ] } } })
    expect(e.result).not.toBe('pass')
    expect(String(e.detail.checks)).toContain('Supabase Preview=FAILED')
  })

  it('43. pagination is followed to the end', async () => {
    configure()
    const f = fakeFetch({
      '/pulls/40': { body: prBody() },
      // Page 1 declares a next link and carries only the Vercel status.
      '/statuses': [
        { body: statusList(), link: '<https://api.github.com/x?page=2>; rel="next"' },
        { body: [] },
      ],
      '/check-runs': { body: checkRuns() },
    })
    const e = await observeGithubPrChecksGreen(ID, NOW, { fetchImpl: f.impl })
    expect(e.result).toBe('pass')
    // Both pages were actually requested.
    expect(f.calls.filter(c => c.url.includes('/statuses')).length).toBe(2)
    expect(f.calls.some(c => c.url.includes('page=2'))).toBe(true)
  })

  it('44. incomplete pagination fails closed rather than evaluating a partial set', async () => {
    configure()
    // total_count says three runs exist; only two arrive. A required signal
    // could be the missing one, so the picture is refused.
    const e = await observeGithubPrChecksGreen(ID, NOW, {
      fetchImpl: fakeFetch({ ...GREEN,
        '/check-runs': { body: { total_count: 3, check_runs: checkRuns().check_runs } } }).impl })
    expect(e.result).not.toBe('pass')

    // And a never-ending Link chain is bounded rather than followed forever.
    const endless = await observeGithubPrChecksGreen(ID, NOW, {
      fetchImpl: fakeFetch({ ...GREEN,
        '/statuses': { body: statusList(), link: '<https://api.github.com/x?page=9>; rel="next"' } }).impl })
    expect(endless.result).not.toBe('pass')
  })

  it('45. a spoofed same-name green result cannot PASS', async () => {
    // Everything a spoof controls: the name, the conclusion, the commit. The
    // one thing it cannot forge is GitHub's numeric identity for the producer.
    const e = await ci({
      ...GREEN,
      '/check-runs': { body: { total_count: 2, check_runs: [
        { name: 'Supabase Preview', app: { id: 424242, slug: 'supabase' }, status: 'completed',
          conclusion: 'success', head_sha: HEAD, completed_at: '2026-09-03T12:14:33Z' },
        checkRuns().check_runs[1],
      ] } },
    })
    expect(e.result).not.toBe('pass')
    expect(String(e.detail.outcome)).toBe('UNTRUSTED_PRODUCER')
  })
})

// ── 46-56. GOVERNANCE ────────────────────────────────────────────────────────

describe('46-56. governance and boundaries', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const OBS = 'lib/workflows/adapters/familje-stunden/github-observation.ts'
  const AUTH = 'lib/workflows/adapters/familje-stunden/github-app-auth.ts'
  const HANDLER = 'lib/workflows/handlers/observe-github-release.ts'
  const KINDS = ['observe_github_pr_merged', 'observe_github_pr_checks_green',
                 'observe_github_merge_sha_match'] as const

  it('46. each action answers exactly one check, and no check twice', () => {
    const answered = KINDS.map(k => checkAnsweredBy(k))
    expect(answered).toEqual([
      'github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected'])
    expect(new Set(answered).size).toBe(3)
  })

  it('47. all three are READ_ONLY and read-only-executable', () => {
    for (const k of KINDS) {
      const meta = ACTION_REGISTRY[k]
      expect(meta.action_class, k).toBe('READ_ONLY')
      expect(meta.executor_family, k).toBe('read_only_observation')
      expect(meta.placements.every(p => p.state === 'frontend_deploy'), k).toBe(true)
    }
  })

  it('48. no repository mutation endpoint is reachable', () => {
    const code = strip(read(OBS)) + strip(read(AUTH)) + strip(read(HANDLER))
    for (const forbidden of ['/merge', 'merge_method', '/comments', '/reviews',
                             '/dispatches', '/statuses/', 'check-runs/', '/labels',
                             'PATCH', 'PUT', 'DELETE']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
    // Exactly ONE method other than GET exists in the whole call graph, and it
    // is the token mint. Authentication, not repository mutation.
    const posts = code.match(/method:\s*'POST'/g) ?? []
    expect(posts).toHaveLength(1)
    expect(strip(read(AUTH))).toContain('/access_tokens')
    expect(strip(read(OBS))).not.toContain("method: 'POST'")
  })

  it('49/50. no database writer and no provider spend path is reachable', () => {
    const code = strip(read(OBS)) + strip(read(AUTH)) + strip(read(HANDLER))
    // `.update(` alone would fire on `signer.update(...)`, which is RS256
    // signing, not a table write. The database entry point is `.from(` — with
    // no client and no `.from(`, no table operation of any kind can exist.
    for (const forbidden of ['.insert(', '.upsert(', '.rpc(',
                             'createAdminClient', 'createClient', '@/lib/supabase',
                             'recordEvidence', 'appendTransition', 'reserveSpend',
                             'chargeSpend', 'api.vercel.com']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
    // Two method names would fire on innocent standard-library calls, so each
    // is checked by RECEIVER instead: `.update(` is RS256 signing and `.from(`
    // is base64 encoding. Neither is a table operation, and with no Supabase
    // client anywhere there is no table operation to reach.
    for (const m of code.match(/\w+\.update\(/g) ?? []) expect(m).toBe('signer.update(')
    for (const m of code.match(/\w+\.from\(/g) ?? []) expect(m).toBe('Buffer.from(')
  })

  it('51/52. a passive bundle projection makes no request and reads no credential', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    configure()
    const b = bundle([])
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify(b)).not.toContain(KEY.slice(40, 80))
    expect(JSON.stringify(b)).not.toContain(TOKEN)
    // The projection module names no GitHub credential at all.
    const proj = strip(read('lib/workflows/bundle/project.ts'))
    expect(proj).not.toContain('GITHUB_APP')
    expect(proj).not.toMatch(/\bfetch\s*\(/)
  })

  it('53. reachability is EXECUTABLE now that the actions are registered', () => {
    const b = bundle([])
    for (const key of ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected']) {
      expect(b.checks.find(c => c.check_key === key)!.reachability, key).toBe('EXECUTABLE')
    }
  })

  it('54/55. EXECUTABLE is not PASS, and readiness does not improve', () => {
    const b = bundle([])
    for (const key of ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected']) {
      const c = b.checks.find(x => x.check_key === key)!
      expect(c.reachability, key).toBe('EXECUTABLE')
      expect(c.status, key).toBe('NOT_EXERCISED')   // reachable ≠ answered
    }
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('56. no conditional Supabase NOT_APPLICABLE logic was introduced', () => {
    const code = strip(read(OBS)) + strip(read(HANDLER))
      + strip(read('lib/workflows/adapters/familje-stunden/ci-checks.ts'))
    for (const forbidden of ['NOT_APPLICABLE', 'SATISFIED_BY_SCOPE', '/files', 'previous_filename']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
    // `skipped` is still simply a conclusion the policy does not accept.
    const policy = read('lib/workflows/adapters/familje-stunden/ci-checks.ts')
    expect(policy).not.toMatch(/accepted:\s*\['success',\s*'skipped'\]/)
  })

  it('the handler refuses a CONFLICTED or missing binding before any request', async () => {
    const { observeGithubPrMergedHandler } = await import('../workflows/handlers/observe-github-release')
    configure()
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    for (const status of ['CONFLICTED', 'MISSING', 'PARTIAL', 'INVALID'] as const) {
      const out = await observeGithubPrMergedHandler({
        instanceKey: '2099-01', state: 'frontend_deploy',
        defKey: FAMILJE_STUNDEN_MONTHLY_RELEASE, defVersion: 1, now: NOW,
        readReleaseBinding: async () => ({
          repository: REPO, pr_number: status === 'PARTIAL' ? null : null,
          expected_merge_sha: null, binding_status: status, invalid_fields: [],
          locked_at: null, locked_by: null, rejected_rebind: null, generations: 0,
        }),
      })
      expect(out.result, status).toBe('blocked')
      expect(out.checkKey).toBe('github_pr_merged')
    }
    expect(spy).not.toHaveBeenCalled()
  })
})

// ── bundle helper ────────────────────────────────────────────────────────────

function bundle(evidence: WorkflowEvidence[]) {
  const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
  const def: WorkflowDef = {
    id: 'd', def_key: v.def_key, version: v.version, def_hash: v.def_hash, spec: v.spec, created_at: NOW }
  const instance: WorkflowInstance = {
    id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: v.version, def_hash: 'h',
    project_id: 'p', instance_key: '2099-01', current_state: 'frontend_deploy', status: 'active',
    wake_at: null, last_tick_at: null, last_tick_outcome: null, created_at: NOW, closed_at: null }
  const transitions: WorkflowTransition[] = [{
    id: 't', seq: 1, instance_id: 'i', from_state: null, to_state: 'planning',
    reason: 't', actor: 't', evidence_ref: null, authorization_id: null, occurred_at: NOW }]
  return projectMonthReleaseBundle({
    month_key: '2099-01', def, instance, transitions, evidence,
    declaredChecks: FAMILJE_STUNDEN_CHECKS,
    readOnlyAnsweredCheckKeys: [
      'release_instant_computed', 'anonymous_protected_access_denied', 'release_gate_exists',
      'github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected'],
    githubRepository: REPO, now: NOW,
  })
}

export { GITHUB_BINDING_CHECKS, GITHUB_BINDING_STATE }
