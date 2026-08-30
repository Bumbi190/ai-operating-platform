/**
 * lib/atlas/knowledge/projection/report.ts — the operator's answer to
 * "what would publish, and why is everything else held back?"
 *
 * Pure and deterministic: the same listing renders byte-identically every run,
 * so two reports can be diffed to see what curation actually changed.
 *
 * Metadata only. Titles, paths, hashes, statuses and reason codes — never note
 * bodies, never excerpts, and never a matched secret value.
 */

import type { IneligibilityReason } from './eligibility'
import { containsSecretShape, redactSecretShapes } from './secret-scan'
import type { ProjectionCandidate, ProjectionListing } from './source'

/**
 * THE choke point for rendering source-controlled text.
 *
 * Every field below comes from a note someone wrote: path, title, project,
 * canonical_path, and diagnostics that quote rejected frontmatter verbatim. A
 * credential pasted into any of them would otherwise be detected AND echoed by
 * the same report — the scanner staying clean is not enough if the renderer
 * leaks. One rule, applied to every such field, rather than per-field patches
 * that the next field forgets.
 */
function safe(value: string): string {
  return redactSecretShapes(value)
}

/**
 * A path is the operator's way to find a note, so it is redacted only when it
 * actually carries a credential shape — and then the note stays identifiable by
 * its stable id and content hash, which are derived values and never source text.
 */
function safePath(path: string, id: string): string {
  return containsSecretShape(path) ? `[REDACTED PATH — SECRET SHAPE DETECTED] (id ${id})` : path
}

/** What each reason code means, and what the operator would do about it. */
export const REASON_GUIDANCE: Record<IneligibilityReason, string> = {
  folder_excluded: 'in 00 Inbox or 90 Archive — never published (policy v1 §6.6)',
  status_not_approved: 'status is not "approved" — editorial approval is required (§6.5)',
  type_missing_or_unrecognized: 'type is missing or outside the vocabulary',
  canonical_pointer_missing: 'source_of_truth: repository without canonical_path',
  source_of_truth_unrecognized: 'source_of_truth declared but outside the vocabulary',
  classification_missing: 'explicit classification required by Publication Policy v1 (§6.1)',
  classification_unrecognized:
    'classification outside the vocabulary — valid: public, internal, confidential, ' +
    'local_only. "prohibited" is not a classification (§6.2)',
  classification_confidential_remote_blocked:
    'confidential is recognized but remote-blocked in transport v1 — stays local until ' +
    'a constrained reader is authorized (§6.1)',
  classification_local_only: 'classified local_only — never leaves this machine (§6.1)',
  scope_missing: 'explicit scope required by Publication Policy v1 — declare platform or project (§6.3)',
  scope_unrecognized: 'scope outside the vocabulary — valid: platform, project (§6.3)',
  platform_scope_project_conflict:
    'scope: platform must not carry a project — remove the project field, ' +
    'scope: platform already carries that meaning (§6.3)',
  project_scope_missing: 'scope: project requires a project slug (§6.3)',
  project_scope_unmapped: 'project slug has no canonical mapping in public.projects (§6.3)',
  secret_detected: 'credential-shaped material found — remove it before publishing (§6.2)',
}

export interface ReportOptions {
  /** Shown for orientation; never used to resolve anything. */
  vaultRoot?: string
}

function summarizeReasons(candidates: ProjectionCandidate[]): [IneligibilityReason, number][] {
  const counts = new Map<IneligibilityReason, number>()
  for (const c of candidates) {
    for (const r of c.eligibility.reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  // Descending count, then reason name — deterministic for equal counts.
  return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
}

function renderCandidate(c: ProjectionCandidate): string[] {
  const lines: string[] = []
  lines.push(`${c.eligibility.eligible ? 'ELIGIBLE  ' : 'ineligible'}  ${safePath(c.path, c.id)}`)
  lines.push(`    title           ${safe(c.title)}`)
  lines.push(`    id / hash       ${c.id} / ${c.contentHash.slice(0, 16)}…`)
  lines.push(`    type / status   ${c.type ?? '—'} / ${c.status ?? '—'}`)
  lines.push(`    project         ${c.project ? safe(c.project) : '—'}`)
  lines.push(
    `    source-of-truth ${c.trustedSourceOfTruth}` +
      (c.declaredSourceOfTruth && c.declaredSourceOfTruth !== c.trustedSourceOfTruth
        ? `  (declared ${c.declaredSourceOfTruth}, not honoured)`
        : ''),
  )
  lines.push(`    canonical path  ${c.canonicalPath ? safe(c.canonicalPath) : '—'}`)
  lines.push(`    classification  ${c.eligibility.classification ?? '— (none declared)'}`)
  lines.push(
    `    scope           ${
      c.eligibility.scope
        ? c.eligibility.scope.kind === 'platform'
          ? 'platform'
          : `project:${c.eligibility.scope.projectId}`
        : '— (unresolved)'
    }`,
  )
  lines.push(`    modified        ${c.modifiedAt}`)
  if (c.eligibility.secretFindings.length) {
    // Pattern names and counts only — never the matched text.
    const shapes = c.eligibility.secretFindings.map((f) => `${f.pattern}×${f.count}`).join(', ')
    lines.push(`    SECRET SHAPES   ${shapes}`)
  }
  // Diagnostics quote rejected frontmatter values verbatim — the most direct
  // leak path of all, and the one the original implementation missed.
  for (const d of c.diagnostics) lines.push(`    ! ${d.issue} — ${d.field}: ${safe(d.detail)}`)
  for (const r of c.eligibility.reasons) lines.push(`    ✗ ${r} — ${REASON_GUIDANCE[r]}`)
  return lines
}

/** Deterministic plain-text operator report. */
export function renderProjectionReport(listing: ProjectionListing, options: ReportOptions = {}): string {
  const a = listing.accounting
  const lines: string[] = []

  lines.push('OMNIRA KNOWLEDGE PROJECTION — ELIGIBILITY REPORT (evaluation only; nothing is published)')
  lines.push('')
  lines.push(`source              ${listing.sourceId}`)
  if (options.vaultRoot) lines.push(`vault               ${options.vaultRoot}`)
  lines.push('')
  lines.push('ACCOUNTING')
  lines.push(`  files discovered     ${a.filesDiscovered}`)
  lines.push(`  files unreadable     ${a.filesUnreadable}`)
  lines.push(`  candidates evaluated ${a.candidatesEvaluated}`)
  lines.push(`  eligible             ${a.eligible}`)
  lines.push(`  ineligible           ${a.ineligible}`)
  lines.push(`  reconciled           yes (${a.filesUnreadable} + ${a.candidatesEvaluated} = ${a.filesDiscovered})`)
  lines.push('')

  if (listing.unreadable.length) {
    lines.push('UNREADABLE')
    for (const p of listing.unreadable) lines.push(`  ${safe(p)}`)
    lines.push('')
  }

  const reasons = summarizeReasons(listing.candidates)
  if (reasons.length) {
    lines.push('WHY NOTES ARE HELD BACK')
    for (const [reason, count] of reasons) {
      lines.push(`  ${String(count).padStart(4)}  ${reason} — ${REASON_GUIDANCE[reason]}`)
    }
    lines.push('')
  }

  lines.push('NOTES')
  for (const c of listing.candidates) {
    lines.push(...renderCandidate(c))
    lines.push('')
  }

  lines.push('POLICY')
  lines.push('  Publication Policy v1 is LOCKED — VAULT_POLICY.md §6.')
  lines.push('  classification: public | internal | confidential | local_only')
  lines.push('                  remote in v1: public, internal. confidential stays local.')
  lines.push('  scope         : platform | project (always explicit; never inferred)')
  lines.push('  Nothing is published by this report. It evaluates eligibility only.')
  lines.push('')
  lines.push(
    a.eligible === 0
      ? 'RESULT: 0 notes are remotely publishable. An empty eligible set is a valid ' +
        'answer — curate notes rather than widening the policy.'
      : `RESULT: ${a.eligible} of ${a.candidatesEvaluated} notes would be remotely publishable.`,
  )

  return lines.join('\n') + '\n'
}
