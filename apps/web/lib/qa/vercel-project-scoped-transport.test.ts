/**
 * Vercel project-scoped read transport and the three release observations.
 *
 * The credential behind this is NOT read-only — Vercel offers project scope
 * with no read-only tier, so the token can write inside familje-stunden-v2. The
 * code is what prevents that, which makes the GET-only assertions here the most
 * load-bearing tests in the file, alongside the two the predecessor got wrong:
 * an alias read from a listing that never carries one, and a deployment found
 * by scanning a recency window instead of by its commit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  findProductionDeployment, readDeployment,
  observeVercelDeployShaMatch, observeVercelProductionAlias, observeVercelProductionReady,
  CANONICAL_PRODUCTION_DOMAIN,
} from '../workflows/adapters/familje-stunden/vercel-observation'
import { ACTION_REGISTRY } from '../workflows/action-registry'
import { checkAnsweredBy } from '../workflows/action-discovery'
import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import type { WorkflowDef, WorkflowInstance, WorkflowTransition } from '../workflows/types'

const PROJECT = 'prj_QgFIPR8RJwCDtnbpXHSGhi1GX6gF'
const TOKEN = 'vcp_synthetic_project_scoped_token'
const MERGE = '92776b23b599b8808e89b8daaabca9a80f3802c5'
const OTHER = '1'.repeat(40)
const HEAD = '3e6ca794b009bc371ae2980f54f285a103bd638c'
const UID = 'dpl_3PZF1UBzSvaaebStfkHPjwdJ2AZH'
const NOW = '2026-09-04T12:00:00.000Z'

function configure(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    FAMILJE_STUNDEN_VERCEL_TOKEN: TOKEN,
    FAMILJE_STUNDEN_VERCEL_PROJECT_ID: PROJECT,
    ...over,
  }
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v ?? '')
}

interface Route { status?: number; body?: unknown; headers?: Record<string, string> }
function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = []
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string> })
    // Most specific first: /v13/deployments/ would otherwise be shadowed.
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find(k => u.includes(k))
    const r = key ? routes[key] : { status: 404, body: {} }
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (h: string) => r.headers?.[h.toLowerCase()] ?? null },
      json: async () => r.body ?? {},
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const listing = (uid: string | null = UID) =>
  ({ deployments: uid === null ? [] : [{ uid }] })

const detail = (over: Record<string, unknown> = {}) => ({
  uid: UID, readyState: 'READY', status: 'READY', readySubstate: 'PROMOTED',
  target: 'production', source: 'git',
  meta: { githubCommitSha: MERGE },
  alias: [CANONICAL_PRODUCTION_DOMAIN, 'www.familje-stunden.se', 'familje-stunden-v2.vercel.app'],
  aliasAssigned: true, aliasError: null,
  ...over,
})

const GREEN = { '/v6/deployments': { body: listing() }, '/v13/deployments/': { body: detail() } }
const ID = { mergeSha: MERGE, prNumber: 62 }

beforeEach(() => { configure() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const ready = (r: Record<string, Route>, i = ID) =>
  observeVercelProductionReady(i, NOW, { fetchImpl: fakeFetch(r).impl })
const shaMatch = (r: Record<string, Route>, i = ID) =>
  observeVercelDeployShaMatch(i, NOW, { fetchImpl: fakeFetch(r).impl })
const alias = (r: Record<string, Route>, i = ID) =>
  observeVercelProductionAlias(i, NOW, { fetchImpl: fakeFetch(r).impl })

// ── 1-7. CONFIG / BINDING ────────────────────────────────────────────────────

describe('1-7. the target is configuration, the release is the instance\'s', () => {
  const SRC = 'lib/workflows/adapters/familje-stunden/vercel-observation.ts'
  const src = readFileSync(join(process.cwd(), SRC), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('1/2/3. project, host and canonical alias cannot be overridden', async () => {
    // The host and the domain are module constants; the project id is read from
    // the environment. None is a parameter, so no caller can steer any of them.
    expect(code).toContain("const VERCEL_API = 'https://api.vercel.com'")
    expect(code).toContain(`const CANONICAL_PRODUCTION_DOMAIN = '${CANONICAL_PRODUCTION_DOMAIN}'`)
    expect(code).toContain('process.env.FAMILJE_STUNDEN_VERCEL_PROJECT_ID')
    // The INPUT type carries a merge SHA and a PR number — and nothing that
    // could redirect the request. `config()` legitimately holds a projectId;
    // what matters is that no caller can supply one.
    const inputType = code.slice(code.indexOf('interface ReleaseDeploymentInput'),
                                 code.indexOf('export type ObservationDeps'))
    for (const forbidden of ['projectId', 'teamId', 'apiHost', 'baseUrl', 'alias', 'url', 'host']) {
      expect(inputType, forbidden).not.toContain(forbidden)
    }
    // And no team id is read at all — the project-scoped token carries its own.
    expect(code).not.toContain('FAMILJE_STUNDEN_VERCEL_TEAM_ID')
    const f = fakeFetch(GREEN)
    await observeVercelProductionReady(ID, NOW, { fetchImpl: f.impl })
    expect(f.calls.every(c => c.url.startsWith('https://api.vercel.com/'))).toBe(true)
    expect(f.calls[0].url).toContain(`projectId=${PROJECT}`)
  })

  it('4/5/6. a missing, conflicted or invalid binding fails before any request', async () => {
    const { observeVercelProductionReadyHandler } = await import('../workflows/handlers/observe-vercel-release')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    for (const status of ['MISSING', 'CONFLICTED', 'INVALID', 'PARTIAL'] as const) {
      const out = await observeVercelProductionReadyHandler({
        instanceKey: '2099-01', state: 'frontend_deploy',
        defKey: FAMILJE_STUNDEN_MONTHLY_RELEASE, defVersion: 1, now: NOW,
        readReleaseBinding: async () => ({
          repository: 'Bumbi190/familje-stunden-v2', pr_number: null,
          expected_merge_sha: null, binding_status: status, invalid_fields: [],
          locked_at: null, locked_by: null, rejected_rebind: null, generations: 0,
        }),
      })
      expect(out.result, status).toBe('blocked')
      expect(out.checkKey).toBe('vercel_production_ready')
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('7. the deployment-global release PR is gone entirely', () => {
    const dep = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/deployment.ts'), 'utf8')
    const depCode = dep.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(depCode).not.toContain('FAMILJE_STUNDEN_RELEASE_PR')
    expect(depCode).not.toContain('configuredReleasePr')
    expect(code).not.toContain('FAMILJE_STUNDEN_RELEASE_PR')
    expect(code).not.toContain('FAMILJE_STUNDEN_EXPECTED_MERGE_SHA')
  })
})

// ── 8-15. DEPLOYMENT LOOKUP ──────────────────────────────────────────────────

describe('8-15. the deployment is found by commit, never by recency', () => {
  it('8/9/10/11. the query pins sha, target, project and limit=1', async () => {
    const f = fakeFetch(GREEN)
    await observeVercelProductionReady(ID, NOW, { fetchImpl: f.impl })
    const list = f.calls.find(c => c.url.includes('/v6/deployments'))!.url
    expect(list).toContain(`sha=${MERGE}`)
    expect(list).toContain('target=production')
    expect(list).toContain(`projectId=${PROJECT}`)
    expect(list).toContain('limit=1')
  })

  it('12. zero matches → DEPLOYMENT_NOT_FOUND, and it is retryable early', async () => {
    const e = await ready({ ...GREEN, '/v6/deployments': { body: listing(null) } })
    expect(e.result).not.toBe('pass')
    expect(e.detail.reason).toBe('DEPLOYMENT_NOT_FOUND')
    expect(e.detail.retryable).toBe(true)

    const late = await observeVercelProductionReady(
      { ...ID, attempt: 5, maxAttempts: 5 }, NOW,
      { fetchImpl: fakeFetch({ ...GREEN, '/v6/deployments': { body: listing(null) } }).impl })
    expect(late.result).toBe('fail')
    expect(late.detail.retryable).toBe(false)
  })

  it('13. a malformed listing fails closed', async () => {
    for (const body of [{}, { deployments: 'x' }, { deployments: [null] }, { deployments: [{}] }]) {
      const e = await ready({ ...GREEN, '/v6/deployments': { body } })
      expect(e.result, JSON.stringify(body)).not.toBe('pass')
    }
  })

  it('14/15. no recency window and no "latest deployment" survives anywhere', async () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/vercel-observation.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toContain("limit: '20'")
    // No client-side search for a SHA: the filter is the server's job now.
    expect(code).not.toMatch(/\.find\(/)
    expect(code).toContain("limit: '1'")
    // And a listing that returns SOME deployment is still bound by sha= — the
    // request proves it, since the SHA is in the query rather than the filter.
    const f = fakeFetch(GREEN)
    await observeVercelDeployShaMatch(ID, NOW, { fetchImpl: f.impl })
    expect(f.calls[0].url).toContain(`sha=${MERGE}`)
  })
})

// ── 16-18. DETAIL LOOKUP ─────────────────────────────────────────────────────

describe('16-18. the v13 record is the authority', () => {
  it('16. the exact uid from the listing is the one read', async () => {
    const f = fakeFetch(GREEN)
    await observeVercelProductionAlias(ID, NOW, { fetchImpl: f.impl })
    expect(f.calls.some(c => c.url.endsWith(`/v13/deployments/${UID}`))).toBe(true)
  })

  it('17. a malformed v13 response fails closed', async () => {
    for (const body of [{}, { readyState: 5 }, { readyState: 'READY', alias: 'x' }]) {
      const e = await alias({ ...GREEN, '/v13/deployments/': { body } })
      expect(e.result, JSON.stringify(body)).not.toBe('pass')
    }
  })

  it('18. a 404 on either call is refused, not interpreted', async () => {
    const a = await ready({ ...GREEN, '/v6/deployments': { status: 404, body: {} } })
    expect(a.result).not.toBe('pass')
    const b = await ready({ ...GREEN, '/v13/deployments/': { status: 404, body: {} } })
    expect(b.result).not.toBe('pass')
  })
})

// ── 19-26. READY ─────────────────────────────────────────────────────────────

describe('19-26. production ready means READY, production AND promoted', () => {
  it('19. READY + production + PROMOTED → PASS', async () => {
    const e = await ready(GREEN)
    expect(e.result).toBe('pass')
    expect(e.detail.ready_substate).toBe('PROMOTED')
  })

  it('20. a READY PREVIEW deployment never satisfies production', async () => {
    const e = await ready({ ...GREEN, '/v13/deployments/': { body: detail({ target: 'preview' }) } })
    expect(e.result).toBe('fail')
    expect(String(e.observed)).toContain('not production')
  })

  it('21/22/23. BUILDING, QUEUED and INITIALIZING are retryable, not passes', async () => {
    for (const readyState of ['BUILDING', 'QUEUED', 'INITIALIZING']) {
      const e = await ready({ ...GREEN,
        '/v13/deployments/': { body: detail({ readyState, status: readyState, readySubstate: null }) } })
      expect(e.result, readyState).toBe('blocked')
      expect(e.detail.retryable, readyState).toBe(true)
    }
  })

  it('24/25. ERROR and CANCELED are findings, never retried', async () => {
    for (const readyState of ['ERROR', 'CANCELED']) {
      const e = await ready({ ...GREEN,
        '/v13/deployments/': { body: detail({ readyState, status: readyState, readySubstate: null }) } })
      expect(e.result, readyState).toBe('fail')
      expect(e.detail.retryable, readyState).toBeUndefined()
    }
  })

  it('26. READY but NOT promoted does not pass', async () => {
    // The build finished; it is not what production runs. Staged, not live.
    for (const readySubstate of [null, 'STAGED', undefined]) {
      const e = await ready({ ...GREEN, '/v13/deployments/': { body: detail({ readySubstate }) } })
      expect(e.result, String(readySubstate)).not.toBe('pass')
    }
  })
})

// ── 27-31. SHA ───────────────────────────────────────────────────────────────

describe('27-31. the deployed commit is compared to the MERGE commit', () => {
  it('27. exact equality passes', async () => {
    const e = await shaMatch(GREEN)
    expect(e.result).toBe('pass')
  })

  it('28. a mismatch fails with DEPLOY_SHA_MISMATCH', async () => {
    const e = await shaMatch({ ...GREEN,
      '/v13/deployments/': { body: detail({ meta: { githubCommitSha: OTHER } }) } })
    expect(e.result).toBe('fail')
    expect(e.detail.reason).toBe('DEPLOY_SHA_MISMATCH')
  })

  it('29. a missing deployed SHA fails closed', async () => {
    const e = await shaMatch({ ...GREEN, '/v13/deployments/': { body: detail({ meta: {} }) } })
    expect(e.result).not.toBe('pass')
  })

  it('30/31. neither the PR head SHA nor the attested pin can satisfy it', async () => {
    // Both are real, full, valid SHAs — and neither is what shipped.
    for (const wrong of [HEAD, OTHER]) {
      const e = await observeVercelDeployShaMatch(
        { mergeSha: wrong, prNumber: 62 }, NOW,
        { fetchImpl: fakeFetch(GREEN).impl })
      expect(e.result, wrong.slice(0, 8)).toBe('fail')
    }
    // And the module never reads the attested pin at all.
    const code = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/vercel-observation.ts'), 'utf8')
    expect(code).not.toContain('expectedMergeSha')
  })

  it('31b. a READY deployment on the wrong commit still fails the SHA check', async () => {
    // The failure that looks completely healthy from outside.
    const routes = { ...GREEN, '/v13/deployments/': { body: detail({ meta: { githubCommitSha: OTHER } }) } }
    expect((await ready(routes)).result).toBe('pass')       // genuinely READY
    expect((await shaMatch(routes)).result).toBe('fail')    // on the wrong thing
  })
})

// ── 32-39. ALIAS ─────────────────────────────────────────────────────────────

describe('32-39. the canonical domain must point at THIS deployment', () => {
  it('32. canonical domain + assigned + no error → PASS', async () => {
    const e = await alias(GREEN)
    expect(e.result).toBe('pass')
    expect(e.detail.canonical_domain).toBe(CANONICAL_PRODUCTION_DOMAIN)
  })

  it('33/34/35. a vercel.app alias, an unrelated domain, or no canonical → fail', async () => {
    for (const list of [
      ['familje-stunden-v2.vercel.app'],
      ['some-other-domain.se', 'familje-stunden-v2.vercel.app'],
      ['www.familje-stunden.se'],   // the www host is NOT the canonical one
      [],
    ]) {
      const e = await alias({ ...GREEN, '/v13/deployments/': { body: detail({ alias: list }) } })
      expect(e.result, JSON.stringify(list)).toBe('fail')
      expect(e.detail.reason).toBe('ALIAS_POINTS_TO_WRONG_DEPLOYMENT')
    }
  })

  it('36/37. aliasAssigned false or aliasError present → fail', async () => {
    const a = await alias({ ...GREEN, '/v13/deployments/': { body: detail({ aliasAssigned: false }) } })
    expect(a.result).toBe('fail')
    expect(a.detail.reason).toBe('ALIAS_MISSING')

    const b = await alias({ ...GREEN,
      '/v13/deployments/': { body: detail({ aliasError: { code: 'conflict' } }) } })
    expect(b.result).toBe('fail')
  })

  it('38. THE DEFECT — the listing never decides the alias verdict', async () => {
    // Measured against the live project: /v6/deployments returns no `alias`
    // field at all, healthy production deployments included. The predecessor
    // read it from there and would have failed a correct release.
    const f = fakeFetch({
      '/v6/deployments': { body: { deployments: [{ uid: UID }] } },   // no alias key
      '/v13/deployments/': { body: detail() },
    })
    const e = await observeVercelProductionAlias(ID, NOW, { fetchImpl: f.impl })
    expect(e.result).toBe('pass')
    // The verdict came from v13, which was actually consulted.
    expect(f.calls.some(c => c.url.includes('/v13/deployments/'))).toBe(true)
  })

  it('39. "has at least one alias" cannot satisfy the check', async () => {
    // Three aliases, none of them canonical. The old rule passed on count.
    const e = await alias({ ...GREEN, '/v13/deployments/': { body: detail({
      alias: ['a.vercel.app', 'b.vercel.app', 'c.vercel.app'] }) } })
    expect(e.result).toBe('fail')
    expect(e.detail.alias_count).toBe(3)
  })
})

// ── 40-47. TOKEN / SECRET SAFETY ─────────────────────────────────────────────

describe('40-47. the token never leaves the transport', () => {
  it('40. a missing token or project id → credential_missing, no request', async () => {
    for (const over of [{ FAMILJE_STUNDEN_VERCEL_TOKEN: '' },
                        { FAMILJE_STUNDEN_VERCEL_PROJECT_ID: '' }]) {
      vi.unstubAllEnvs(); configure(over)
      const spy = vi.fn()
      const r = await findProductionDeployment(MERGE, { fetchImpl: spy as unknown as typeof fetch })
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.failure).toBe('credential_missing')
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('41/42. 401 and 403 are terminal; 403 with rate-limit evidence is not', async () => {
    const a = await ready({ ...GREEN, '/v6/deployments': { status: 401, body: {} } })
    expect(a.result).toBe('blocked')
    expect(a.detail.retryable).toBe(false)

    const b = await ready({ ...GREEN, '/v6/deployments': { status: 403, body: {} } })
    expect(b.detail.failure).toBe('unauthorized')
    expect(b.detail.retryable).toBe(false)

    const c = await ready({ ...GREEN,
      '/v6/deployments': { status: 403, body: {}, headers: { 'x-ratelimit-remaining': '0' } } })
    expect(c.detail.failure).toBe('rate_limited')
    expect(c.detail.retryable).toBe(true)

    const d = await ready({ ...GREEN, '/v6/deployments': { status: 429, body: {} } })
    expect(d.detail.failure).toBe('rate_limited')
    expect(d.detail.retryable).toBe(true)
  })

  it('43/44/45. the token never appears in output, and never in a URL', async () => {
    const f = fakeFetch({ ...GREEN, '/v13/deployments/': { status: 500, body: {} } })
    const e = await observeVercelProductionReady(ID, NOW, { fetchImpl: f.impl })
    const serialized = JSON.stringify(e)
    expect(serialized).not.toContain(TOKEN)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('vcp_')
    expect(f.calls.every(c => !c.url.includes(TOKEN))).toBe(true)
    // The token travels in a header and only there.
    expect(f.calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('46/47. no logging, and no caught error is ever interpolated', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/vercel-observation.ts'), 'utf8')
    expect(src).not.toMatch(/console\.(log|info|warn|error|debug)/)
    // A fetch error can carry the request, and the request carries the header.
    expect(src).not.toMatch(/\$\{e\}|\$\{err|e\.message|String\(e\)|JSON\.stringify\(e/)
  })
})

// ── 48-58. GET-ONLY GOVERNANCE ───────────────────────────────────────────────

describe('48-58. the boundary, not the credential, is what makes this read-only', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const OBS = 'lib/workflows/adapters/familje-stunden/vercel-observation.ts'
  const HANDLER = 'lib/workflows/handlers/observe-vercel-release.ts'
  const KINDS = ['observe_vercel_production_ready', 'observe_vercel_deploy_sha_match',
                 'observe_vercel_production_alias'] as const

  it('48. exactly two GET endpoint families exist', () => {
    const code = strip(read(OBS))
    const urls = code.match(/`\/v\d+\/[^`]*`/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(u.startsWith('`/v6/deployments?') || u.startsWith('`/v13/deployments/')).toBe(true)
    }
  })

  it('49-52. no POST, PUT, PATCH or DELETE is reachable', () => {
    const code = strip(read(OBS)) + strip(read(HANDLER))
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(code, verb).not.toContain(verb)
    }
    // GET is hard-coded exactly once, in the one request function.
    expect((code.match(/method:\s*'GET'/g) ?? [])).toHaveLength(1)
  })

  it('53. no generic write-capable request helper exists', () => {
    const code = strip(read(OBS))
    // A `method` parameter is the shape that makes a write reachable later.
    expect(code).not.toMatch(/method\s*[:,)]\s*(string|method)/)
    expect(code).not.toMatch(/function\s+\w*request\s*\(/i)
    expect(code).not.toMatch(/\bmethod\?:/)
    // Every call goes through the single GET helper.
    expect((code.match(/fetchImpl \?\? fetch/g) ?? [])).toHaveLength(1)
  })

  it('54. no Vercel mutation endpoint string is present', () => {
    const code = strip(read(OBS)) + strip(read(HANDLER))
    // `/v13/deployments/{uid}` is the legitimate READ, so it is not listed —
    // these are the write endpoints a convenience edit would reach for.
    // PATH segments, not words: `PROMOTED` is Vercel's own readySubstate value
    // — the thing this check READS — while `/promote` is the endpoint that
    // performs a promotion. A bare-word guard would fire on the former and
    // push a future author to delete the check rather than keep the property.
    for (const m of ['/promote', '/redeploy', '/aliases', '/domains', '/env',
                     '/cancel', '/v9/projects', '/v2/files', '/v13/deployments`']) {
      expect(code.toLowerCase(), m).not.toContain(m.toLowerCase())
    }
  })

  it('55/56. all three are READ_ONLY and answer exactly one check each', () => {
    for (const k of KINDS) {
      expect(ACTION_REGISTRY[k].action_class, k).toBe('READ_ONLY')
      expect(ACTION_REGISTRY[k].executor_family, k).toBe('read_only_observation')
    }
    const answered = KINDS.map(k => checkAnsweredBy(k))
    expect(answered).toEqual([
      'vercel_production_ready', 'vercel_deploy_sha_matches_merge_sha', 'production_alias_attached'])
    expect(new Set(answered).size).toBe(3)
  })

  it('57/58. no database writer and no provider spend path is reachable', () => {
    const code = strip(read(OBS)) + strip(read(HANDLER))
    for (const forbidden of ['.insert(', '.upsert(', '.rpc(', 'createAdminClient',
                             'createClient', '@/lib/supabase', 'recordEvidence',
                             'appendTransition', 'reserveSpend', 'chargeSpend']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
    for (const m of code.match(/\w+\.from\(/g) ?? []) expect(m).toBe('Buffer.from(')
  })
})

// ── 59-62. REACHABILITY / READINESS ──────────────────────────────────────────

describe('59-62. reachability moved; readiness did not', () => {
  const bundle = () => {
    const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
    const def: WorkflowDef = { id: 'd', def_key: v.def_key, version: v.version,
      def_hash: v.def_hash, spec: v.spec, created_at: NOW }
    const instance: WorkflowInstance = {
      id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: v.version,
      def_hash: 'h', project_id: 'p', instance_key: '2099-01',
      current_state: 'frontend_deploy', status: 'active', wake_at: null,
      last_tick_at: null, last_tick_outcome: null, created_at: NOW, closed_at: null }
    const transitions: WorkflowTransition[] = [{ id: 't', seq: 1, instance_id: 'i',
      from_state: null, to_state: 'planning', reason: 't', actor: 't',
      evidence_ref: null, authorization_id: null, occurred_at: NOW }]
    return projectMonthReleaseBundle({
      month_key: '2099-01', def, instance, transitions, evidence: [],
      declaredChecks: FAMILJE_STUNDEN_CHECKS,
      readOnlyAnsweredCheckKeys: [
        'release_instant_computed', 'anonymous_protected_access_denied', 'release_gate_exists',
        'github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected',
        'vercel_production_ready', 'vercel_deploy_sha_matches_merge_sha', 'production_alias_attached'],
      githubRepository: 'Bumbi190/familje-stunden-v2', now: NOW,
    })
  }

  it('59/60. all three are EXECUTABLE — and still NOT_EXERCISED', () => {
    const b = bundle()
    for (const key of ['vercel_production_ready', 'vercel_deploy_sha_matches_merge_sha',
                       'production_alias_attached']) {
      const c = b.checks.find(x => x.check_key === key)!
      expect(c.reachability, key).toBe('EXECUTABLE')
      expect(c.status, key).toBe('NOT_EXERCISED')   // reachable ≠ answered
    }
  })

  it('61. readiness is unchanged with no evidence', () => {
    expect(bundle().readiness.product).toBe('BLOCKED')
  })

  it('62. a passive projection makes no request and reads no Vercel credential', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const b = bundle()
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify(b)).not.toContain(TOKEN)
    const proj = readFileSync(join(process.cwd(), 'lib/workflows/bundle/project.ts'), 'utf8')
    expect(proj).not.toContain('FAMILJE_STUNDEN_VERCEL')
    expect(proj).not.toMatch(/\bfetch\s*\(/)
  })
})

export { readDeployment }
