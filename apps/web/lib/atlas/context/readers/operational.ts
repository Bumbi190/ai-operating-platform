/**
 * lib/atlas/context/readers/operational.ts — ① Operational reader (CL Commit 2)
 *
 * Wraps `gatherAtlasContext` (lib/atlas/context.ts) as one bounded SOFT block
 * (canonical §6.5 dim ①: "Live ground truth; never replaced by ④/⑤").
 *
 * Fidelity contract: `renderOperationalBlock` reproduces the [LIVE LÄGE]
 * rendering of `chat/route.ts#buildLiveContext` byte-for-byte for the same
 * `AtlasContext`, so the Stage-0 shadow diff (Commit 5 gate) compares
 * structure, not accidental rewording. Two deliberate differences, both
 * mapped, neither silent:
 *
 *  - NO [BESLUT] here. Operator decisions are the HARD constraints channel,
 *    selected by Retrieval (`selectActiveDecisions`) and injected ONCE
 *    (canonical §6.5). The constraints reader (Stage 1) owns them; rendering
 *    them in ① would duplicate the channel this milestone unifies.
 *  - ONLY `gatherAtlasContext`. The other live slices `buildLiveContext`
 *    concatenates today (operator patterns, content score, opportunities,
 *    agent activity, revenue intel, operations, dream findings) are further
 *    ①-dimension sources; per Invariant E they fold into this reader as
 *    reader-local additions when the assembler takes over the live path
 *    (Stage 0 Commit 5 / Stage 1), with the shadow diff as the gate. Until
 *    then the legacy path keeps serving them — nothing is dropped.
 *
 * Boundaries held: bounded factual read; no ranking, no relevance-
 * truncation, no tool/model call; scoping via the caller's allow-list passed
 * straight into `gatherAtlasContext` (which applies `applyProjectScope` on
 * every query). Never throws — a failed read degrades to `null`.
 */

import { gatherAtlasContext, type AtlasContext } from '@/lib/atlas/context'
import type { ContextRequest } from '@/lib/atlas/context/request'
import type { ContextBlock, ReaderEnv } from './index'

const k = (n: number) => `${Math.round(n)} kr`

/**
 * Pure render of the ① block from an `AtlasContext`. Exported for DB-free
 * unit tests (M4 discipline). Mirrors `buildLiveContext`'s [LIVE LÄGE]
 * section verbatim — excluding [BESLUT] (HARD channel, see header).
 */
export function renderOperationalBlock(ctx: AtlasContext): string {
  return `\n\n[LIVE LÄGE — ${new Date().toLocaleString('sv-SE')}]
Kostnad idag: ${k(ctx.totals.costTodaySek)} · denna månad: ${k(ctx.totals.costMonthSek)} (prognos ${k(ctx.totals.forecastMonthSek)}).
Intäkt denna månad: ${k(ctx.totals.revenueMonthSek)}. Väntande godkännanden: ${ctx.totals.pendingApprovals}. Fallerade körningar (24h): ${ctx.totals.failedRuns24h}.
Verksamheter:
${ctx.businesses.map(b => `- ${b.name}: intäkt ${k(b.revenueMonthSek)}, kostnad ${k(b.costMonthSek)}, ${b.qualifiedLeads} leads, ${b.publishedThisWeek} publicerat denna vecka, ${b.pendingReview} att granska.`).join('\n')}${ctx.topPriority ? `\nViktigaste åtgärden nu: ${ctx.topPriority.label}.` : ''}`
}

/** ① Operational — `ContextRequest → block | null`. Never throws. */
export async function readOperational(_req: ContextRequest, env: ReaderEnv): Promise<ContextBlock | null> {
  try {
    const ctx = await gatherAtlasContext(env.db, env.allowedProjectIds)
    return {
      dimension: 'operational',
      channel: 'soft',
      text: renderOperationalBlock(ctx),
      // Structured facts for later composition stages; content is not
      // re-parsed from text. Decisions ride along for the Stage-1
      // constraints unification but are NOT rendered in this block.
      meta: { generatedAt: ctx.generatedAt, decisions: ctx.decisions },
    }
  } catch {
    return null
  }
}
