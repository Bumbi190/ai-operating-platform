/**
 * lib/workflows/escalation.ts — what went wrong, how badly, and who is told.
 *
 * PR3 gave the tick a `failed` outcome and one signal. That was enough while
 * nothing was verified. Now that evidence exists, "failed" is far too coarse: a
 * missing credential, a timed-out probe, a stale attestation and protected
 * material reachable without a session are not the same event and must not be
 * handled, ranked or notified the same way.
 *
 * ── SEVERITY REUSES THE EXISTING VOCABULARY ─────────────────────────────────
 * `atlas_signals` has no severity column of its own, so severity travels in the
 * payload — using the vocabulary the Action Center already ranks by
 * (`critical | high | normal`, lib/atlas/actions.ts) rather than inventing a
 * parallel one. The canonical Familje-Stunden definition also grades its own
 * escalation block `critical` / `high`, so all three agree.
 *
 * INFO has no signal at all. An instance waiting for an editor is the system
 * working; a row per minute saying so is noise that would bury the row that
 * matters.
 *
 * ── LIFECYCLE WITHOUT A MUTABLE STATUS ──────────────────────────────────────
 * `atlas_signals` has no status column and no dedupe key, and adding a second
 * incident table to get them would be the wrong trade. Instead the lifecycle is
 * DERIVED from appended events sharing a `signal_key` — the same shape the
 * authorization, decision and mission ledgers already use:
 *
 *   raised     first detection of a condition
 *   regressed  it came back after being resolved
 *   resolved   the condition no longer describes current state
 *
 * A repeated identical detection appends NOTHING. That is what stops a
 * once-a-minute tick from writing a once-a-minute incident. History is never
 * rewritten and never deleted; a resolved condition keeps its whole chain.
 */

import 'server-only'

import { recordSignal, type SignalRecord } from '@/lib/atlas/signals'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type { Severity } from '@/lib/atlas/actions'

/** Signal kinds. Namespaced so the partial index and every query can find them. */
export const WORKFLOW_SIGNAL_KIND = {
  raised:    'workflow.escalation.raised',
  regressed: 'workflow.escalation.regressed',
  resolved:  'workflow.escalation.resolved',
} as const

export const WORKFLOW_SIGNAL_KINDS = Object.values(WORKFLOW_SIGNAL_KIND)
export const WORKFLOW_SIGNAL_VERSION = 'workflow-escalation-1.0.0'

// ── Failure taxonomy ─────────────────────────────────────────────────────────

/**
 * What kind of wrong. Deliberately not collapsed into one `failed`: each of
 * these implies a different remediation, a different severity and a different
 * retry answer.
 */
export type WorkflowFailureClass =
  /** An authority we reached answered NO. A real finding. */
  | 'verification_failed'
  /** We could not look: credential missing, timeout, service down. */
  | 'verification_blocked'
  /** We looked and got something unusable. */
  | 'verification_error'
  /** Evidence exists but was produced against a target that has since moved. */
  | 'verification_stale'
  /** The transition history contains a move the definition never allowed. */
  | 'workflow_integrity_failure'
  /** A gate is closed — denied, expired, revoked or stale. */
  | 'authorization_blocked'
  /** The next state's prerequisites are not met. */
  | 'prerequisite_blocked'
  /** The tick itself failed. */
  | 'scheduler_error'
  /** A dependency was reachable but not serving, past its retry budget. */
  | 'external_dependency_unavailable'

/**
 * Severity per failure class, as a total map so a new class cannot be added
 * without deciding how loudly it speaks.
 *
 * `verification_failed` is `high` rather than `critical` by default because most
 * negative findings are ordinary work — a QA check that did not pass. The cases
 * that ARE critical are promoted explicitly by the caller (see
 * `criticalCheckKeys`), because criticality is about WHICH check failed, not
 * that one did.
 */
export const FAILURE_SEVERITY: Record<WorkflowFailureClass, Severity> = {
  workflow_integrity_failure:     'critical',
  verification_failed:            'high',
  verification_error:             'high',
  prerequisite_blocked:           'high',
  external_dependency_unavailable:'high',
  scheduler_error:                'high',
  verification_blocked:           'normal',
  verification_stale:             'normal',
  authorization_blocked:          'normal',
}

/**
 * Checks whose failure is a safety event rather than a QA result, promoted to
 * `critical` whatever their class.
 *
 * `anonymous_protected_access_denied` failing means protected material is
 * reachable without a session — the runbook's most dangerous condition, since
 * the release gate is fail-open. This is a set of check keys rather than a
 * project-specific branch: the engine ranks what an adapter declares critical.
 */
export const CRITICAL_CHECK_KEYS: readonly string[] = [
  'anonymous_protected_access_denied',
  'release_gate_exists',
  // PR7 — deployed-source drift. A protected-content consumer running stale
  // access or manifest logic is the condition where the gate says YES and the
  // allowlist says NO, which surfaces as a permissions bug and hides real
  // exposure. Consumers disagreeing means at least one was never redeployed.
  'shared_manifest_consumers_in_sync',
  'deployed_manifest_matches_expected',
  'sign_protected_asset_source_current',
  'get_protected_ebook_source_current',
]

export function severityFor(
  failureClass: WorkflowFailureClass, checkKey?: string | null,
): Severity {
  if (checkKey && CRITICAL_CHECK_KEYS.includes(checkKey)) return 'critical'
  return FAILURE_SEVERITY[failureClass]
}

/** Deterministic remediation, where one exists. Never a guess. */
const REMEDIATION: Record<WorkflowFailureClass, string> = {
  workflow_integrity_failure:
    'Do not advance this instance. Inspect workflow_transitions for a move the definition does not declare.',
  verification_failed:
    'Read the recorded evidence for the failing check and correct the underlying condition, then re-verify.',
  verification_error:
    'The check produced an unusable result. Inspect the evidence detail; re-run once the cause is understood.',
  verification_stale:
    'Evidence was produced against a different target. Re-run the check and submit fresh evidence.',
  verification_blocked:
    'The check could not run. Usually a missing credential or an unreachable dependency — see the detail.',
  authorization_blocked:
    'The gate is not open. Request a new authorization, or ask the approver to decide the pending one.',
  prerequisite_blocked:
    'An earlier state has not been completed on this pass. Complete it before advancing.',
  scheduler_error:
    'The tick failed for this instance. It keeps its wake and will be retried; investigate if it repeats.',
  external_dependency_unavailable:
    'A dependency stayed unavailable past its retry budget. Check the service before re-running.',
}

// ── Signal identity ──────────────────────────────────────────────────────────

export interface WorkflowConditionKey {
  instanceId: string
  state: string
  failureClass: WorkflowFailureClass
  checkKey?: string | null
  /** Binds the condition to a version of the thing. A moved target is a new condition. */
  targetHash?: string | null
}

/**
 * One condition's stable identity.
 *
 * Binding the target hash is what makes "the same failure about newly-rebuilt
 * artefacts" a NEW condition rather than a repeat of the old one — the operator
 * needs to know it happened again to something different.
 */
export function deriveWorkflowSignalKey(key: WorkflowConditionKey): string {
  return canonicalTargetVersionHash({
    kind: 'workflow.condition',
    instance_id: key.instanceId,
    state: key.state,
    failure_class: key.failureClass,
    check_key: key.checkKey ?? null,
    target_hash: key.targetHash ?? null,
  })
}

// ── Payload ──────────────────────────────────────────────────────────────────

export interface WorkflowSignalPayload extends Record<string, unknown> {
  signal_key: string
  failure_class: WorkflowFailureClass
  severity: Severity
  instance_id: string
  instance_key: string
  def_key: string
  def_version: number
  def_hash: string
  state: string
  check_key: string | null
  target_hash: string | null
  observed_at: string
  /** Where the finding came from: 'automated', 'attested', or the engine itself. */
  provenance: string | null
  evidence_refs: string[]
  summary: string
  remediation: string
}

export interface RaiseWorkflowSignalInput {
  projectId: string
  instanceId: string
  instanceKey: string
  defKey: string
  defVersion: number
  defHash: string
  state: string
  failureClass: WorkflowFailureClass
  checkKey?: string | null
  targetHash?: string | null
  provenance?: string | null
  evidenceRefs?: string[]
  summary: string
  observedAt: string
}

export type RaiseOutcome = 'raised' | 'regressed' | 'unchanged'

export interface RaiseResult {
  outcome: RaiseOutcome
  signalKey: string
  severity: Severity
  /** Null when nothing was appended. */
  signal: SignalRecord<WorkflowSignalPayload> | null
}

type AnyDb = any

/**
 * The write half, injectable for tests.
 *
 * Production always uses `recordSignal` — the sanctioned Signal Platform write
 * path. Nothing here inserts into atlas_signals directly, so the storage
 * contract stays in one place, exactly as lib/atlas/signals.ts requires.
 */
export type SignalWriter = typeof recordSignal

/**
 * The newest lifecycle event for one condition, or null if it has never been
 * seen. Read through the sanctioned signal columns; nothing here writes.
 */
async function latestEventFor(
  db: AnyDb, signalKey: string,
): Promise<{ kind: string; produced_at: string } | null> {
  const { data, error } = await db
    .from('atlas_signals')
    .select('kind, produced_at')
    .in('kind', WORKFLOW_SIGNAL_KINDS)
    .eq('payload->>signal_key', signalKey)
    .order('produced_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`latestEventFor failed: ${error.message}`)
  return (data?.[0] as { kind: string; produced_at: string } | undefined) ?? null
}

/**
 * Record that a condition is present.
 *
 * Appends only when the lifecycle actually changes:
 *   never seen        → `raised`
 *   previously resolved → `regressed`
 *   already open      → `unchanged`, and NOTHING is written
 *
 * That last branch is the whole reason a per-minute tick does not become a
 * per-minute incident log.
 */
export async function raiseWorkflowSignal(
  input: RaiseWorkflowSignalInput,
  db: AnyDb = createAdminClient(),
  write: SignalWriter = recordSignal,
): Promise<RaiseResult> {
  const signalKey = deriveWorkflowSignalKey({
    instanceId: input.instanceId, state: input.state,
    failureClass: input.failureClass, checkKey: input.checkKey, targetHash: input.targetHash,
  })
  const severity = severityFor(input.failureClass, input.checkKey)

  const latest = await latestEventFor(db, signalKey)
  if (latest && latest.kind !== WORKFLOW_SIGNAL_KIND.resolved) {
    return { outcome: 'unchanged', signalKey, severity, signal: null }
  }

  const kind = latest ? WORKFLOW_SIGNAL_KIND.regressed : WORKFLOW_SIGNAL_KIND.raised
  const payload: WorkflowSignalPayload = {
    signal_key: signalKey,
    failure_class: input.failureClass,
    severity,
    instance_id: input.instanceId,
    instance_key: input.instanceKey,
    def_key: input.defKey,
    def_version: input.defVersion,
    def_hash: input.defHash,
    state: input.state,
    check_key: input.checkKey ?? null,
    target_hash: input.targetHash ?? null,
    observed_at: input.observedAt,
    provenance: input.provenance ?? null,
    evidence_refs: input.evidenceRefs ?? [],
    summary: input.summary,
    remediation: REMEDIATION[input.failureClass],
  }

  const signal = await write<WorkflowSignalPayload>({
    contentId: null, projectId: input.projectId, source: 'workflow',
    kind, payload, version: WORKFLOW_SIGNAL_VERSION,
  })

  return { outcome: latest ? 'regressed' : 'raised', signalKey, severity, signal }
}

/**
 * Record that a condition no longer describes current state.
 *
 * Appends a `resolved` event; it never edits or deletes the original. A
 * condition that was never open resolves to `unchanged` — resolving something
 * that never happened would be a fact about nothing.
 */
export async function resolveWorkflowSignal(
  input: {
    projectId: string
    signalKey: string
    summary: string
    observedAt: string
  },
  db: AnyDb = createAdminClient(),
  write: SignalWriter = recordSignal,
): Promise<{ resolved: boolean }> {
  const latest = await latestEventFor(db, input.signalKey)
  if (!latest || latest.kind === WORKFLOW_SIGNAL_KIND.resolved) return { resolved: false }

  await write({
    contentId: null, projectId: input.projectId, source: 'workflow',
    kind: WORKFLOW_SIGNAL_KIND.resolved,
    payload: { signal_key: input.signalKey, summary: input.summary, observed_at: input.observedAt },
    version: WORKFLOW_SIGNAL_VERSION,
  })
  return { resolved: true }
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface ActiveWorkflowSignal {
  signalKey: string
  kind: string
  payload: WorkflowSignalPayload
  producedAt: string
}

/**
 * Conditions currently open for a project — derived from the event chain, never
 * from a status column. A condition is open when its newest event is not
 * `resolved`.
 */
export async function listActiveWorkflowSignals(
  projectId: string,
  db: AnyDb = createAdminClient(),
  limit = 200,
): Promise<ActiveWorkflowSignal[]> {
  const { data, error } = await db
    .from('atlas_signals')
    .select('kind, payload, produced_at')
    .eq('project_id', projectId)
    .in('kind', WORKFLOW_SIGNAL_KINDS)
    .order('produced_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listActiveWorkflowSignals failed: ${error.message}`)

  const newest = new Map<string, ActiveWorkflowSignal>()
  for (const row of (data ?? []) as { kind: string; payload: WorkflowSignalPayload; produced_at: string }[]) {
    const key = row.payload?.signal_key
    if (!key || newest.has(key)) continue         // rows arrive newest-first
    newest.set(key, { signalKey: key, kind: row.kind, payload: row.payload, producedAt: row.produced_at })
  }
  return [...newest.values()]
    .filter(s => s.kind !== WORKFLOW_SIGNAL_KIND.resolved)
    .sort((a, b) => SEVERITY_RANK[a.payload.severity] - SEVERITY_RANK[b.payload.severity])
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2 }

// ── Notification ─────────────────────────────────────────────────────────────

/**
 * Operator email, DEFAULT OFF.
 *
 * Signal generation is the load-bearing half of PR6 and lands enabled; email is
 * behind a flag so the first weeks of real escalations can be watched in the UI
 * before anything reaches an inbox. Flipping `WORKFLOW_ESCALATION_EMAIL=1` is a
 * deliberate act.
 */
export function isEscalationEmailEnabled(): boolean {
  return process.env.WORKFLOW_ESCALATION_EMAIL === '1'
}

/**
 * Which severities may ever produce email.
 *
 * `normal` never does — those are UI-only by policy, and a workflow blocked on a
 * missing credential is not worth waking someone for. `critical` and `high` may,
 * and only on a lifecycle CHANGE: `raiseWorkflowSignal` returns `unchanged` for a
 * repeat, and this is only called when it did not.
 */
export function shouldNotify(severity: Severity, outcome: RaiseOutcome): boolean {
  if (outcome === 'unchanged') return false
  return severity === 'critical' || severity === 'high'
}

/**
 * Cooldown, so a condition that flaps cannot become a mail storm.
 *
 * Derived from the signal's own event history rather than a stored timestamp: if
 * this condition already produced a lifecycle event inside the window, it does
 * not notify again. Critical conditions use a shorter window than high ones
 * because the cost of a duplicate is lower than the cost of a missed one.
 */
export const NOTIFY_COOLDOWN_MINUTES: Record<Severity, number> = {
  critical: 15,
  high: 120,
  normal: Number.POSITIVE_INFINITY,
}

export interface NotificationDecision {
  notify: boolean
  reason: 'disabled' | 'severity' | 'unchanged' | 'cooldown' | 'send'
}

/**
 * Pure decision, so the policy is testable without a mail transport.
 * `previousEventAt` is the last lifecycle event for this condition, if any.
 */
export function decideNotification(input: {
  severity: Severity
  outcome: RaiseOutcome
  now: string
  previousEventAt?: string | null
}): NotificationDecision {
  if (!isEscalationEmailEnabled()) return { notify: false, reason: 'disabled' }
  if (input.outcome === 'unchanged') return { notify: false, reason: 'unchanged' }
  if (!shouldNotify(input.severity, input.outcome)) return { notify: false, reason: 'severity' }

  if (input.previousEventAt) {
    const minutes = (Date.parse(input.now) - Date.parse(input.previousEventAt)) / 60_000
    if (minutes < NOTIFY_COOLDOWN_MINUTES[input.severity]) {
      return { notify: false, reason: 'cooldown' }
    }
  }
  return { notify: true, reason: 'send' }
}

/**
 * The operator email body.
 *
 * Carries what someone needs in order to act — project, month, state, the
 * problem, the severity and the deterministic next step — and nothing else. No
 * payload dump, no credential, no customer data. There is no customer-facing
 * send path anywhere in this module.
 */
export function escalationEmail(payload: WorkflowSignalPayload): { subject: string; html: string } {
  const subject =
    `[${payload.severity.toUpperCase()}] ${payload.def_key} ${payload.instance_key} — ${payload.failure_class}`
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666">${label}</td><td style="padding:4px 0"><code>${value}</code></td></tr>`
  const html = `
    <h2 style="font:600 16px system-ui">Workflow escalation</h2>
    <table style="font:14px system-ui;border-collapse:collapse">
      ${row('Workflow', `${payload.def_key} v${payload.def_version}`)}
      ${row('Instance', payload.instance_key)}
      ${row('State', payload.state)}
      ${row('Problem', payload.failure_class)}
      ${row('Check', payload.check_key ?? '—')}
      ${row('Severity', payload.severity)}
      ${row('Observed', payload.observed_at)}
    </table>
    <p style="font:14px system-ui"><strong>What happened:</strong> ${payload.summary}</p>
    <p style="font:14px system-ui"><strong>Next step:</strong> ${payload.remediation}</p>
    <p style="font:12px system-ui;color:#666">
      Omnira does not act on this by itself. Nothing has been published, uploaded or sent.
    </p>`
  return { subject, html }
}

// ── Instance health ──────────────────────────────────────────────────────────

export type WorkflowHealth = 'healthy' | 'waiting' | 'blocked' | 'failed' | 'critical'

/**
 * One word for an operator, derived from what is actually open.
 *
 * `healthy` requires the absence of open conditions — it is never asserted from
 * a passing check, because a check that never ran also does not fail.
 */
export function deriveWorkflowHealth(
  signals: readonly ActiveWorkflowSignal[],
  awaitingHumanGate: boolean,
): WorkflowHealth {
  if (signals.some(s => s.payload.severity === 'critical')) return 'critical'
  if (signals.some(s => s.payload.failure_class === 'verification_failed'
                     || s.payload.failure_class === 'workflow_integrity_failure')) return 'failed'
  if (signals.length > 0) return 'blocked'
  return awaitingHumanGate ? 'waiting' : 'healthy'
}
