/**
 * lib/article/factcheck/gate.ts
 *
 * The publication precondition the review route applies before publishArticle.
 *
 * Rows produced by the fact-checked workflow carry meta.factcheck_required =
 * true. For them, operator approval alone is NOT enough: the stored fact-check
 * must have passed, it must have been computed on exactly the headline, lede
 * and body that would be published (the payload publishArticle receives), and
 * article QA must have passed too. QA passing never stands
 * in for the fact-check, and vice versa.
 *
 * Rows without the marker (the existing operator/cron generate paths) keep
 * their current behaviour.
 */

import { factCheckAllowsPublication } from './contract'

export interface GateRow {
  payload: unknown
  qa: unknown
  meta: unknown
}

export function publicationGate(row: GateRow): { ok: true } | { ok: false; reason: string } {
  const meta = (row.meta ?? {}) as Record<string, unknown>
  if (meta.factcheck_required !== true) return { ok: true }

  const qa = (row.qa ?? {}) as { pass?: unknown }
  if (qa.pass !== true) return { ok: false, reason: 'article_qa_not_passed' }

  const payload = (row.payload ?? {}) as { title?: unknown; summary?: unknown; body?: unknown }
  const { title, summary, body } = payload
  if (typeof title !== 'string' || !title.trim()) return { ok: false, reason: 'payload_title_missing' }
  if (summary != null && typeof summary !== 'string') return { ok: false, reason: 'payload_summary_invalid' }
  if (typeof body !== 'string' || !body.trim()) return { ok: false, reason: 'payload_body_missing' }

  return factCheckAllowsPublication(meta.factcheck, { title, summary, body })
}
