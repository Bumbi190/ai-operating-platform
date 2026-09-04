/**
 * lib/workflows/adapters/familje-stunden/ci-checks.ts — did the REQUIRED CI
 * checks pass, on the RIGHT commit, read from BOTH places GitHub keeps them?
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 * The previous evaluator asked GitHub one question — the combined Commit Status
 * rollup for the merge commit — and treated `state == "success"` as green. An
 * audit of five merged Familje-Stunden pull requests shows why that produces a
 * confident false PASS:
 *
 *   PR head commit    Vercel (commit status)          = success
 *                     Supabase Preview (check run)    = present
 *                     Vercel Preview Comments (run)   = present
 *
 *   merge commit      Vercel (commit status)          = success
 *                     Supabase Preview (check run)    = present
 *                     Vercel Preview Comments (run)   = ABSENT
 *
 * GitHub keeps Checks and Commit Statuses in two separate systems, and the
 * rollup reports on only the second. So a merge commit whose Check Runs had
 * failed outright still answered `success`, because the rollup never saw them.
 * Two of the three required signals were invisible to the question being asked.
 *
 * ── WHICH COMMIT OWNS CI ────────────────────────────────────────────────────
 * The PR HEAD commit, and only it. It is the sole commit carrying all three
 * signals; the merge commit does not receive `Vercel Preview Comments` at all,
 * so a policy pinned to the merge commit could never be satisfied and would
 * report a permanent, misleading absence. This is a measured property of the
 * repository, re-derived in the audit above rather than assumed.
 *
 * ── THE REQUIRED SET IS POLICY, NOT DISCOVERY ───────────────────────────────
 * Familje-Stunden has no branch-protection authority Omnira may read, so there
 * is nothing to derive the required set FROM. Asking "is everything GitHub
 * returned green?" would make the gate depend on whichever apps happen to be
 * installed that week: a required check silently disappearing would read as
 * success, which is the same failure in a new costume. The required set is
 * therefore declared here, by exact identity and source, and consulted — never
 * discovered, never widened by what a response contains.
 *
 * ── EVERYTHING FAILS CLOSED ─────────────────────────────────────────────────
 * A required check that is missing, on another commit, ambiguous, unparseable
 * or reported by a source that could not be read is NOT green. An empty policy
 * is not green either — a gate that requires nothing has verified nothing.
 *
 * ── PURE ───────────────────────────────────────────────────────────────────
 * Payloads in, verdict out. No fetch, no credential, no client, no clock. The
 * transport that will one day supply these payloads is a separate, later,
 * explicitly credentialled slice; nothing here can reach GitHub.
 */

// ── The shapes GitHub actually returns ───────────────────────────────────────
// Only the fields the evaluator reads. Taken from live responses during the
// audit; everything else (URLs, apps, outputs, identities) is deliberately not
// modelled, so no incidental repository data can travel with a fixture.

/** GET /repos/{repo}/commits/{ref}/status — the COMBINED rollup. */
export interface CommitStatusPayload {
  /** The commit these statuses belong to. Individual entries carry no SHA. */
  sha?: unknown
  /** GitHub's rollup. Present, and deliberately never consulted as a verdict. */
  state?: unknown
  total_count?: unknown
  statuses?: unknown
}

/** GET /repos/{repo}/commits/{ref}/check-runs — filter=latest. */
export interface CheckRunsPayload {
  total_count?: unknown
  check_runs?: unknown
}

// ── Trusted required-check policy ────────────────────────────────────────────

export type CheckSource = 'COMMIT_STATUS' | 'CHECK_RUN'

export interface RequiredCheck {
  source: CheckSource
  /** Exact `context` for a commit status, exact `name` for a check run. */
  identity: string
  /**
   * The ONLY outcomes that count as green for this check.
   *
   * Explicit per check, and deliberately not defaulted to a shared "successful
   * enough" set. GitHub's own UI treats `neutral` and `skipped` as non-blocking
   * in some contexts; that is a statement about merge buttons, not about
   * whether a release was verified, and importing it here would let a check
   * that never ran satisfy a gate that exists because it must run.
   */
  accepted: readonly string[]
  /** Why this signal is required. Non-secret, one line. */
  reason: string
}

/**
 * The required checks for a Familje-Stunden release, by exact identity.
 *
 * Re-validated against the live repository immediately before this was written:
 * `Vercel` is a legacy Commit Status; `Supabase Preview` and
 * `Vercel Preview Comments` are Check Runs. Neither API alone sees all three.
 *
 * ── AN OPEN DECISION, DELIBERATELY LEFT STRICT ──────────────────────────────
 * `Supabase Preview` reports `completed / skipped` on pull requests that touch
 * no Supabase paths — four of the five audited PRs, all of which shipped. Under
 * the policy below that reads as NOT green, so a frontend-only release would be
 * held rather than passed.
 *
 * That is the fail-closed direction and it is intentional. Accepting `skipped`
 * means accepting "this check did not run" as "this check passed", and the only
 * authority that could justify it — branch protection — is not readable. If the
 * Editor decides a skip is legitimate for this signal, it is one entry in
 * `accepted` here, with a reason, reviewed as policy. It is not a code change,
 * and it must never be inferred at evaluation time.
 */
export const FAMILJE_STUNDEN_REQUIRED_CHECKS: readonly RequiredCheck[] = [
  {
    source: 'COMMIT_STATUS', identity: 'Vercel', accepted: ['success'],
    reason: 'The production build must have succeeded for this commit',
  },
  {
    source: 'CHECK_RUN', identity: 'Supabase Preview', accepted: ['success'],
    reason: 'Database and edge-function changes must have been validated',
  },
  {
    source: 'CHECK_RUN', identity: 'Vercel Preview Comments', accepted: ['success'],
    reason: 'The preview deployment must have completed for this commit',
  },
]

// ── Outcome vocabulary ───────────────────────────────────────────────────────

export type CiOutcome =
  | 'ALL_REQUIRED_CHECKS_GREEN'
  | 'CHECKS_FAILED'
  | 'CHECKS_PENDING'
  | 'EXPECTED_CHECK_MISSING'
  | 'SHA_MISMATCH'
  | 'SOURCE_UNAVAILABLE'
  | 'MALFORMED_RESPONSE'
  | 'NO_REQUIRED_POLICY'

/**
 * Worst first. The reported outcome is the most severe finding present, so a
 * single failure is never hidden behind a second check that is merely pending.
 *
 * `CHECKS_FAILED` outranks `SHA_MISMATCH` because an explicit failure is a
 * settled fact, while a foreign-commit result is an unanswered question.
 */
const SEVERITY: readonly CiOutcome[] = [
  'MALFORMED_RESPONSE',
  'NO_REQUIRED_POLICY',
  'SOURCE_UNAVAILABLE',
  'CHECKS_FAILED',
  'SHA_MISMATCH',
  'EXPECTED_CHECK_MISSING',
  'CHECKS_PENDING',
  'ALL_REQUIRED_CHECKS_GREEN',
]

export type CheckState =
  | 'GREEN' | 'FAILED' | 'PENDING' | 'MISSING' | 'WRONG_SHA' | 'AMBIGUOUS'

export interface RequiredCheckResult {
  source: CheckSource
  identity: string
  state: CheckState
  /** The raw GitHub word behind `state`, when there was one. */
  observed: string | null
}

export interface CiChecksResult {
  outcome: CiOutcome
  green: boolean
  /** The commit every result had to belong to. */
  sha: string
  checks: readonly RequiredCheckResult[]
  /** Identities seen in the payloads that policy does not require. Ignored. */
  ignored: readonly string[]
}

// ── Reading the payloads ─────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

interface Candidate {
  identity: string
  /** The accept/reject word: a status `state`, or a check run `conclusion`. */
  word: string | null
  /** True while a check run has not completed. */
  running: boolean
  sha: string | null
  /** For newest-wins selection. Null when GitHub gave us nothing to order by. */
  at: number | null
}

/** MALFORMED is a distinct answer from "no candidates": it must never pass. */
type Parsed = { ok: true; items: Candidate[] } | { ok: false }

/**
 * Commit statuses from the COMBINED endpoint.
 *
 * GitHub already collapses that response to the newest entry per context — the
 * audit measured 2 raw statuses against 1 combined on every commit checked — but
 * the evaluator re-applies newest-wins anyway rather than trusting the shape of
 * a payload it did not fetch itself.
 */
function parseStatuses(payload: CommitStatusPayload | null | undefined): Parsed {
  if (payload === null || payload === undefined) return { ok: true, items: [] }
  if (!isObj(payload) || !Array.isArray(payload.statuses)) return { ok: false }
  const sha = str(payload.sha)
  const items: Candidate[] = []
  for (const row of payload.statuses) {
    if (!isObj(row)) return { ok: false }
    const identity = str(row.context)
    const word = str(row.state)
    if (identity === null || word === null) return { ok: false }
    const when = str(row.updated_at) ?? str(row.created_at)
    const at = when === null ? null : Date.parse(when)
    items.push({
      identity, word, running: false, sha,
      at: at !== null && Number.isNaN(at) ? null : at,
    })
  }
  return { ok: true, items }
}

/** Check runs. Each run carries its own `head_sha`, so each is checked. */
function parseCheckRuns(payload: CheckRunsPayload | null | undefined): Parsed {
  if (payload === null || payload === undefined) return { ok: true, items: [] }
  if (!isObj(payload) || !Array.isArray(payload.check_runs)) return { ok: false }
  const items: Candidate[] = []
  for (const row of payload.check_runs) {
    if (!isObj(row)) return { ok: false }
    const identity = str(row.name)
    const status = str(row.status)
    if (identity === null || status === null) return { ok: false }
    const completed = status === 'completed'
    // `conclusion` is null until a run completes, which is normal — but a
    // COMPLETED run with no conclusion is not something to interpret.
    const word = completed ? str(row.conclusion) : null
    const when = str(row.completed_at) ?? str(row.started_at)
    const at = when === null ? null : Date.parse(when)
    items.push({
      identity, word, running: !completed, sha: str(row.head_sha),
      at: at !== null && Number.isNaN(at) ? null : at,
    })
  }
  return { ok: true, items }
}

/**
 * The authoritative result for one required check.
 *
 * Reruns create additional entries under the same identity, so newest wins. Two
 * entries that are equally new and disagree cannot be ordered, and an
 * unorderable required check is AMBIGUOUS — never resolved by array position.
 */
function selectAuthoritative(candidates: Candidate[]): Candidate | 'AMBIGUOUS' {
  if (candidates.length === 1) return candidates[0]
  const newest = candidates.reduce<number | null>(
    (m, c) => (c.at === null ? m : m === null || c.at > m ? c.at : m), null)
  // Nothing to order by at all: if they already agree it does not matter.
  const contenders = newest === null
    ? candidates
    : candidates.filter(c => c.at === newest)
  const distinct = new Set(contenders.map(c => `${c.word}|${c.running}|${c.sha}`))
  if (distinct.size > 1) return 'AMBIGUOUS'
  return contenders[0]
}

// ── The evaluation ───────────────────────────────────────────────────────────

export interface EvaluateInput {
  /** The commit that owns CI — the PR head. Every result must belong to it. */
  sha: string
  /** Null when the source could not be read. Absent is NOT empty. */
  commitStatus: CommitStatusPayload | null
  checkRuns: CheckRunsPayload | null
  /** Trusted policy. Defaults to the declared Familje-Stunden set. */
  policy?: readonly RequiredCheck[]
}

/**
 * Evaluate the required checks. Pure: payloads in, verdict out.
 *
 * BOTH sources are mandatory. A green Commit Status with no Check Runs response
 * is exactly the shape the old evaluator called PASS, and it is the one this
 * function must never call green.
 */
export function evaluateRequiredChecks(input: EvaluateInput): CiChecksResult {
  const policy = input.policy ?? FAMILJE_STUNDEN_REQUIRED_CHECKS
  const found: CiOutcome[] = []
  const checks: RequiredCheckResult[] = []

  const statuses = parseStatuses(input.commitStatus)
  const runs = parseCheckRuns(input.checkRuns)
  if (!statuses.ok || !runs.ok) {
    return {
      outcome: 'MALFORMED_RESPONSE', green: false, sha: input.sha,
      checks: policy.map(p => ({
        source: p.source, identity: p.identity, state: 'AMBIGUOUS' as const, observed: null,
      })),
      ignored: [],
    }
  }

  // A source that was not read is unavailable. Half an answer is not an answer:
  // the check runs could be red while the statuses are green.
  const needs = (s: CheckSource) => policy.some(p => p.source === s)
  if (needs('COMMIT_STATUS') && input.commitStatus === null) found.push('SOURCE_UNAVAILABLE')
  if (needs('CHECK_RUN') && input.checkRuns === null) found.push('SOURCE_UNAVAILABLE')

  // An empty policy verifies nothing, and nothing is not success.
  if (policy.length === 0) found.push('NO_REQUIRED_POLICY')

  const pool = (s: CheckSource) => (s === 'COMMIT_STATUS' ? statuses.items : runs.items)

  for (const required of policy) {
    // EXACT identity. "Vercel" is not "Vercel Preview Comments".
    const all = pool(required.source).filter(c => c.identity === required.identity)
    const mine = all.filter(c => c.sha === null || c.sha === input.sha)
    // A commit-status payload carries one SHA for the whole response; a foreign
    // one disqualifies every status in it.
    const shaOk = required.source !== 'COMMIT_STATUS'
      || input.commitStatus === null
      || str((input.commitStatus as Record<string, unknown>).sha) === null
      || str((input.commitStatus as Record<string, unknown>).sha) === input.sha

    let state: CheckState
    let observed: string | null = null

    if (all.length > 0 && (mine.length === 0 || !shaOk)) {
      state = 'WRONG_SHA'
      found.push('SHA_MISMATCH')
    } else if (mine.length === 0) {
      state = 'MISSING'
      found.push('EXPECTED_CHECK_MISSING')
    } else {
      const picked = selectAuthoritative(mine)
      if (picked === 'AMBIGUOUS') {
        state = 'AMBIGUOUS'
        found.push('MALFORMED_RESPONSE')
      } else if (picked.running) {
        state = 'PENDING'
        observed = 'in progress'
        found.push('CHECKS_PENDING')
      } else if (picked.word !== null && required.accepted.includes(picked.word)) {
        state = 'GREEN'
        observed = picked.word
      } else if (picked.word === null) {
        // A completed run with no conclusion, or a status with no state.
        state = 'AMBIGUOUS'
        found.push('MALFORMED_RESPONSE')
      } else if (picked.word === 'pending' || picked.word === 'queued' || picked.word === 'in_progress') {
        state = 'PENDING'
        observed = picked.word
        found.push('CHECKS_PENDING')
      } else {
        // failure, error, cancelled, timed_out, action_required, stale,
        // skipped, neutral, startup_failure — every one of them, unless the
        // policy named it. None is silently forgiven.
        state = 'FAILED'
        observed = picked.word
        found.push('CHECKS_FAILED')
      }
    }
    checks.push({ source: required.source, identity: required.identity, state, observed })
  }

  // Anything the payloads carried that policy does not require. Recorded so an
  // operator can see it, and otherwise inert — an extra failing check is not a
  // release blocker, and an extra passing one satisfies nothing.
  const requiredIdentities = new Set(policy.map(p => `${p.source}:${p.identity}`))
  const ignored = [
    ...statuses.items.map(c => `COMMIT_STATUS:${c.identity}`),
    ...runs.items.map(c => `CHECK_RUN:${c.identity}`),
  ].filter((k, i, a) => a.indexOf(k) === i && !requiredIdentities.has(k))

  const outcome = SEVERITY.find(s => found.includes(s)) ?? 'ALL_REQUIRED_CHECKS_GREEN'
  return {
    outcome,
    green: outcome === 'ALL_REQUIRED_CHECKS_GREEN' && checks.every(c => c.state === 'GREEN'),
    sha: input.sha,
    checks,
    ignored,
  }
}
