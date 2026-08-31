/**
 * lib/cost/spend-identity.ts — the one way to name a logical spend.
 *
 * ── WHY A HELPER AND NOT A STRING LITERAL AT EACH CALL SITE ─────────────────
 * `spend_reservations.idempotency_key` is globally unique. That makes a
 * hand-rolled key dangerous in BOTH directions:
 *
 *   too narrow — a key containing a timestamp, a UUID or the prompt text changes
 *                between retries, so the retry reserves a second time. Harmless
 *                to the budget, but the key then proves nothing.
 *   too broad  — a key that omits what actually distinguishes two spends makes
 *                the second one a `replay_settled` REFUSAL. A false dedup does
 *                not over-count; it silently stops legitimate work.
 *
 * The second failure is the dangerous one and it is easy to write by accident,
 * so the shape is built here rather than at nineteen call sites.
 *
 * ── WHAT GOES IN ────────────────────────────────────────────────────────────
 * project · provider · operation · subject. The subject is the business identity
 * of the thing being paid for — a script id, an article id, plus an ordinal
 * where one logical job buys several units. Two spends that differ in ANY of
 * these get different keys; a retry of the same spend gets the same one.
 *
 * Deliberately NOT included: prompt text, model, timestamps, attempt counters.
 * Prompt and model can legitimately change between retries of the same logical
 * spend (a rewrite after a quality gate is a DIFFERENT operation and says so),
 * and anything time-varying defeats the whole mechanism.
 *
 * ── ONLY WHERE IDENTITY IS REAL ─────────────────────────────────────────────
 * A caller with no stable subject must pass nothing. Every attempt then takes
 * its own reservation, which over-reserves on retry but can never under-reserve
 * or falsely dedup. That is the correct default and most call sites use it.
 */

import 'server-only'

import { createHash } from 'node:crypto'
import type { ProjectRef } from './governed-spend'

export interface SpendIdentity {
  project: ProjectRef
  /** Ledger provider name, e.g. 'elevenlabs'. */
  provider: string
  /** What is being bought. Must differ between semantically different spends. */
  operation: string
  /**
   * The business identity of the thing paid for — typically a row id. When one
   * job buys several units (N images for one script), include the ordinal so
   * each unit is its own spend rather than all of them colliding into one.
   */
  subject: string
}

/**
 * A stable, collision-resistant key for one logical spend.
 *
 * Hashed rather than concatenated: the parts can contain separators, and a
 * bounded fixed-width key keeps the unique index predictable. The `v1:` prefix
 * means a future change to what identity MEANS can be rolled out without
 * colliding with keys minted under the old rule.
 */
export function spendIdempotencyKey(id: SpendIdentity): string {
  const project = 'projectId' in id.project ? `id:${id.project.projectId}` : `slug:${id.project.projectSlug}`
  const material = JSON.stringify([project, id.provider, id.operation, id.subject])
  return `v1:${createHash('sha256').update(material).digest('hex').slice(0, 40)}`
}
