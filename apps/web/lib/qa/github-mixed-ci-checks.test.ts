/**
 * The required CI checks, read from BOTH places GitHub keeps them.
 *
 * The single most important assertion in this file is the negative one: a green
 * legacy Commit Status, on its own, must never produce PASS. That shape is what
 * the previous evaluator called green while two of the three required signals —
 * both of them Check Runs — were invisible to the question being asked.
 *
 * Fixtures are the sanitized shapes observed on the live repository during the
 * audit: only the fields the evaluator reads, no ids, apps, URLs or identities.
 */

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  evaluateRequiredChecks, FAMILJE_STUNDEN_REQUIRED_CHECKS,
  type CheckRunsPayload, type CommitStatusPayload, type RequiredCheck,
} from '../workflows/adapters/familje-stunden/ci-checks'
import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import type { WorkflowDef, WorkflowInstance, WorkflowTransition } from '../workflows/types'

/** The real PR-head commit from the audit. */
const SHA = '3e6ca794b009bc371ae2980f54f285a103bd638c'
const VERCEL_BOT_ID = 35613825
const OTHER = '92776b23b599aa2b4a2b8ff1c3f1d0e2a5c6d7e8'
const T = '2026-09-03T12:14:05Z'
const LATER = '2026-09-03T12:20:00Z'

function status(
  state = 'success', over: { sha?: string; context?: string; updated_at?: string } = {},
): CommitStatusPayload {
  return {
    sha: over.sha ?? SHA, state, total_count: 1,
    statuses: [{
      context: over.context ?? 'Vercel', state,
      created_at: T, updated_at: over.updated_at ?? T,
      creator: { id: VERCEL_BOT_ID, login: 'vercel[bot]', type: 'Bot' },
    }],
  }
}

interface RunOver { name?: string; status?: string; conclusion?: string | null; head_sha?: string; completed_at?: string; app_id?: number }
/** The App that legitimately produces each required run, from the live audit. */
const APP_ID: Record<string, number> = {
  'Supabase Preview': 330661, 'Vercel Preview Comments': 8329,
}
const run = (o: RunOver = {}) => ({
  name: o.name ?? 'Supabase Preview',
  app: { id: o.app_id ?? APP_ID[o.name ?? 'Supabase Preview'] ?? 999999 },
  status: o.status ?? 'completed',
  conclusion: o.conclusion === undefined ? 'success' : o.conclusion,
  head_sha: o.head_sha ?? SHA,
  started_at: T,
  completed_at: o.completed_at ?? T,
})
const runs = (...list: RunOver[]): CheckRunsPayload =>
  ({ total_count: list.length, check_runs: list.map(run) })

/** Both required check runs, green — the shape a healthy PR 62 actually had. */
const GREEN_RUNS = runs({ name: 'Supabase Preview' }, { name: 'Vercel Preview Comments' })

const evaluate = (
  commitStatus: CommitStatusPayload | null, checkRuns: CheckRunsPayload | null,
  policy?: readonly RequiredCheck[],
) => evaluateRequiredChecks({ sha: SHA, commitStatus, checkRuns, policy })

const stateOf = (r: ReturnType<typeof evaluate>, id: string) =>
  r.checks.find(c => c.identity === id)!.state

// ── 1-7. the three required signals ──────────────────────────────────────────

describe('1-7. every required signal must be green', () => {
  it('1. Vercel status success + both check runs success → PASS', () => {
    const r = evaluate(status(), GREEN_RUNS)
    expect(r.outcome).toBe('ALL_REQUIRED_CHECKS_GREEN')
    expect(r.green).toBe(true)
    expect(r.checks.map(c => c.state)).toEqual(['GREEN', 'GREEN', 'GREEN'])
  })

  it('2/3. the legacy Vercel status decides its own half', () => {
    const failed = evaluate(status('failure'), GREEN_RUNS)
    expect(failed.outcome).toBe('CHECKS_FAILED')
    expect(failed.green).toBe(false)

    const pending = evaluate(status('pending'), GREEN_RUNS)
    expect(pending.outcome).toBe('CHECKS_PENDING')
    expect(pending.green).toBe(false)
  })

  it('4/5. Supabase Preview decides its own half', () => {
    const failed = evaluate(status(),
      runs({ name: 'Supabase Preview', conclusion: 'failure' }, { name: 'Vercel Preview Comments' }))
    expect(failed.outcome).toBe('CHECKS_FAILED')
    expect(stateOf(failed, 'Supabase Preview')).toBe('FAILED')

    const pending = evaluate(status(),
      runs({ name: 'Supabase Preview', status: 'in_progress', conclusion: null },
           { name: 'Vercel Preview Comments' }))
    expect(pending.green).toBe(false)
    expect(stateOf(pending, 'Supabase Preview')).toBe('PENDING')
  })

  it('6/7. Vercel Preview Comments decides its own half', () => {
    const failed = evaluate(status(),
      runs({ name: 'Supabase Preview' }, { name: 'Vercel Preview Comments', conclusion: 'failure' }))
    expect(failed.green).toBe(false)
    expect(stateOf(failed, 'Vercel Preview Comments')).toBe('FAILED')

    const pending = evaluate(status(),
      runs({ name: 'Supabase Preview' },
           { name: 'Vercel Preview Comments', status: 'queued', conclusion: null }))
    expect(pending.green).toBe(false)
    expect(stateOf(pending, 'Vercel Preview Comments')).toBe('PENDING')
  })
})

// ── 8-13. absence is never success ───────────────────────────────────────────

describe('8-13. missing anything fails closed', () => {
  it('8. a required legacy status that is absent → EXPECTED_CHECK_MISSING', () => {
    const r = evaluate({ sha: SHA, state: 'success', total_count: 0, statuses: [] }, GREEN_RUNS)
    expect(r.outcome).toBe('EXPECTED_CHECK_MISSING')
    expect(stateOf(r, 'Vercel')).toBe('MISSING')
  })

  it('9. a required check run that is absent → EXPECTED_CHECK_MISSING', () => {
    // The exact real-world merge-commit shape: Vercel Preview Comments simply
    // is not there. GitHub reports no error; the check just never appears.
    const r = evaluate(status(), runs({ name: 'Supabase Preview' }))
    expect(r.outcome).toBe('EXPECTED_CHECK_MISSING')
    expect(stateOf(r, 'Vercel Preview Comments')).toBe('MISSING')
    expect(r.green).toBe(false)
  })

  it('10. the commit-status source unread → NOT PASS', () => {
    const r = evaluate(null, GREEN_RUNS)
    expect(r.outcome).toBe('SOURCE_UNAVAILABLE')
    expect(r.green).toBe(false)
  })

  it('11. THE DEFECT — the check-runs source unread → NOT PASS', () => {
    // Green legacy status, nothing else read. This is precisely the input the
    // previous evaluator answered PASS to.
    const r = evaluate(status(), null)
    expect(r.outcome).toBe('SOURCE_UNAVAILABLE')
    expect(r.green).toBe(false)
  })

  it('12. empty payloads from both sources → NOT PASS', () => {
    const r = evaluate({ sha: SHA, state: 'success', total_count: 0, statuses: [] },
      { total_count: 0, check_runs: [] })
    expect(r.green).toBe(false)
    expect(r.outcome).toBe('EXPECTED_CHECK_MISSING')
  })

  it('13. an empty required policy → NOT PASS', () => {
    // A gate that requires nothing has verified nothing.
    const r = evaluate(status(), GREEN_RUNS, [])
    expect(r.outcome).toBe('NO_REQUIRED_POLICY')
    expect(r.green).toBe(false)
  })
})

// ── 14-16. only declared identities count ────────────────────────────────────

describe('14-16. extra checks are inert, and names are exact', () => {
  it('14/15. an unexpected extra check changes nothing, pass or fail', () => {
    const extraGreen = evaluate(status(),
      runs({ name: 'Supabase Preview' }, { name: 'Vercel Preview Comments' },
           { name: 'CodeQL' }))
    expect(extraGreen.green).toBe(true)
    expect(extraGreen.ignored).toContain('CHECK_RUN:CodeQL')

    const extraRed = evaluate(status(),
      runs({ name: 'Supabase Preview' }, { name: 'Vercel Preview Comments' },
           { name: 'CodeQL', conclusion: 'failure' }))
    expect(extraRed.green).toBe(true)  // not required, so not a blocker
    expect(extraRed.outcome).toBe('ALL_REQUIRED_CHECKS_GREEN')
  })

  it('15b. an extra check DOES block once policy declares it required', () => {
    const r = evaluate(status(), runs({ name: 'Supabase Preview' },
      { name: 'Vercel Preview Comments' }, { name: 'CodeQL', conclusion: 'failure' }),
      [...FAMILJE_STUNDEN_REQUIRED_CHECKS,
       { source: 'CHECK_RUN', identity: 'CodeQL', accepted: ['success'],
         producer_id: 999999, producer_label: 'test', reason: 'test' }])
    expect(r.outcome).toBe('CHECKS_FAILED')
  })

  it('16. exact identity: "Vercel" is not "Vercel Preview Comments"', () => {
    // A substring match would let the legacy Vercel status satisfy the check-run
    // requirement, or vice versa. Both required entries stay unsatisfied here.
    const r = evaluate(
      { sha: SHA, state: 'success', total_count: 1,
        statuses: [{ context: 'Vercel Preview Comments', state: 'success',
                     created_at: T, updated_at: T,
                     creator: { id: VERCEL_BOT_ID } }] },
      runs({ name: 'Vercel' }))
    expect(stateOf(r, 'Vercel')).toBe('MISSING')
    expect(stateOf(r, 'Vercel Preview Comments')).toBe('MISSING')
    expect(r.green).toBe(false)
  })
})

// ── 17-19. SHA integrity ─────────────────────────────────────────────────────

describe('17-19. results from another commit never satisfy anything', () => {
  it('17. a legacy status carried on another commit is not satisfied', () => {
    const r = evaluate(status('success', { sha: OTHER }), GREEN_RUNS)
    expect(stateOf(r, 'Vercel')).toBe('WRONG_SHA')
    expect(r.outcome).toBe('SHA_MISMATCH')
    expect(r.green).toBe(false)
  })

  it('18. a check run carried on another commit is not satisfied', () => {
    const r = evaluate(status(),
      runs({ name: 'Supabase Preview', head_sha: OTHER }, { name: 'Vercel Preview Comments' }))
    expect(stateOf(r, 'Supabase Preview')).toBe('WRONG_SHA')
    expect(r.green).toBe(false)
  })

  it('19. three green results on three different commits cannot combine', () => {
    const r = evaluateRequiredChecks({
      sha: SHA,
      commitStatus: status('success', { sha: OTHER }),
      checkRuns: runs(
        { name: 'Supabase Preview', head_sha: OTHER },
        { name: 'Vercel Preview Comments', head_sha: 'c'.repeat(40) }),
    })
    expect(r.green).toBe(false)
    expect(r.checks.every(c => c.state === 'WRONG_SHA')).toBe(true)
  })
})

// ── 20-22. reruns and duplicates ─────────────────────────────────────────────

describe('20-22. the newest authoritative result wins, deterministically', () => {
  it('20. an older success does not survive a newer failure', () => {
    // Measured: filter=all returned five Supabase Preview runs for one commit.
    const r = evaluate(status(), {
      total_count: 3,
      check_runs: [
        run({ name: 'Supabase Preview', conclusion: 'success', completed_at: T }),
        run({ name: 'Supabase Preview', conclusion: 'failure', completed_at: LATER }),
        run({ name: 'Vercel Preview Comments' }),
      ],
    })
    expect(stateOf(r, 'Supabase Preview')).toBe('FAILED')
    expect(r.green).toBe(false)
  })

  it('21. an older failure does not survive a newer successful rerun', () => {
    const r = evaluate(status(), {
      total_count: 3,
      check_runs: [
        run({ name: 'Supabase Preview', conclusion: 'failure', completed_at: T }),
        run({ name: 'Supabase Preview', conclusion: 'success', completed_at: LATER }),
        run({ name: 'Vercel Preview Comments' }),
      ],
    })
    expect(stateOf(r, 'Supabase Preview')).toBe('GREEN')
    expect(r.green).toBe(true)
  })

  it('22. equally-new results that disagree are AMBIGUOUS, never array order', () => {
    const r = evaluate(status(), {
      total_count: 3,
      check_runs: [
        run({ name: 'Supabase Preview', conclusion: 'success', completed_at: T }),
        run({ name: 'Supabase Preview', conclusion: 'failure', completed_at: T }),
        run({ name: 'Vercel Preview Comments' }),
      ],
    })
    expect(stateOf(r, 'Supabase Preview')).toBe('AMBIGUOUS')
    expect(r.outcome).toBe('MALFORMED_RESPONSE')
    expect(r.green).toBe(false)

    // And the reverse array order gives the same answer — no positional luck.
    const flipped = evaluate(status(), {
      total_count: 3,
      check_runs: [
        run({ name: 'Supabase Preview', conclusion: 'failure', completed_at: T }),
        run({ name: 'Supabase Preview', conclusion: 'success', completed_at: T }),
        run({ name: 'Vercel Preview Comments' }),
      ],
    })
    expect(flipped.outcome).toBe('MALFORMED_RESPONSE')
  })
})

// ── 23-30. every conclusion, decided explicitly ──────────────────────────────

describe('23-30. no conclusion is silently forgiven', () => {
  const NOT_GREEN = ['failure', 'cancelled', 'timed_out', 'action_required',
    'stale', 'skipped', 'neutral', 'startup_failure'] as const

  it('23-29. only "success" is green — skipped and neutral included', () => {
    for (const conclusion of NOT_GREEN) {
      const r = evaluate(status(),
        runs({ name: 'Supabase Preview', conclusion }, { name: 'Vercel Preview Comments' }))
      expect(stateOf(r, 'Supabase Preview'), conclusion).toBe('FAILED')
      expect(r.green, conclusion).toBe(false)
      expect(r.outcome, conclusion).toBe('CHECKS_FAILED')
    }
  })

  it('28b. skipped is a POLICY decision, and the policy is where it lives', () => {
    // Measured: `Supabase Preview` reports completed/skipped on pull requests
    // touching no Supabase paths — four of five audited PRs. The declared policy
    // deliberately does NOT accept it, and changing that is one explicit entry.
    const declared = FAMILJE_STUNDEN_REQUIRED_CHECKS
      .find(c => c.identity === 'Supabase Preview')!
    expect([...declared.accepted]).toEqual(['success'])

    const permissive = evaluate(status(),
      runs({ name: 'Supabase Preview', conclusion: 'skipped' }, { name: 'Vercel Preview Comments' }),
      FAMILJE_STUNDEN_REQUIRED_CHECKS.map(c =>
        c.identity === 'Supabase Preview' ? { ...c, accepted: ['success', 'skipped'] } : c))
    expect(permissive.green).toBe(true)
  })

  it('30. completed with a null conclusion is AMBIGUOUS, never green', () => {
    const r = evaluate(status(),
      runs({ name: 'Supabase Preview', status: 'completed', conclusion: null },
           { name: 'Vercel Preview Comments' }))
    expect(stateOf(r, 'Supabase Preview')).toBe('AMBIGUOUS')
    expect(r.green).toBe(false)
  })
})

// ── 31-33. malformed and real-world payloads ─────────────────────────────────

describe('31-33. payload integrity', () => {
  it('31. a malformed commit-status payload → MALFORMED_RESPONSE', () => {
    for (const bad of [{ sha: SHA, state: 'success' }, { statuses: 'nope' },
                       { statuses: [{ state: 'success' }] }, { statuses: ['x'] }]) {
      const r = evaluate(bad as CommitStatusPayload, GREEN_RUNS)
      expect(r.outcome, JSON.stringify(bad)).toBe('MALFORMED_RESPONSE')
      expect(r.green).toBe(false)
    }
  })

  it('32. a malformed check-runs payload → MALFORMED_RESPONSE', () => {
    for (const bad of [{ total_count: 2 }, { check_runs: 'nope' },
                       { check_runs: [{ conclusion: 'success' }] }, { check_runs: [null] }]) {
      const r = evaluate(status(), bad as CheckRunsPayload)
      expect(r.outcome, JSON.stringify(bad)).toBe('MALFORMED_RESPONSE')
      expect(r.green).toBe(false)
    }
  })

  it('33. the real-world green shape evaluates correctly', () => {
    // Sanitized from the live response for the PR-62 head commit.
    const r = evaluateRequiredChecks({
      sha: SHA,
      commitStatus: { sha: SHA, state: 'success', total_count: 1, statuses: [
        { context: 'Vercel', state: 'success',
          created_at: '2026-09-03T12:14:05Z', updated_at: '2026-09-03T12:14:05Z',
          creator: { id: 35613825, login: 'vercel[bot]', type: 'Bot' } }] },
      checkRuns: { total_count: 2, check_runs: [
        { name: 'Supabase Preview', status: 'completed', conclusion: 'success',
          head_sha: SHA, app: { id: 330661, slug: 'supabase' },
          started_at: '2026-09-03T12:13:27Z', completed_at: '2026-09-03T12:14:33Z' },
        { name: 'Vercel Preview Comments', status: 'completed', conclusion: 'success',
          head_sha: SHA, app: { id: 8329, slug: 'vercel' },
          started_at: '2026-09-03T12:14:06Z', completed_at: '2026-09-03T12:14:06Z' }] },
    })
    expect(r.outcome).toBe('ALL_REQUIRED_CHECKS_GREEN')
    expect(r.green).toBe(true)
    expect(r.ignored).toEqual([])
  })
})

// ── 34-38. the defect cannot come back ───────────────────────────────────────

describe('34-38. no status-only pass, no network, no credential', () => {
  const SRC = join(process.cwd(), 'lib/workflows/adapters/familje-stunden/ci-checks.ts')
  const src = readFileSync(SRC, 'utf8')
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('34. TRIPWIRE — commit statuses alone can never satisfy this policy', () => {
    // Every legacy status green, in every state a rollup can report. None of it
    // matters: two required signals live in an API this input does not contain.
    for (const state of ['success', 'pending', 'failure']) {
      expect(evaluate(status(state), null).green, state).toBe(false)
    }
    // And the policy itself must keep requiring both sources, or the tripwire
    // above becomes vacuous.
    const sources = new Set(FAMILJE_STUNDEN_REQUIRED_CHECKS.map(c => c.source))
    expect([...sources].sort()).toEqual(['CHECK_RUN', 'COMMIT_STATUS'])
  })

  it('35/36. the evaluator reads no credential and makes no request', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    vi.stubEnv('FAMILJE_STUNDEN_GITHUB_TOKEN', 'must-not-be-read')
    evaluate(status(), GREEN_RUNS)
    expect(spy).not.toHaveBeenCalled()
    vi.unstubAllGlobals(); vi.unstubAllEnvs()

    expect(codeOnly).not.toContain('process.env')
    expect(codeOnly).not.toContain('api.github.com')
    expect(codeOnly).not.toMatch(/\bfetch\s*\(/)
    expect(codeOnly).not.toContain('Authorization')
  })

  it('37/38. no database write and no provider spend path exists', () => {
    // "Supabase Preview" is a required CHECK NAME, so a bare "supabase" search
    // would fire on the policy itself. The guards below name access patterns
    // rather than words, which is what actually distinguishes the two.
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(',
                             'createAdminClient', 'createClient', '@/lib/supabase',
                             'recordEvidence', 'appendTransition', 'chargeSpend',
                             'reserveSpend', 'provider']) {
      expect(codeOnly, forbidden).not.toContain(forbidden)
    }
    // And it imports nothing at all: no client, no store, no adapter registry.
    expect(codeOnly).not.toMatch(/^\s*import\s/m)
  })

  it('the stale status-only reader is gone, not merely bypassed', () => {
    const read = (f: string) => {
      const raw = readFileSync(join(process.cwd(), f), 'utf8')
      return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    }
    const dep = read('lib/workflows/adapters/familje-stunden/deployment.ts')
    const obs = read('lib/workflows/adapters/familje-stunden/github-observation.ts')
    // No surviving code path anywhere turns a rollup state into a verdict.
    for (const src of [dep, obs]) {
      expect(src).not.toMatch(/state\s*===\s*'success'/)
      expect(src).not.toMatch(/state\s*!==\s*'success'/)
    }
    // The combined endpoint is gone entirely: it strips `creator`, so it cannot
    // support producer binding.
    expect(dep).not.toContain('/status')
    expect(obs).not.toMatch(/commits\/\$\{sha\}\/status[^e]/)
    expect(obs).toContain('/statuses?')
    expect(obs).toContain('/check-runs?filter=latest')
    // CI is read on the head commit, and the merge commit is never its source.
    expect(obs).toContain('pr.value.headSha')
  })
})

// ── 39-40. nothing else moved ────────────────────────────────────────────────

describe('39-40. reachability and readiness are untouched', () => {
  const NOW = '2026-09-04T12:00:00.000Z'
  const def = (): WorkflowDef => {
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
  const bundle = () => projectMonthReleaseBundle({
    month_key: '2099-01', def: def(), instance: instance(), transitions, evidence: [],
    declaredChecks: FAMILJE_STUNDEN_CHECKS,
    readOnlyAnsweredCheckKeys: ['release_instant_computed', 'anonymous_protected_access_denied', 'release_gate_exists'],
    githubRepository: 'Bumbi190/familje-stunden-v2', now: NOW,
  })

  it('39. all three GitHub checks remain UNREACHABLE', () => {
    // A correct evaluator is not an executable action. Reachability answers
    // "could this be answered", and the answer is still no: there is no
    // check-runs transport and no credential.
    const b = bundle()
    for (const key of ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected']) {
      const c = b.checks.find(x => x.check_key === key)!
      expect(c.reachability, key).toBe('UNREACHABLE')
      expect(c.status, key).toBe('NOT_EXERCISED')
    }
  })

  it('40. readiness does not improve because evaluator code exists', () => {
    const b = bundle()
    expect(b.readiness.product).toBe('BLOCKED')
    expect(b.readiness.blockers.map(x => x.code)).not.toContain('GITHUB_RELEASE_IDENTITY_CONFLICT')
    // The binding foundation from PR #184 is untouched.
    expect(b.technical.github.binding_status).toBe('MISSING')
  })
})
