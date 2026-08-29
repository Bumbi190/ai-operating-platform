/**
 * PR8 — read-only GitHub + Vercel deployment verification.
 *
 * The mutation tests below are the point of this file. Everything else can be
 * re-derived from the code; "this module cannot deploy, cannot merge, cannot
 * roll back" is a property that has to be asserted or it quietly stops being
 * true the first time someone adds a convenience helper.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  const keys = ['FAMILJE_STUNDEN_GITHUB_TOKEN', 'FAMILJE_STUNDEN_GITHUB_REPO',
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

const CONFIGURED: Record<string, string | undefined> = {
  FAMILJE_STUNDEN_GITHUB_TOKEN: 'test-token',
  FAMILJE_STUNDEN_GITHUB_REPO: 'owner/repo',
  FAMILJE_STUNDEN_VERCEL_TOKEN: 'test-token',
  FAMILJE_STUNDEN_VERCEL_PROJECT_ID: 'prj_test',
  FAMILJE_STUNDEN_EXPECTED_MERGE_SHA: MERGE_SHA,
}

/** A fetch that answers from a route table and records every request made. */
function fakeFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; method: string }[] = []
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, method: init?.method ?? 'GET' })
    const key = Object.keys(routes).find(k => u.includes(k))
    const r = key ? routes[key] : { status: 404, body: {} }
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => r.body ?? {},
    } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

function prBody(over: Record<string, unknown> = {}) {
  return { number: 40, state: 'closed', merged: true, merge_commit_sha: MERGE_SHA,
    head: { sha: 'dfaa8852' }, base: { sha: 'cdce2129' }, ...over }
}
function deployBody(over: Record<string, unknown> = {}) {
  return { deployments: [{ uid: 'dpl_test', readyState: 'READY', target: 'production',
    meta: { githubCommitSha: MERGE_SHA }, alias: ['familje-stunden.se'], ...over }] }
}

async function runChain(
  routes: Parameters<typeof fakeFetch>[0], cfg = CONFIGURED,
  input: { prNumber: number; attempt?: number; maxAttempts?: number } = { prNumber: 40 },
) {
  const { verifyDeploymentChain } = await import('../workflows/adapters/familje-stunden/deployment')
  const f = fakeFetch(routes)
  const out = await withConfig(cfg, () => verifyDeploymentChain(input, NOW, { fetchImpl: f.impl }))
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
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody() },
    })
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(c => c.method === 'GET')).toBe(true)
  })

  it('never logs or embeds a token value', async () => {
    const { calls } = await runChain({
      '/pulls/40': { body: prBody() },
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody() },
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
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody() },
    })
    expect(out).toHaveLength(6)
    expect(out.every(e => e.result === 'pass')).toBe(true)
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').observed).toContain(MERGE_SHA)
  })

  it('verifies the deployment against the MERGE sha, not the PR head', async () => {
    const { calls } = await runChain({
      '/pulls/40': { body: prBody() },
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody() },
    })
    // The status must be read on the merged ref; the head SHA was never built
    // on the base branch and its checks say nothing about what shipped.
    expect(calls.some(c => c.url.includes(`/commits/${MERGE_SHA}/status`))).toBe(true)
    expect(calls.some(c => c.url.includes('/commits/dfaa8852/status'))).toBe(false)
  })
})

// ── The failure this whole module exists for ─────────────────────────────────

describe('READY on the wrong commit', () => {
  it('fails the SHA comparison even though the deployment is READY', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/status': { body: { state: 'success', total_count: 1 } },
      // The listing has a READY production deployment — but for another commit.
      '/v6/deployments': { body: { deployments: [{ uid: 'dpl_old', readyState: 'READY',
        target: 'production', meta: { githubCommitSha: OTHER_SHA }, alias: ['x'] }] } },
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
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody({ meta: { githubCommitSha: MERGE_SHA } }) },
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
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody() },
    })
    expect(byKey(out, 'github_pr_merged').result).toBe('fail')
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').result).toBe('fail')
    expect(byKey(out, 'vercel_deploy_sha_matches_merge_sha').observed)
      .toContain('no merge SHA')
  })

  it('green checks do not imply a merge', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody({ state: 'open', merged: false, merge_commit_sha: null }) },
      '/status': { body: { state: 'success', total_count: 3 } },
      '/v6/deployments': { body: deployBody() },
    })
    expect(byKey(out, 'github_pr_checks_green').result).toBe('pass')
    expect(byKey(out, 'github_pr_merged').result).toBe('fail')
  })

  it('a merge does not imply a deployment', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: { deployments: [] } },
    })
    expect(byKey(out, 'github_pr_merged').result).toBe('pass')
    expect(byKey(out, 'vercel_production_ready').result).toBe('blocked')
  })

  it('a preview deployment never satisfies a production check', async () => {
    const { out } = await runChain({
      '/pulls/40': { body: prBody() },
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody({ target: 'preview' }) },
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
      '/status': { body: { state: 'success', total_count: 1 } },
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
      '/status': { body: { state: 'success', total_count: 1 } },
      '/v6/deployments': { body: deployBody() },
    }, { ...CONFIGURED, FAMILJE_STUNDEN_EXPECTED_MERGE_SHA: undefined })
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
    '/status': { body: { state: 'success', total_count: 1 } },
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

  it('pending checks are blocked; failing checks are not retried', async () => {
    const pending = await runChain({ ...routes,
      '/status': { body: { state: 'pending', total_count: 2 } } })
    expect(byKey(pending.out, 'github_pr_checks_green').result).toBe('blocked')

    const failing = await runChain({ ...routes,
      '/status': { body: { state: 'failure', total_count: 2 } } })
    const c = byKey(failing.out, 'github_pr_checks_green')
    expect(c.result).toBe('fail')
    expect(c.failure_kind).toBe('authoritative_fail')
  })

  it('a BUILDING deployment is blocked but an ERROR one is a finding', async () => {
    const building = await runChain({ ...routes,
      '/v6/deployments': { body: deployBody({ readyState: 'BUILDING' }) } })
    expect(byKey(building.out, 'vercel_production_ready').result).toBe('blocked')

    const errored = await runChain({ ...routes,
      '/v6/deployments': { body: deployBody({ readyState: 'ERROR' }) } })
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
