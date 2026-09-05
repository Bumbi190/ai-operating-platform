/**
 * PR8 — read-only GitHub + Vercel deployment verification.
 *
 * The mutation tests below are the point of this file. Everything else can be
 * re-derived from the code; "this module cannot deploy, cannot merge, cannot
 * roll back" is a property that has to be asserted or it quietly stops being
 * true the first time someone adds a convenience helper.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { join } from 'node:path'

import { __resetInstallationTokenCache }
  from '../workflows/adapters/familje-stunden/github-app-auth'

// A cached installation token would let one test's mint answer another's.
beforeEach(() => { __resetInstallationTokenCache() })

const SRC = join(process.cwd(), 'lib/workflows/adapters/familje-stunden/deployment.ts')
const source = readFileSync(SRC, 'utf8')

/**
 * The mutation guards below scan CODE, not prose. The module's own comments name
 * the capabilities it deliberately lacks ("rollback", "promotion", "deploy"), and
 * a guard that fired on the documentation would push a future author to delete
 * the explanation rather than keep the property — so comments are stripped and
 * the assertions get stricter, not looser.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

const MERGE_SHA = 'da44cb0aa03d36e513dd0ff2e1dd998345b02426'
const OTHER_SHA = '1111111111111111111111111111111111111111'
const NOW = '2026-08-29T12:00:00.000Z'

/** Every configuration value the module reads, so tests state their world. */
async function withConfig<T>(
  cfg: Record<string, string | undefined>, fn: () => Promise<T>,
): Promise<T> {
  const keys = ['FAMILJE_STUNDEN_GITHUB_APP_ID', 'FAMILJE_STUNDEN_GITHUB_INSTALLATION_ID',
    'FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY', 'FAMILJE_STUNDEN_GITHUB_REPO',
    'FAMILJE_STUNDEN_VERCEL_TOKEN', 'FAMILJE_STUNDEN_VERCEL_PROJECT_ID',
    'FAMILJE_STUNDEN_VERCEL_TEAM_ID', 'FAMILJE_STUNDEN_RELEASE_PR',
    'FAMILJE_STUNDEN_EXPECTED_MERGE_SHA']
  const prev: Record<string, string | undefined> = {}
  for (const k of keys) { prev[k] = process.env[k]; delete process.env[k] }
  for (const [k, v] of Object.entries(cfg)) if (v !== undefined) process.env[k] = v
  try { return await fn() } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]
    }
  }
}

/**
 * A SYNTHETIC key pair, generated per run. The production PEM is never read by
 * a test: a test that needs the real private key is a test that can leak it.
 */
const { privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const CONFIGURED: Record<string, string | undefined> = {
  FAMILJE_STUNDEN_GITHUB_APP_ID: '123456',
  FAMILJE_STUNDEN_GITHUB_INSTALLATION_ID: '7890123',
  FAMILJE_STUNDEN_GITHUB_APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
  FAMILJE_STUNDEN_GITHUB_REPO: 'owner/repo',
  FAMILJE_STUNDEN_VERCEL_TOKEN: 'vcp_test_project_scoped',
  FAMILJE_STUNDEN_VERCEL_PROJECT_ID: 'prj_test',
  FAMILJE_STUNDEN_EXPECTED_MERGE_SHA: MERGE_SHA,
}

/** A fetch that answers from a route table and records every request made. */
function fakeFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; method: string }[] = []
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, method: init?.method ?? 'GET' })
    // Authentication, answered for every route table: minting an installation
    // token is the one POST in the whole call graph.
    if (u.includes('/access_tokens')) {
      return {
        ok: true, status: 201,
        headers: { get: () => null },
        json: async () => ({
          token: 'ghs_test_installation_token',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
      } as unknown as Response
    }
    const key = Object.keys(routes).find(k => u.includes(k))
    const r = key ? routes[key] : { status: 404, body: {} }
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (h: string) => (h.toLowerCase() === 'link' ? null : null) },
      json: async () => r.body ?? {},
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

function prBody(over: Record<string, unknown> = {}) {
  // `base.repo.full_name` is load-bearing: the reader refuses a pull request
  // that does not belong to the canonical repository rather than interpreting it.
  return { number: 40, state: 'closed', merged: true, merge_commit_sha: MERGE_SHA,
    head: { sha: HEAD_SHA }, base: { sha: 'cdce2129', repo: { full_name: 'owner/repo' } },
    ...over }
}
const HEAD_SHA = 'dfaa8852'

/**
 * The COMBINED commit-status shape GitHub actually returns: a top-level `sha`
 * and one entry per context. The old fixtures carried only `{state,
 * total_count}` because the old evaluator read only those two fields — which is
 * precisely how two of three required signals stayed invisible.
 */
function statusBody(state = 'success', _sha: string = HEAD_SHA) {
  // The RAW /statuses list. The combined /status rollup is no longer read: it
  // strips `creator`, so it cannot support producer binding.
  return [{ context: 'Vercel', state,
            created_at: '2026-08-29T11:00:00Z', updated_at: '2026-08-29T11:00:00Z',
            creator: { id: 35613825, login: 'vercel[bot]', type: 'Bot' } }]
}
/** Check runs from the trusted producers, on the HEAD commit. */
function checkRunsBody(over: { supabase?: string | null; comments?: string | null } = {}) {
  const run = (name: string, appId: number, conclusion: string | null) => ({
    name, app: { id: appId }, status: conclusion === null ? 'in_progress' : 'completed',
    conclusion, head_sha: HEAD_SHA,
    started_at: '2026-08-29T11:00:00Z', completed_at: '2026-08-29T11:00:30Z',
  })
  return { total_count: 2, check_runs: [
    run('Supabase Preview', 330661, over.supabase === undefined ? 'success' : over.supabase),
    run('Vercel Preview Comments', 8329, over.comments === undefined ? 'success' : over.comments),
  ] }
}

/**
 * The LISTING now resolves one id and nothing else — it does not populate
 * `alias`, which is why reading the verdict from it was the defect.
 */
function deployBody(over: Record<string, unknown> = {}) {
  return { deployments: [{ uid: 'dpl_test', ...over }] }
}

/** The v13 record: the authority for every field the three checks read. */
function deployDetail(over: Record<string, unknown> = {}) {
  return {
    uid: 'dpl_test', readyState: 'READY', status: 'READY', readySubstate: 'PROMOTED',
    target: 'production', source: 'git',
    meta: { githubCommitSha: MERGE_SHA },
    alias: ['familje-stunden.se', 'familje-stunden-v2.vercel.app'],
    aliasAssigned: true, aliasError: null,
    ...over,
  }
}

async function runChain(
  routes: Parameters<typeof fakeFetch>[0], cfg = CONFIGURED,
  input: { prNumber: number; expectedMergeSha?: string | null; attempt?: number; maxAttempts?: number } =
    { prNumber: 40, expectedMergeSha: MERGE_SHA },
) {
  const { verifyDeploymentChain } = await import('../workflows/adapters/familje-stunden/deployment')
  const f = fakeFetch(routes)
  const out = await withConfig(cfg, () => verifyDeploymentChain(
    { expectedMergeSha: MERGE_SHA, ...input }, NOW, { fetchImpl: f.impl }))
  return { out, calls: f.calls }
}

const byKey = (out: Awaited<ReturnType<typeof runChain>>['out'], k: string) =>
  out.find(e => e.check_key === k)!

// ── Negative architecture ────────────────────────────────────────────────────

describe('deployment verification cannot mutate anything', () => {
  // Named individually because each is a distinct capability someone might add
  // "just for convenience" and each would break the read-only guarantee.
  it('MUTATION TEST — cannot merge a pull request', () => {
    expect(code).not.toMatch(/\/merge\b/)
    expect(code).not.toMatch(/\bmerge_method\b/)
    expect(code.toLowerCase()).not.toMatch(/pulls\/\$\{[^}]*\}\/merge/)
  })

  it('MUTATION TEST — cannot trigger a deployment', () => {
    expect(code).not.toMatch(/\/v13\/deployments/)       // the create endpoint
    expect(code).not.toMatch(/\bpromote\b/i)
    expect(code).not.toMatch(/workflow.*dispatch/i)
    // The one place a write could hide: every URL template in the code.
    for (const url of code.match(/`\$\{(?:GITHUB_API|VERCEL_API)\}[^`]*`/g) ?? []) {
      expect(url).not.toMatch(/merge|deploy(?!ments\?)|alias|promote|cancel/i)
    }
  })

  it('MUTATION TEST — cannot roll back or reassign an alias', () => {
    expect(code).not.toMatch(/\brollback\b/i)
    expect(code).not.toMatch(/\/v2\/aliases/)
    expect(code).not.toMatch(/\bredeploy\b/i)
  })

  it('issues no request method other than GET', () => {
    const methods = [...code.matchAll(/method:\s*'(\w+)'/g)].map(m => m[1])
    expect(methods.length).toBeGreaterThan(0)
    expect([...new Set(methods)]).toEqual(['GET'])
  })

  it('never writes to Familje-Stunden and never sends release communications', () => {
    expect(code).not.toMatch(/month_releases/)
    expect(code).not.toMatch(/service_role/)
    expect(code).not.toMatch(/sendEmail|sendMail|resend|notify\(/i)
  })

  it('proves it at runtime: a full verification run issues only GETs', async () => {
    const { calls } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    expect(calls.length).toBeGreaterThan(0)
    // Every REPOSITORY request is a GET. The single POST in the whole call
    // graph mints an installation token — authentication, which changes nothing
    // in the repository — and it is named here so a second POST cannot slip in
    // behind a relaxed assertion.
    const posts = calls.filter(c => c.method !== 'GET')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toContain('/access_tokens')
    expect(calls.filter(c => c.url.includes('/repos/')).every(c => c.method === 'GET')).toBe(true)
  })

  it('never logs or embeds a token value', async () => {
    const { calls } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    // A token in a URL is a token in a log, a proxy and a browser history.
    expect(calls.every(c => !c.url.includes('test-token'))).toBe(true)
    expect(code).not.toMatch(/console\.(log|info|warn|error)/)
  })
})

// ── The happy chain ──────────────────────────────────────────────────────────

describe('a complete, correct chain', () => {
  it('passes every link when merge SHA and deployed SHA agree', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    expect(out).toHaveLength(6)
    // All six now pass: the GitHub App can read BOTH check systems, so the
    // sixth link is answerable for the first time. It became green by being
    // read, not by being relaxed — the producer-bound policy is unchanged.
    expect(out.every(e => e.result === 'pass')).toBe(true)
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').observed).toContain(MERGE_SHA)
  })

  it('compares the DEPLOYMENT to the merge SHA, but reads CI on the PR HEAD', async () => {
    const { calls, out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    // Two different commits, deliberately. What SHIPPED is the merge commit, so
    // the deployment comparison is made against it and nothing else.
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').observed).toContain(MERGE_SHA)
    // CI, however, belongs to the PR head. Audited across five merged
    // Familje-Stunden pull requests: the merge commit never receives the
    // `Vercel Preview Comments` check run, so a required set pinned to it can
    // never be complete.
    expect(calls.some(c => c.url.includes(`/commits/${HEAD_SHA}/status`))).toBe(true)
    expect(calls.some(c => c.url.includes(`/commits/${MERGE_SHA}/status`))).toBe(false)
  })
})

// ── The failure this whole module exists for ─────────────────────────────────

describe('READY on the wrong commit', () => {
  it('fails the SHA comparison even though the deployment is READY', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      // The listing has a READY production deployment — but for another commit.
      // The sha= filter is server-side now, so a deployment for another commit
      // simply is not returned: the listing comes back empty.
      '/v6/deployments': { body: { deployments: [] } },
    })
    // No deployment for the merge SHA exists, so the whole Vercel half is not
    // satisfied — a healthy-looking unrelated deployment must not stand in.
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').result).not.toBe('pass')
    expect(byKey(out, 'vercel_production_ready').result).not.toBe('pass')
  })

  it('reports both SHAs so an operator can see the divergence', async () => {
    const { verifyDeploymentChain } = await import('../workflows/adapters/familje-stunden/deployment')
    // A deployment tagged with the merge SHA in the listing, but whose own
    // metadata disagrees, is the adversarial shape: the lookup finds it and the
    // comparison must still be made independently rather than assumed.
    const f = fakeFetch({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    const out = await withConfig(CONFIGURED,
      () => verifyDeploymentChain({ prNumber: 40 }, NOW, { fetchImpl: f.impl }))
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').result).toBe('pass')
  })

  it('is CRITICAL, not a normal finding', async () => {
    const { CRITICAL_CHECK_KEYS } = await import('../workflows/escalation')
    expect(CRITICAL_CHECK_KEYS).toContain('vercel_deploy_sha_matches_merge_sha')
    expect(CRITICAL_CHECK_KEYS).toContain('production_alias_attached')
  })
})

// ── Each link stands alone ───────────────────────────────────────────────────

describe('no link is inferred from another', () => {
  it('an unmerged PR does not yield a merge SHA or a deployment pass', async () => {
    const { out } = await runChain({
      // GitHub populates merge_commit_sha speculatively on OPEN pull requests.
      // Trusting it would verify a deployment of a commit that never landed.
      '/pulls/40': { body: prBody({ state: 'open', merged: false, merge_commit_sha: OTHER_SHA }) },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    expect(byKey(out, 'github_pr_merged').result).toBe('fail')
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').result).toBe('fail')
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').observed)
      .toContain('no merge SHA')
  })

  it('green checks do not imply a merge', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody({ state: 'open', merged: false, merge_commit_sha: null }) },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    })
    // Every required CI signal is green on the head commit — and the pull
    // request is still open. One says nothing about the other.
    expect(byKey(out, 'github_pr_checks_green').result).toBe('pass')
    expect(byKey(out, 'github_pr_merged').result).toBe('fail')
  })

  it('a merge does not imply a deployment', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: { deployments: [] } },
    })
    expect(byKey(out, 'github_pr_merged').result).toBe('pass')
    expect(byKey(out, 'vercel_production_ready').result).toBe('blocked')
  })

  it('a preview deployment never satisfies a production check', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail({ target: 'preview' }) },
    })
    expect(byKey(out, 'vercel_production_ready').result).toBe('fail')
    expect(byKey(out, 'vercel_production_ready').observed).toContain('not production')
  })
})

// ── The pin ──────────────────────────────────────────────────────────────────

describe('the expected merge SHA is an independent pin', () => {
  it('fails when the merged commit is not the approved one', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody({ merge_commit_sha: OTHER_SHA }) },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: { deployments: [] } },
    }, { ...CONFIGURED, FAMILJE_STUNDEN_EXPECTED_MERGE_SHA: MERGE_SHA })
    const pin = byKey(out, 'github_merge_sha_matches_expected')
    expect(pin.result).toBe('fail')
    expect(pin.observed).toContain(OTHER_SHA)
    expect(pin.observed).toContain(MERGE_SHA)
  })

  it('is blocked, not passed, when nothing is pinned', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail() },
    }, CONFIGURED, { prNumber: 40, expectedMergeSha: null })
    // Nothing to compare against. Never PASS: a comparison with no right-hand
    // side proves nothing, and the pin is the instance's, not the deployment's.
    expect(byKey(out, 'github_merge_sha_matches_expected').result).toBe('blocked')
  })
})

// ── Fail closed ──────────────────────────────────────────────────────────────

describe('no credential means blocked, never pass', () => {
  it('blocks every check when GitHub is unconfigured', async () => {
    const { out } = await runChain({}, { FAMILJE_STUNDEN_VERCEL_TOKEN: 't',
      FAMILJE_STUNDEN_VERCEL_PROJECT_ID: 'p' })
    expect(out).toHaveLength(6)
    expect(out.some(e => e.result === 'pass')).toBe(false)
    expect(byKey(out, 'github_pr_merged').failure_kind).toBe('credential_missing')
  })

  it('treats a refused credential as blocked and NOT retryable', async () => {
    const { isRetryableReadFailure } = await import('../workflows/adapters/familje-stunden/deployment')
    const { out } = await runChain({ '/pulls/40': { status: 403 } })
    expect(byKey(out, 'github_pr_merged').result).toBe('blocked')
    // Retrying a request that was refused for lack of authority is how a retry
    // storm starts, and the answer never changes without an operator.
    expect(isRetryableReadFailure('unauthorized')).toBe(false)
    expect(isRetryableReadFailure('credential_missing')).toBe(false)
    expect(isRetryableReadFailure('network_timeout')).toBe(true)
  })

  it('reports the whole verification blocked with no release PR configured', async () => {
    const { verifyReleaseDeployment } = await import('../workflows/adapters/familje-stunden/deployment')
    const out = await withConfig({ ...CONFIGURED, FAMILJE_STUNDEN_RELEASE_PR: undefined },
      () => verifyReleaseDeployment(NOW))
    expect(out).toHaveLength(6)
    expect(out.every(e => e.result === 'blocked')).toBe(true)
  })
})

// ── Retry budget ─────────────────────────────────────────────────────────────

describe('eventual consistency is bounded, and mismatch is not retried', () => {
  const routes = {
    '/pulls/40': { body: prBody() },
    '/statuses': { body: statusBody() },
      '/check-runs': { body: checkRunsBody() },
    '/v6/deployments': { body: { deployments: [] } },
  }

  it('an unindexed deployment is retryable early', async () => {
    const { out } = await runChain(routes, CONFIGURED, { prNumber: 40, attempt: 1, maxAttempts: 5 })
    const c = byKey(out, 'vercel_production_ready')
    expect(c.result).toBe('blocked')
    expect((c.detail as { retryable: boolean }).retryable).toBe(true)
  })

  it('becomes a real finding once the budget is spent', async () => {
    const { out } = await runChain(routes, CONFIGURED, { prNumber: 40, attempt: 5, maxAttempts: 5 })
    const c = byKey(out, 'vercel_production_ready')
    expect(c.result).toBe('fail')          // no longer "we could not look"
    expect((c.detail as { retryable: boolean }).retryable).toBe(false)
  })

  it('no commit-status state alone can answer the CI check', async () => {
    // pending, failure AND success. The half-read authority dominates all three:
    // the required Check Runs were never consulted, so there is no verdict to
    // give — and crucially `success` does not become one.
    for (const state of ['pending', 'failure', 'success']) {
      // The check-runs source is deliberately absent from this route table, so
      // it 404s: a half-read authority, which is what the assertion is about.
      const r = await runChain({ ...routes, '/statuses': { body: statusBody(state) },
        '/check-runs': { status: 503, body: {} } })
      const c = byKey(r.out, 'github_pr_checks_green')
      expect(c.result, state).not.toBe('pass')
      expect(c.result, state).toBe('blocked')
      expect(String((c.detail as { sources: string }).sources)).toContain('check_runs=false')
    }
  })

  it('a BUILDING deployment is blocked but an ERROR one is a finding', async () => {
    const building = await runChain({ ...routes,
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail({ readyState: 'BUILDING', readySubstate: null }) } })
    expect(byKey(building.out, 'vercel_production_ready').result).toBe('blocked')

    const errored = await runChain({ ...routes,
      '/v6/deployments': { body: deployBody() },
      '/v13/deployments/': { body: deployDetail({ readyState: 'ERROR', readySubstate: null }) } })
    expect(byKey(errored.out, 'vercel_production_ready').result).toBe('fail')
  })
})

// ── Catalogue wiring ─────────────────────────────────────────────────────────

describe('catalogue and adapter wiring', () => {
  it('declares all six chain checks as automated-only', async () => {
    const { FAMILJE_STUNDEN_CHECKS } = await import(
      '../workflows/adapters/familje-stunden/checks')
    for (const key of ['github_pr_merged', 'github_pr_checks_green',
      'github_merge_sha_matches_expected', 'vercel_production_ready',
      'vercel_deploy_sha_matches_merge_sha', 'production_alias_attached']) {
      const decl = FAMILJE_STUNDEN_CHECKS.filter(c => c.check_key === key)
      expect(decl.length).toBeGreaterThan(0)
      // A human cannot attest which commit Vercel is serving. Only Vercel knows.
      for (const d of decl) expect(d.allowed_provenance).toEqual(['automated'])
    }
  })

  it('re-checks the deployed SHA after approval and after release', async () => {
    const { FAMILJE_STUNDEN_CHECKS } = await import(
      '../workflows/adapters/familje-stunden/checks')
    const states = FAMILJE_STUNDEN_CHECKS
      .filter(c => c.check_key === 'vercel_deploy_sha_matches_merge_sha')
      .map(c => c.state)
    // A rollback or redeploy after approval would otherwise never be noticed.
    expect(states).toContain('frontend_deploy')
    expect(states).toContain('approval_release')
    expect(states).toContain('post_release_qa')
  })

  it('keeps the frontend chain separate from Edge Function verification', async () => {
    const idx = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/index.ts'), 'utf8')
    // Vercel deploys the frontend and never touches the Edge Functions, so a
    // green Vercel deployment says nothing about the protected manifest.
    expect(idx).toMatch(/edge_deploy:[\s\S]*?verifyDeployedSource/)
    expect(idx).toMatch(/frontend_deploy:[\s\S]*?verifyReleaseDeployment/)
  })
})
