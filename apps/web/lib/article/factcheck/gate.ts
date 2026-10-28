/**
 * lib/article/factcheck/gate.ts
 *
 * The publication precondition the review route applies before publishArticle.
 *
 * Rows produced by the fact-checked workflow carry meta.factcheck_required =
 * true. For them, operator approval alone is NOT enough: the stored fact-check
 * must have passed, it must have been computed on exactly the body that would
 * be published, and article QA must have passed too. QA passing never stands
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

  const body = (row.payload as { body?: unknown } | null)?.body
  if (typeof body !== 'string' || !body.trim()) return { ok: false, reason: 'payload_body_missing' }

  return factCheckAllowsPublication(meta.factcheck, body)
}
