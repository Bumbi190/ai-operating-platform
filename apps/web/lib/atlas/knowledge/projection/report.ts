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

import { PENDING_POLICY_DECISIONS, type IneligibilityReason } from './eligibility'
import type { ProjectionCandidate, ProjectionListing } from './source'

/** What each reason code means, and what the operator would do about it. */
export const REASON_GUIDANCE: Record<IneligibilityReason, string> = {
  folder_excluded: 'in 00 Inbox or 90 Archive — move it into a curated folder',
  status_not_approved: 'status is not "approved" — review and approve it',
  type_missing_or_unrecognized: 'type is missing or outside the vocabulary',
  canonical_pointer_missing: 'source_of_truth: repository without canonical_path',
  classification_missing: 'no classification declared (vocabulary lands in Slice 2)',
  classification_unrecognized: 'classification outside the provisional vocabulary',
  classification_local_only: 'classified local_only — deliberately never published',
  scope_missing: 'no publication scope: declare scope: platform, or a project',
  project_scope_unmapped: 'project has no declared project-id mapping (Slice 2)',
  secret_detected: 'credential-shaped material found — remove it before publishing',
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
  lines.push(`${c.eligibility.eligible ? 'ELIGIBLE  ' : 'ineligible'}  ${c.path}`)
  lines.push(`    title           ${c.title}`)
  lines.push(`    id / hash       ${c.id} / ${c.contentHash.slice(0, 16)}…`)
  lines.push(`    type / status   ${c.type ?? '—'} / ${c.status ?? '—'}`)
  lines.push(`    project         ${c.project ?? '—'}`)
  lines.push(
    `    source-of-truth ${c.trustedSourceOfTruth}` +
      (c.declaredSourceOfTruth && c.declaredSourceOfTruth !== c.trustedSourceOfTruth
        ? `  (declared ${c.declaredSourceOfTruth}, not honoured)`
        : ''),
  )
  lines.push(`    canonical path  ${c.canonicalPath ?? '—'}`)
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
  for (const d of c.diagnostics) lines.push(`    ! ${d.issue} — ${d.field}: ${d.detail}`)
  for (const r of c.eligibility.reasons) lines.push(`    ✗ ${r} — ${REASON_GUIDANCE[r]}`)
  return lines
}

/** Deterministic plain-text operator report. */
export function renderProjectionReport(listing: ProjectionListing, options: ReportOptions = {}): string {
  const a = listing.accounting
  const lines: string[] = []

  lines.push('OMNIRA KNOWLEDGE PROJECTION — ELIGIBILITY REPORT (Slice 1: no publication)')
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
    for (const p of listing.unreadable) lines.push(`  ${p}`)
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

  lines.push('PENDING POLICY DECISIONS (Slice 2)')
  for (const d of PENDING_POLICY_DECISIONS) lines.push(`  · ${d}`)
  lines.push('')
  lines.push(
    a.eligible === 0
      ? 'RESULT: 0 notes are remotely publishable. For a vault whose classification and ' +
        'scope vocabulary does not exist yet, that is the correct answer — not a failure.'
      : `RESULT: ${a.eligible} of ${a.candidatesEvaluated} notes would be remotely publishable.`,
  )

  return lines.join('\n') + '\n'
}
