/**
 * GitHub release binding — which release does THIS month refer to?
 *
 * The tests that matter most are the ones asserting what binding does NOT do:
 * it never falls back to a deployment-global env value, never leaks across
 * instances, and never makes a GitHub check pass. A stale October pin silently
 * satisfying November's comparison is the failure this exists to prevent, and it
 * would look like a healthy PASS.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import {
  projectGithubBinding, GITHUB_BINDING_CHECKS, GITHUB_BINDING_STATE,
} from '../workflows/bundle/github-binding'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import type { WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition } from '../workflows/types'

const NOW = '2026-09-03T12:00:00.000Z'
const REPO = 'Bumbi190/familje-stunden-v2'
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

function bind(
  instanceId: string, key: string, value: unknown, recorded = NOW,
): WorkflowEvidence {
  return {
    id: `${instanceId}-${key}-${recorded}`, instance_id: instanceId,
    state: GITHUB_BINDING_STATE, check_key: key, result: 'pass', source: 'attested',
    detail: { value }, recorded_at: recorded, producer: 'editor', producer_type: 'human',
    observed_at: recorded, payload_hash: null, target_hash: null, attestation: {},
  }
}

afterEach(() => { vi.unstubAllEnvs() })

// ── 1-11. instance binding ───────────────────────────────────────────────────

describe('1-5. the binding belongs to one instance', () => {
  it('1/4. a PR number and expected SHA bind together', () => {
    const b = projectGithubBinding([
      bind('oct', GITHUB_BINDING_CHECKS.prNumber, 59),
      bind('oct', GITHUB_BINDING_CHECKS.expectedMergeSha, SHA_A),
    ], REPO)
    expect(b.pr_number).toBe(59)
    expect(b.expected_merge_sha).toBe(SHA_A)
    expect(b.binding_status).toBe('BOUND')
    expect(b.repository).toBe(REPO)
  })

  it('2/5. a different month carries a different, independent binding', () => {
    const oct = projectGithubBinding([
      bind('oct', GITHUB_BINDING_CHECKS.prNumber, 59),
      bind('oct', GITHUB_BINDING_CHECKS.expectedMergeSha, SHA_A),
    ], REPO)
    const nov = projectGithubBinding([
      bind('nov', GITHUB_BINDING_CHECKS.prNumber, 72),
      bind('nov', GITHUB_BINDING_CHECKS.expectedMergeSha, SHA_B),
    ], REPO)
    expect(oct.pr_number).not.toBe(nov.pr_number)
    expect(oct.expected_merge_sha).not.toBe(nov.expected_merge_sha)
  })

  it('3. one instance cannot see another instance evidence', () => {
    // The caller passes evidence already scoped to one instance. The projection
    // holds no client and no query, so cross-instance reads are impossible by
    // construction — proven here by giving it only October's rows.
    const octOnly = [bind('oct', GITHUB_BINDING_CHECKS.prNumber, 59)]
    const b = projectGithubBinding(octOnly, REPO)
    expect(b.pr_number).toBe(59)
    expect(JSON.stringify(b)).not.toContain('72')
  })
})

describe('6-9. malformed and missing values fail safely', () => {
  it('6. a malformed PR number is INVALID, never coerced', () => {
    for (const bad of ['59', 59.5, 0, -1, true, {}, []]) {
      const b = projectGithubBinding([bind('i', GITHUB_BINDING_CHECKS.prNumber, bad)], REPO)
      expect(b.pr_number, JSON.stringify(bad)).toBeNull()
      expect(b.binding_status).toBe('INVALID')
      expect(b.invalid_fields).toContain(GITHUB_BINDING_CHECKS.prNumber)
    }
  })

  it('7. a malformed SHA is INVALID — abbreviations are refused as ambiguous', () => {
    for (const bad of ['abc', SHA_A.slice(0, 7), SHA_A.toUpperCase(), 'z'.repeat(40), 123]) {
      const b = projectGithubBinding([bind('i', GITHUB_BINDING_CHECKS.expectedMergeSha, bad)], REPO)
      expect(b.expected_merge_sha, String(bad)).toBeNull()
      expect(b.binding_status).toBe('INVALID')
    }
  })

  it('8/9. missing values stay missing', () => {
    expect(projectGithubBinding([], REPO).binding_status).toBe('MISSING')
    const partial = projectGithubBinding([bind('i', GITHUB_BINDING_CHECKS.prNumber, 59)], REPO)
    expect(partial.binding_status).toBe('PARTIAL')
    expect(partial.expected_merge_sha).toBeNull()
  })

  it('INVALID outranks PARTIAL — a bad pin is worse than an absent one', () => {
    const b = projectGithubBinding([
      bind('i', GITHUB_BINDING_CHECKS.prNumber, 59),
      bind('i', GITHUB_BINDING_CHECKS.expectedMergeSha, 'nope'),
    ], REPO)
    expect(b.binding_status).toBe('INVALID')
  })
})

describe('10-11. nothing is inferred', () => {
  const src = readFileSync(join(process.cwd(), 'lib/workflows/bundle/github-binding.ts'), 'utf8')
  const code = src.split('\n')
    .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
    .join('\n')

  it('10/11. no "latest PR" or "latest main" inference exists', () => {
    for (const forbidden of ['latest', 'sort(', 'head', 'default_branch', 'main']) {
      expect(code.toLowerCase(), forbidden).not.toContain(`"${forbidden}"`)
    }
    expect(code).not.toContain('api.github.com')
    expect(code).not.toMatch(/\bfetch\s*\(/)
  })
})

// ── 12-14. the global env cannot substitute ──────────────────────────────────

describe('12-14. no global-env fallback, no repository override', () => {
  it('12/13. a global env PR/SHA cannot fill a missing instance binding', () => {
    vi.stubEnv('FAMILJE_STUNDEN_RELEASE_PR', '59')
    vi.stubEnv('FAMILJE_STUNDEN_EXPECTED_MERGE_SHA', SHA_A)
    const b = projectGithubBinding([], REPO)
    expect(b.pr_number).toBeNull()
    expect(b.expected_merge_sha).toBeNull()
    expect(b.binding_status).toBe('MISSING')
  })

  it('the module cannot read the environment at all', () => {
    // Comments stripped: the module's header explains that it reads no env var
    // and names the two it refuses to fall back to. A naive substring search
    // would fail on that documentation, and deleting it to please a test is the
    // wrong trade.
    const src = readFileSync(join(process.cwd(), 'lib/workflows/bundle/github-binding.ts'), 'utf8')
    const code = src.split('\n')
      .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
      .join('\n')
    expect(code).not.toContain('process.env')
    expect(code).not.toContain('FAMILJE_STUNDEN_RELEASE_PR')
    expect(code).not.toContain('FAMILJE_STUNDEN_EXPECTED_MERGE_SHA')
  })

  it('14. the repository comes from configuration, never from evidence', () => {
    // Evidence claiming a repository must be ignored entirely.
    const b = projectGithubBinding(
      [bind('i', 'repository', 'attacker/evil'), bind('i', GITHUB_BINDING_CHECKS.prNumber, 1)],
      REPO)
    expect(b.repository).toBe(REPO)
    const route = readFileSync(join(process.cwd(), 'app/api/workflows/bundle/route.ts'), 'utf8')
    expect(route).toContain('FAMILJE_STUNDEN_GITHUB_REPO')
    // The repository is never taken from the request.
    expect(route).not.toMatch(/searchParams\.get\(\s*['"]repo/)
  })
})

// ── Rebinding ────────────────────────────────────────────────────────────────

describe('rebinding is append-only and auditable', () => {
  it('the newest recorded value wins, and history is not mutated', () => {
    const b = projectGithubBinding([
      bind('i', GITHUB_BINDING_CHECKS.prNumber, 59, '2026-09-01T00:00:00.000Z'),
      bind('i', GITHUB_BINDING_CHECKS.prNumber, 72, '2026-09-02T00:00:00.000Z'),
    ], REPO)
    expect(b.pr_number).toBe(72)
  })

  it('a malformed replacement does not silently keep the old value', () => {
    const b = projectGithubBinding([
      bind('i', GITHUB_BINDING_CHECKS.prNumber, 59, '2026-09-01T00:00:00.000Z'),
      bind('i', GITHUB_BINDING_CHECKS.prNumber, 'seventy-two', '2026-09-02T00:00:00.000Z'),
    ], REPO)
    expect(b.pr_number).toBeNull()
    expect(b.binding_status).toBe('INVALID')
  })
})

// ── 15-22. bundle integration ────────────────────────────────────────────────

function realDef(): WorkflowDef {
  const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
  return { id: 'd', def_key: v.def_key, version: v.version, def_hash: v.def_hash, spec: v.spec, created_at: NOW }
}
const instance = (): WorkflowInstance => ({
  id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1, def_hash: 'h',
  project_id: 'p', instance_key: '2099-01', current_state: 'frontend_deploy', status: 'active',
  wake_at: null, last_tick_at: null, last_tick_outcome: null, created_at: NOW, closed_at: null,
})
const transitions: WorkflowTransition[] = [{
  id: 't', seq: 1, instance_id: 'i', from_state: null, to_state: 'planning',
  reason: 't', actor: 't', evidence_ref: null, authorization_id: null, occurred_at: NOW,
}]
const proj = (evidence: WorkflowEvidence[] = [], repo: string | null = REPO) =>
  projectMonthReleaseBundle({
    month_key: '2099-01', def: realDef(), instance: instance(), transitions, evidence,
    declaredChecks: FAMILJE_STUNDEN_CHECKS,
    readOnlyAnsweredCheckKeys: ['release_instant_computed', 'anonymous_protected_access_denied', 'release_gate_exists'],
    githubRepository: repo, now: NOW,
  })

describe('15-22. the bundle projects binding without satisfying anything', () => {
  const bound = [
    bind('i', GITHUB_BINDING_CHECKS.prNumber, 59),
    bind('i', GITHUB_BINDING_CHECKS.expectedMergeSha, SHA_A),
  ]

  it('15/16. bound PR number and expected SHA are projected', () => {
    const g = proj(bound).technical.github
    expect(g.pr_number).toBe(59)
    expect(g.expected_merge_sha).toBe(SHA_A)
    expect(g.repository).toBe(REPO)
    expect(g.binding_status).toBe('BOUND')
  })

  it('17/18. partial and missing binding are reported as such', () => {
    expect(proj([bound[0]]).technical.github.binding_status).toBe('PARTIAL')
    expect(proj([]).technical.github.binding_status).toBe('MISSING')
  })

  it('19/20/21. binding satisfies none of the three GitHub checks', () => {
    const b = proj(bound)
    for (const key of ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected']) {
      const c = b.checks.find(x => x.check_key === key)!
      expect(c.status, key).toBe('NOT_EXERCISED')
    }
  })

  it('22. all three GitHub checks remain UNREACHABLE', () => {
    for (const key of ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected']) {
      const c = proj(bound).checks.find(x => x.check_key === key)!
      expect(c.reachability, key).toBe('UNREACHABLE')
    }
  })

  it('the binding checks are informational — they add no new blocker', () => {
    const declared = FAMILJE_STUNDEN_CHECKS.filter(c =>
      c.check_key === GITHUB_BINDING_CHECKS.prNumber ||
      c.check_key === GITHUB_BINDING_CHECKS.expectedMergeSha)
    expect(declared).toHaveLength(2)
    for (const c of declared) {
      expect(c.required).toBe(false)
      expect([...c.allowed_provenance]).toEqual(['attested'])
      expect(c.state).toBe(GITHUB_BINDING_STATE)
    }
  })
})

// ── 23-30. no side effects, no regression ────────────────────────────────────

describe('23-30. inert, and nothing else moved', () => {
  it('23/24. the projection performs no network call and reads no credential', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    proj([bind('i', GITHUB_BINDING_CHECKS.prNumber, 59)])
    expect(spy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('25/26. no write path and no migration are introduced', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/bundle/github-binding.ts'), 'utf8')
    for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'createAdminClient']) {
      expect(src).not.toContain(forbidden)
    }
  })

  it('27/28. the state machine and human gates are unchanged', () => {
    const spec = realDef().spec
    expect(spec.states).toHaveLength(19)
    const gated = spec.states.filter(s => s.human_gate?.required === true).map(s => s.id)
    expect(gated).toContain('frontend_deploy')
    expect(gated).toContain('approval_release')
    // 13 of the 19 states carry a required human gate; pdf_build and
    // ebook_build are deliberately unattended, among others.
    expect(gated.length).toBe(13)
  })

  it('29. readiness is unchanged by the presence of a binding', () => {
    const without = proj([])
    const withBinding = proj([
      bind('i', GITHUB_BINDING_CHECKS.prNumber, 59),
      bind('i', GITHUB_BINDING_CHECKS.expectedMergeSha, SHA_A),
    ])
    expect(withBinding.readiness.product).toBe(without.readiness.product)
    expect(withBinding.readiness.blockers.map(b => b.code).sort())
      .toEqual(without.readiness.blockers.map(b => b.code).sort())
  })

  it('30. TRIPWIRE — the stale status-only reader must not become executable', () => {
    // verifyDeploymentChain reads ONLY /commits/{ref}/status, which sees the
    // "Vercel" commit status and is blind to the "Supabase Preview" and "Vercel
    // Preview Comments" CHECK RUNS. Wiring it would produce a false PASS. It
    // stays unexecutable until the mixed reader lands.
    const reg = readFileSync(join(process.cwd(), 'lib/workflows/action-registry.ts'), 'utf8')
    for (const kind of ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected']) {
      expect(reg).not.toContain(`${kind}: {`)
    }
    const disc = readFileSync(join(process.cwd(), 'lib/workflows/action-discovery.ts'), 'utf8')
    expect(disc).not.toContain('github_pr_checks_green')
    // And the stale reader still queries only the legacy status API.
    const dep = readFileSync(join(process.cwd(), 'lib/workflows/adapters/familje-stunden/deployment.ts'), 'utf8')
    expect(dep).toContain('/status')
    expect(dep).not.toContain('check-runs')
  })
})
