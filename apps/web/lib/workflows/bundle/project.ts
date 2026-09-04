/**
 * lib/workflows/bundle/project.ts — Month Release Bundle v0.
 *
 * A PURE function. It takes data already fetched by the caller and returns a
 * read model. It opens no connection, runs no action, and writes nothing.
 *
 * That purity is the security argument, not a style preference. A projection
 * that could reach the network would need reviewers to prove a negative about
 * every branch; one that only maps its arguments cannot execute anything,
 * because it holds nothing executable. `projectMonthReleaseBundle` receives
 * plain rows and returns a plain object — there is no client, no registry
 * invocation and no fetch in scope.
 *
 * ── The fail-open invariant ─────────────────────────────────────────────────
 * Familje-Stundens `month_releases` gate is fail-open: a month with no row reads
 * as RELEASED. This projection therefore refuses to guess whether that row
 * exists.
 *
 * Phase 1B gave it a real answer: `release_gate_exists`, recorded by the
 * `observe_release_gate` action. This module still performs no I/O — it reads
 * that RECORDED evidence and nothing else. With no such row recorded the honest
 * projection remains `UNKNOWN`, which blocks release readiness exactly as `NO`
 * does.
 *
 * Inferring presence from upload, deploy, manifest or probe evidence would be
 * the precise mistake the invariant guards against: every one of those succeeds
 * whether or not the row is there.
 *
 * Three things must all hold before the invariant is satisfied — the row is
 * present, its instant equals the independently computed one, and the
 * observation is recent. Each is reported separately so an operator can see
 * which one is holding the release.
 */

import type {
  WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition,
} from '../types'
import type { AttestableCheck } from '../attestation'
import type {
  ApprovalCategory, ApprovalProjection, BundleWarning, CheckKind,
  CheckProjection, CheckStatus, CostSection, Freshness, HardGateProjection,
  GithubBindingSection, MonthReleaseBundle, ProductReadiness, Provenance,
  Reachability, ReachabilityReason,
  ReachabilitySummary, ReleaseAtMatch, SectionSummary, TechnicalSection, Tri,
} from './types'
import { manualPrivilegedPolicy } from './reachability-policy'
import { GITHUB_BINDING_STATE, projectGithubBinding } from './github-binding'

/** Canonical month identity: YYYY-MM, and nothing else. */
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isCanonicalMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value)
}

/**
 * How the 19 state-level human gates roll up into the four bundle categories.
 *
 * This is a PRESENTATION mapping. It deletes nothing and changes no workflow
 * data: the underlying gates keep their own identity, approvers and semantics,
 * and this table only says which heading each appears under. Phase 0 recommended
 * four gates; until the definition itself changes, the four are a view over the
 * nineteen rather than a replacement for them.
 *
 * `complete` is terminal and carries no approval, so it maps to nothing.
 */
export const APPROVAL_CATEGORY_BY_STATE: Readonly<Record<string, ApprovalCategory>> = {
  planning:             'PLAN',

  content_generation:   'CREATIVE',
  visual_generation:    'CREATIVE',
  pdf_build:            'CREATIVE',
  ebook_build:          'CREATIVE',
  audio_generation:     'CREATIVE',
  local_qa:             'CREATIVE',
  approval_content:     'CREATIVE',

  backend_release_gate: 'RELEASE',
  protected_upload:     'RELEASE',
  edge_deploy:          'RELEASE',
  frontend_deploy:      'RELEASE',
  admin_qa:             'RELEASE',
  approval_release:     'RELEASE',
  scheduled_release:    'RELEASE',
  post_release_qa:      'RELEASE',

  newsletter:           'COMMS',
  social:               'COMMS',
}

const CATEGORIES: readonly ApprovalCategory[] = ['PLAN', 'CREATIVE', 'RELEASE', 'COMMS']

/** Which sections a state's checks are summarised under. */
const CONTENT_STATES = new Set([
  'planning', 'content_generation', 'pdf_build', 'ebook_build', 'approval_content',
])
const MEDIA_STATES = new Set(['visual_generation', 'audio_generation', 'local_qa'])
const TECHNICAL_STATES = new Set([
  'backend_release_gate', 'protected_upload', 'edge_deploy', 'frontend_deploy',
  'admin_qa', 'approval_release', 'scheduled_release', 'post_release_qa',
])

export interface ProjectionInput {
  month_key: string
  /** Null when no definition is registered — the bundle then reports NOT_STARTED. */
  def: WorkflowDef | null
  /** Null when no instance exists for this month. */
  instance: WorkflowInstance | null
  transitions: readonly WorkflowTransition[]
  evidence: readonly WorkflowEvidence[]
  /** The adapter's declared catalogue. Declared-but-unexercised is the point. */
  declaredChecks: readonly AttestableCheck[]
  /**
   * Check keys answered by an executable READ_ONLY action, from the canonical
   * registry. Passed in rather than imported so the projection stays pure and
   * the caller owns the registry lookup.
   */
  readOnlyAnsweredCheckKeys?: readonly string[]
  /**
   * Canonical GitHub target, from trusted configuration.
   *
   * Passed in rather than read here: the projection stays pure, and the value
   * can never arrive from workflow evidence or a caller's request — which is
   * what keeps the repository target non-overridable.
   */
  githubRepository?: string | null
  /** Injected so the output is deterministic under test. */
  now?: string
}

const EVIDENCE_TO_CHECK: Readonly<Record<string, CheckStatus>> = {
  pass: 'PASS', fail: 'FAIL', blocked: 'BLOCKED', error: 'ERROR', skipped: 'SKIPPED',
}

function kindOf(check: AttestableCheck, readOnlyKeys: ReadonlySet<string>): CheckKind {
  if (readOnlyKeys.has(check.check_key)) return 'READ_ONLY_EXECUTABLE'
  return check.allowed_provenance.includes('automated') ? 'OBSERVED_ONLY' : 'ATTESTABLE'
}

/**
 * How COULD this check be answered? Never whether it has been.
 *
 * Order matters and is deliberate. An executable action is the strongest route,
 * so it wins outright. Attestation comes next, because a check that permits it
 * has a working human path today. Only then does the explicit policy list get
 * consulted — and if nothing applies, the honest answer is UNREACHABLE, which is
 * exactly the signal a genuine gap should produce.
 *
 * This function reads no evidence and returns no status. It cannot make a check
 * pass.
 */
function reachabilityOf(
  check: AttestableCheck, hasExecutableAction: boolean,
): { reachability: Reachability; reason: ReachabilityReason } {
  if (hasExecutableAction) {
    return { reachability: 'EXECUTABLE', reason: 'EXECUTABLE_ACTION_AVAILABLE' }
  }
  if (check.allowed_provenance.includes('attested')) {
    return { reachability: 'ATTESTABLE', reason: 'ATTESTATION_ALLOWED' }
  }
  const policy = manualPrivilegedPolicy(check.check_key)
  if (policy) {
    // Descriptive only: the manual procedure is NOT an evidence route, so the
    // check stays unsatisfied until a legitimate mechanism exists.
    return {
      reachability: 'MANUAL_PRIVILEGED_VERIFICATION',
      reason: 'BROAD_CREDENTIAL_PROHIBITED',
    }
  }
  return { reachability: 'UNREACHABLE', reason: 'NO_VALID_EVIDENCE_PATH' }
}

function provenanceOf(
  newest: WorkflowEvidence | undefined, kind: CheckKind,
): Provenance {
  if (!newest) return 'NOT_EVALUATED'
  if (newest.source === 'attested') return 'ATTESTED'
  return kind === 'READ_ONLY_EXECUTABLE' ? 'READ_ONLY_ACTION' : 'OBSERVED'
}

/** Newest-first by recorded_at; ties broken by id so ordering is total. */
function newestFirst(a: WorkflowEvidence, b: WorkflowEvidence): number {
  if (a.recorded_at === b.recorded_at) return a.id < b.id ? 1 : -1
  return a.recorded_at < b.recorded_at ? 1 : -1
}

function summarise(
  checks: readonly CheckProjection[], states: readonly string[],
): SectionSummary {
  const mine = checks.filter(c => states.includes(c.state))
  const passed = mine.filter(c => c.status === 'PASS').length
  const failed = mine.filter(c => c.status === 'FAIL' || c.status === 'ERROR').length
  const notRun = mine.filter(c => c.status === 'NOT_EXERCISED').length

  let status: SectionSummary['status']
  if (mine.length === 0) status = 'UNKNOWN'
  else if (failed > 0) status = 'BLOCKED'
  else if (notRun === mine.length) status = 'NOT_STARTED'
  else if (passed === mine.length) status = 'COMPLETE'
  else status = 'IN_PROGRESS'

  return {
    status,
    checks_total: mine.length,
    checks_passed: passed,
    checks_failed: failed,
    checks_not_exercised: notRun,
    states: [...states],
  }
}

/** A single check's status as a tri-state, for the technical headline fields. */
function triFor(checks: readonly CheckProjection[], key: string): Tri {
  const rows = checks.filter(c => c.check_key === key)
  if (rows.length === 0) return 'UNKNOWN'
  if (rows.every(r => r.status === 'PASS')) return 'YES'
  if (rows.some(r => r.status === 'FAIL')) return 'NO'
  return 'UNKNOWN'
}

export function projectMonthReleaseBundle(input: ProjectionInput): MonthReleaseBundle {
  const now = input.now ?? new Date().toISOString()
  const readOnlyKeys = new Set(input.readOnlyAnsweredCheckKeys ?? [])
  const warnings: BundleWarning[] = []

  // ── Evidence indexed by (state, check_key), newest first ───────────────────
  const byKey = new Map<string, WorkflowEvidence[]>()
  for (const e of input.evidence) {
    const k = `${e.state}:${e.check_key}`
    const list = byKey.get(k)
    if (list) list.push(e)
    else byKey.set(k, [e])
  }
  for (const list of byKey.values()) list.sort(newestFirst)

  // ── Checks: declared catalogue is the spine, evidence is an overlay ────────
  // Iterating the CATALOGUE rather than the evidence is what makes
  // NOT_EXERCISED representable. Iterating evidence would only ever show checks
  // that already ran, which is precisely the blind spot this slice removes.
  const checks: CheckProjection[] = input.declaredChecks.map(dc => {
    const rows = byKey.get(`${dc.state}:${dc.check_key}`) ?? []
    const newest = rows[0]
    const kind = kindOf(dc, readOnlyKeys)
    // Reachability is derived from the registry and the policy table ONLY —
    // never from `newest`, so evidence cannot influence it and it cannot
    // influence evidence.
    const reach = reachabilityOf(dc, readOnlyKeys.has(dc.check_key))
    const status: CheckStatus = newest
      ? (EVIDENCE_TO_CHECK[newest.result] ?? 'ERROR')
      : 'NOT_EXERCISED'

    return {
      check_key: dc.check_key,
      state: dc.state,
      kind,
      reachability: reach.reachability,
      reachability_reason: reach.reason,
      status,
      provenance: provenanceOf(newest, kind),
      required: dc.required,
      recorded_at: newest?.recorded_at ?? null,
      observed_at: newest?.observed_at ?? null,
      producer: newest?.producer ?? null,
      evidence_count: rows.length,
      stale: false,
    }
  })

  const statesReached = input.transitions
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map(t => t.to_state)

  // ── Hard gates ─────────────────────────────────────────────────────────────
  // Projected, never redesigned. A gate is PASS only when every required check
  // in every state it is enforced at has passing evidence. Anything else is
  // UNKNOWN or FAIL — there is no permissive default.
  const spec = input.def?.spec ?? null
  const hard_gates: HardGateProjection[] = (spec?.hard_gates ?? []).map(g => {
    const scope = g.enforced_at.includes('all')
      ? checks
      : checks.filter(c => g.enforced_at.includes(c.state))
    const required = scope.filter(c => c.required)
    const failed = required.filter(c => c.status === 'FAIL' || c.status === 'ERROR')
    const missing = required.filter(c => c.status === 'NOT_EXERCISED')

    let status: HardGateProjection['status']
    let reason: string | null = null
    if (required.length === 0) {
      status = 'NOT_EVALUATED'
      reason = 'No declared check answers this gate'
    } else if (failed.length > 0) {
      status = 'FAIL'
      reason = `${failed.length} required check(s) failed`
    } else if (missing.length > 0) {
      status = 'UNKNOWN'
      reason = `${missing.length} required check(s) have no evidence`
    } else {
      status = 'PASS'
    }

    const evaluated = required
      .map(c => c.recorded_at)
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null

    return {
      id: g.id,
      rule: g.rule,
      enforced_at: [...g.enforced_at],
      status,
      provenance: status === 'NOT_EVALUATED' ? 'NOT_EVALUATED'
        : required.some(c => c.provenance === 'ATTESTED') ? 'ATTESTED' : 'OBSERVED',
      evaluated_at: evaluated,
      blocking: true,
      reason,
      missing_evidence: missing.map(c => `${c.state}:${c.check_key}`),
    }
  })

  // ── Approvals: four categories over the underlying state gates ─────────────
  const gateStates = (spec?.states ?? []).filter(s => s.human_gate?.required === true)
  const approvals = Object.fromEntries(CATEGORIES.map((cat): [ApprovalCategory, ApprovalProjection] => {
    const states = gateStates
      .filter(s => APPROVAL_CATEGORY_BY_STATE[s.id] === cat)
      .map(s => s.id)

    // A state is "passed" only once the instance has moved BEYOND it. Being in
    // a state means its gate is still open, not satisfied.
    const idx = (id: string) => statesReached.indexOf(id)
    const current = input.instance?.current_state ?? null
    const pending = states.filter(s => idx(s) === -1 || s === current)

    let status: ApprovalProjection['status']
    if (states.length === 0) status = 'NOT_REQUIRED'
    else if (!input.instance) status = 'UNKNOWN'
    else if (pending.length === 0) status = 'APPROVED'
    else status = 'PENDING'

    return [cat, {
      category: cat,
      status,
      states,
      pending_states: pending,
      approver: gateStates.find(s => states.includes(s.id))?.human_gate.approver ?? null,
    }]
  })) as Record<ApprovalCategory, ApprovalProjection>

  // ── The fail-open invariant, from recorded observation only ────────────────
  const gate = projectReleaseGate(input.evidence, now)

  const technical: TechnicalSection = {
    ...summarise(checks, [...TECHNICAL_STATES]),
    ...gate,
    // Descriptive. Binding says WHICH release to look at; it never says the PR
    // merged, the checks were green, or the SHAs agreed.
    github: projectGithubBinding(input.evidence, input.githubRepository ?? null) as GithubBindingSection,
    release_instant_computed: triFor(checks, 'release_instant_computed'),
    manifest_in_sync: triFor(checks, 'shared_manifest_consumers_in_sync'),
    anonymous_access_denied: triFor(checks, 'anonymous_protected_access_denied'),
    deployment_sha_verified: triFor(checks, 'vercel_deploy_sha_matches_merge_sha'),
  }

  // ── Warnings and blockers ──────────────────────────────────────────────────
  const blocker = (
    code: string, message: string, subject: string | null = null,
    severity: BundleWarning['severity'] = 'critical',
  ): BundleWarning => ({ code, severity, message, subject, blocking: true })

  // Only YES + MATCH + fresh may satisfy this invariant. Each failure mode is a
  // separate blocker so the operator sees WHICH one is holding the release.
  if (technical.release_gate_row_present === 'NO') {
    warnings.push(blocker(
      'RELEASE_GATE_ROW_MISSING',
      'Familje-Stunden reports NO month_releases row for this month. The gate is ' +
      'fail-open, so the month is unprotected and would publish immediately.',
      'backend_release_gate',
    ))
  } else if (technical.release_gate_row_present === 'UNKNOWN') {
    warnings.push(blocker(
      'RELEASE_GATE_ROW_UNKNOWN',
      'The month_releases row could not be observed. Because the gate is fail-open, ' +
      'not knowing is treated exactly as an absent row.',
      'backend_release_gate',
    ))
  } else {
    if (technical.release_at_match === 'MISMATCH') {
      warnings.push(blocker(
        'RELEASE_AT_MISMATCH',
        `The authoritative release_at (${technical.release_gate_release_at}) differs from ` +
        `the computed instant (${technical.expected_release_at}). The month would unlock ` +
        'at a different moment than intended.',
        'backend_release_gate',
      ))
    } else if (technical.release_at_match === 'UNKNOWN') {
      warnings.push(blocker(
        'RELEASE_AT_UNVERIFIED',
        'The observed and computed release instants could not be compared.',
        'backend_release_gate', 'high',
      ))
    }
    if (technical.release_gate_freshness !== 'fresh') {
      warnings.push(blocker(
        'RELEASE_GATE_EVIDENCE_STALE',
        `The release-gate observation is ${technical.release_gate_freshness}. ` +
        'month_releases is a mutable production row, so an old look cannot satisfy ' +
        'the invariant at release time.',
        'backend_release_gate', 'high',
      ))
    }
  }

  // A release identity two attestations disagree about must stop the release.
  // Every recorded GitHub observation silently depends on which one is true, so
  // "newest wins" would repoint already-recorded evidence at a different
  // release. Both values stay in workflow_evidence; neither is deleted.
  if (technical.github.binding_status === 'CONFLICTED') {
    const r = technical.github.rejected_rebind
    warnings.push(blocker(
      'GITHUB_RELEASE_IDENTITY_CONFLICT',
      r?.reason === 'INCOMPLETE_PAIR'
        ? 'A rebinding of the GitHub release identity was started and never completed. ' +
          'A pull request number and its expected merge SHA are one identity, so the ' +
          'half-recorded value cannot combine with the previous pair.'
        : `A conflicting GitHub release identity (PR ${r?.pr_number}, ` +
          `SHA ${r?.expected_merge_sha}) was recorded after ` +
          `${technical.github.locked_by} had already verified against ` +
          `PR ${technical.github.pr_number}. The later value is refused authority.`,
      GITHUB_BINDING_STATE,
    ))
  }

  for (const g of hard_gates) {
    if (g.status === 'FAIL') {
      warnings.push(blocker('HARD_GATE_FAILED', `Hard gate ${g.id} failed: ${g.reason}`, g.id))
    } else if (g.status === 'UNKNOWN') {
      warnings.push(blocker('HARD_GATE_UNKNOWN', `Hard gate ${g.id} unverified: ${g.reason}`, g.id, 'high'))
    }
  }

  const notExercised = checks.filter(c => c.status === 'NOT_EXERCISED')
  if (notExercised.length > 0) {
    warnings.push({
      code: 'CHECKS_NEVER_EXERCISED',
      severity: 'high',
      message: `${notExercised.length} of ${checks.length} declared checks have never produced evidence.`,
      subject: null,
      blocking: false,
    })
  }

  if (approvals.RELEASE.status !== 'APPROVED') {
    warnings.push(blocker(
      'RELEASE_APPROVAL_ABSENT',
      `RELEASE approval is ${approvals.RELEASE.status}.`,
      'approval_release',
    ))
  }

  // Comms capability is informational: it must never invalidate product access.
  warnings.push({
    code: 'COMMS_NOT_IMPLEMENTED',
    severity: 'info',
    message: 'Newsletter and social execution are declared not_executable. ' +
      'This does not affect product release readiness.',
    subject: null,
    blocking: false,
  })

  // ── Readiness ──────────────────────────────────────────────────────────────
  const blockers = warnings.filter(w => w.blocking)
  const product = deriveProductReadiness(input.instance, blockers, approvals)

  return {
    schema_version: 1,
    generated_at: now,
    identity: {
      month_key: input.month_key,
      workflow_def_key: input.def?.def_key ?? null,
      workflow_def_version: input.def?.version ?? null,
      workflow_def_hash: input.def?.def_hash ?? null,
      workflow_instance_id: input.instance?.id ?? null,
    },
    workflow: {
      current_state: input.instance?.current_state ?? null,
      previous_state: statesReached.length > 1 ? statesReached[statesReached.length - 2] : null,
      status: input.instance?.status ?? null,
      created_at: input.instance?.created_at ?? null,
      closed_at: input.instance?.closed_at ?? null,
      wake_at: input.instance?.wake_at ?? null,
      last_tick_at: input.instance?.last_tick_at ?? null,
      last_tick_outcome: input.instance?.last_tick_outcome ?? null,
      transition_count: input.transitions.length,
      states_reached: statesReached,
    },
    content: summarise(checks, [...CONTENT_STATES]),
    media: summarise(checks, [...MEDIA_STATES]),
    technical,
    approvals,
    cost: projectCost(),
    checks,
    verification_reachability: summariseReachability(checks),
    hard_gates,
    warnings,
    readiness: {
      product,
      // Declared not_executable in the action registry. Not a product blocker.
      comms: 'NOT_IMPLEMENTED',
      blockers,
      warnings: warnings.filter(w => !w.blocking && w.severity !== 'info'),
      informational: warnings.filter(w => !w.blocking && w.severity === 'info'),
    },
  }
}

/**
 * How old a release-gate observation may be and still satisfy the invariant.
 *
 * Deliberately conservative and deliberately small in scope. `month_releases` is
 * a mutable production row: it can be edited by a migration at any time, and an
 * observation only ever describes the moment it was made. Twenty-four hours
 * keeps a human-paced monthly release workable while ensuring a release decision
 * never rests on a week-old look at the one row that decides publication.
 *
 * This is not a global evidence lifecycle. It applies to this check alone.
 */
export const RELEASE_GATE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Parse to an epoch, or null. Never throws, never guesses. */
function instantOf(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : t
}

/**
 * Project the release-gate invariant from RECORDED evidence only.
 *
 * Reads `release_gate_exists` (the observation) and `release_instant_computed`
 * (the independent computation) and compares them. Neither is ever written over
 * the other: they are two separate facts, and the bundle reports whether they
 * agree.
 */
function projectReleaseGate(
  evidence: readonly WorkflowEvidence[], now: string,
): Pick<TechnicalSection,
  'release_gate_row_present' | 'release_gate_evidence_source' | 'release_gate_release_at' |
  'expected_release_at' | 'release_at_match' | 'release_gate_freshness' | 'release_gate_observed_at'> {

  const gateRows = evidence
    .filter(e => e.check_key === 'release_gate_exists')
    .sort(newestFirst)
  const newest = gateRows[0]

  const expectedRow = evidence
    .filter(e => e.check_key === 'release_instant_computed' && e.result === 'pass')
    .sort(newestFirst)[0]
  const expected = typeof expectedRow?.detail?.utc === 'string'
    ? (expectedRow.detail.utc as string)
    : null

  if (!newest) {
    return {
      release_gate_row_present: 'UNKNOWN',
      release_gate_evidence_source: null,
      release_gate_release_at: null,
      expected_release_at: expected,
      release_at_match: 'UNKNOWN',
      release_gate_freshness: 'unknown',
      release_gate_observed_at: null,
    }
  }

  // pass = the row exists. fail = it authoritatively does NOT. Anything else
  // (blocked/error) means we could not establish truth, which is UNKNOWN and
  // must never collapse into NO.
  const present: Tri =
    newest.result === 'pass' ? 'YES'
    : newest.result === 'fail' ? 'NO'
    : 'UNKNOWN'

  const observedAt = newest.observed_at ?? newest.recorded_at
  const age = instantOf(observedAt)
  const nowMs = instantOf(now)
  const freshness: Freshness =
    age === null || nowMs === null ? 'unknown'
    : (nowMs - age) <= RELEASE_GATE_MAX_AGE_MS ? 'fresh'
    : 'stale'

  const observedAtInstant = present === 'YES'
    ? (typeof newest.detail?.release_at === 'string' ? (newest.detail.release_at as string) : null)
    : null

  // Compared BY INSTANT. Equivalent serialisations of the same moment match.
  let match: ReleaseAtMatch = 'UNKNOWN'
  if (present === 'YES') {
    const a = instantOf(observedAtInstant)
    const b = instantOf(expected)
    if (a !== null && b !== null) match = a === b ? 'MATCH' : 'MISMATCH'
  }

  return {
    release_gate_row_present: present,
    release_gate_evidence_source: `${newest.state}:release_gate_exists`,
    release_gate_release_at: observedAtInstant,
    expected_release_at: expected,
    release_at_match: match,
    release_gate_freshness: freshness,
    release_gate_observed_at: observedAt,
  }
}

/** Counts per category, plus the ids a reader would otherwise re-derive. */
function summariseReachability(checks: readonly CheckProjection[]): ReachabilitySummary {
  const of = (r: Reachability) => checks.filter(c => c.reachability === r)
  const keys = (r: Reachability) => [...new Set(of(r).map(c => c.check_key))].sort()
  return {
    executable: of('EXECUTABLE').length,
    attestable: of('ATTESTABLE').length,
    manual_privileged_verification: of('MANUAL_PRIVILEGED_VERIFICATION').length,
    unreachable: of('UNREACHABLE').length,
    manual_privileged_check_keys: keys('MANUAL_PRIVILEGED_VERIFICATION'),
    unreachable_check_keys: keys('UNREACHABLE'),
  }
}

/** v0 has no cost wiring. Saying so is more useful than reporting a zero. */
function projectCost(): CostSection {
  return {
    approved_ceiling_minor: null,
    known_spend_minor: null,
    currency: null,
    status: 'NOT_CONNECTED',
  }
}

/**
 * Deterministic and fail-closed.
 *
 * Any blocker at all ⇒ BLOCKED. There is no path from a blocker to
 * READY_FOR_RELEASE_APPROVAL, which is what stops the fail-open gate and an
 * absent RELEASE approval from ever reading as ready.
 */
function deriveProductReadiness(
  instance: WorkflowInstance | null,
  blockers: readonly BundleWarning[],
  approvals: Record<ApprovalCategory, ApprovalProjection>,
): ProductReadiness {
  if (!instance) return 'NOT_STARTED'
  if (blockers.length > 0) return 'BLOCKED'

  const state = instance.current_state
  if (state === 'complete' || instance.status === 'complete') return 'COMPLETE'
  if (state === 'post_release_qa') return 'RELEASED'
  if (state === 'scheduled_release') return 'APPROVED_NOT_RELEASED'
  if (state === 'approval_release') return 'READY_FOR_RELEASE_APPROVAL'

  const pendingHumanGate = CATEGORIES.some(c => approvals[c].status === 'PENDING')
  return pendingHumanGate ? 'AWAITING_APPROVAL' : 'IN_PROGRESS'
}
