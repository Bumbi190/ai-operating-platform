/**
 * lib/atlas/context/readers/active-work.ts — ② Active-work reader (CL Commit 2)
 *
 * Canonical §6.5 dim ②: "atlas_actions + in-flight runs — session/cross-
 * session working memory." Two bounded factual reads, one SOFT block:
 *
 *  1. The recent action ledger via `buildActionMemory` (reused as-is,
 *     mapping §1.2) — renders the existing [SENASTE ÅTGÄRDER] block and
 *     reports `hasRecentDelegation` (the route's honesty-guard input, carried
 *     in `meta` so the cutover commits never re-parse text).
 *  2. In-flight runs — the canonical doc names this source explicitly for ②;
 *     it is a declared source, not a silent addition. Bounded read of `runs`
 *     in non-terminal states ('pending' | 'running' | 'awaiting_approval' —
 *     the durable-drain vocabulary), newest first, capped, project-scoped
 *     via `applyProjectScope`.
 *
 * Boundaries held: no ranking or relevance judgment (fixed states, fixed
 * recency order, fixed cap); no tool/model call; empty allow-list → zero
 * rows (impossible-id isolation). Never throws; on failure each half
 * degrades independently and a fully empty read returns `null`.
 */

import { buildActionMemory } from '@/lib/atlas/action-memory'
import { applyProjectScope } from '@/lib/atlas/isolation'
import type { ContextRequest } from '@/lib/atlas/context/request'
import type { ContextBlock, ReaderEnv } from './index'

/** Non-terminal run states = "in flight" (see runs drain: pending → running → done/failed/cancelled…). */
const IN_FLIGHT_STATUSES = ['pending', 'running', 'awaiting_approval'] as const

const MAX_IN_FLIGHT = 10

export interface InFlightRun {
  id: string
  status: string
  created_at: string
  workflows?: { name?: string | null } | null
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.round(ms / 60000)
  if (min < 1) return 'nyss'
  if (min < 60) return `${min} min sedan`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h sedan`
  return `${Math.round(h / 24)} d sedan`
}

/**
 * Pure render of the in-flight-runs section. Exported for DB-free unit
 * tests. Returns '' when there is nothing in flight (block half is absent).
 */
export function renderInFlightRuns(rows: InFlightRun[]): string {
  if (!rows.length) return ''
  const lines = [
    `\n\n[PÅGÅENDE KÖRNINGAR — arbete i flykt just nu (körningsledger). Rapportera status HÄRIFRÅN; "pending" är köad, inte startad.]`,
  ]
  for (const r of rows) {
    const wf = r.workflows?.name ? ` ${r.workflows.name}` : ''
    const t = ageLabel(r.created_at)
    lines.push(`- [${r.status}]${wf} · id=${r.id}${t ? ` · skapad ${t}` : ''}`)
  }
  return lines.join('\n')
}

/** Bounded, project-scoped read of non-terminal runs. Never throws. */
async function readInFlightRuns(env: ReaderEnv): Promise<InFlightRun[]> {
  try {
    const { data } = await applyProjectScope(
      (env.db.from('runs') as any)
        .select('id, status, created_at, workflows(name)')
        .in('status', [...IN_FLIGHT_STATUSES])
        .order('created_at', { ascending: false })
        .limit(MAX_IN_FLIGHT),
      env.allowedProjectIds,
    )
    return (data ?? []) as InFlightRun[]
  } catch {
    return []
  }
}

/** ② Active work — `ContextRequest → block | null`. Never throws. */
export async function readActiveWork(_req: ContextRequest, env: ReaderEnv): Promise<ContextBlock | null> {
  const [actions, inFlight] = await Promise.all([
    buildActionMemory(env.db, env.allowedProjectIds), // returns empty/false on error by contract
    readInFlightRuns(env),
  ])

  const text = actions.text + renderInFlightRuns(inFlight)
  if (!text) return null

  return {
    dimension: 'activeWork',
    channel: 'soft',
    text,
    meta: {
      hasRecentDelegation: actions.hasRecentDelegation,
      inFlightCount: inFlight.length,
    },
  }
}
