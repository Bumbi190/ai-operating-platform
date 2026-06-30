/**
 * lib/atlas/memory/recall-memories.ts — Atlas Memory M4 Commit 5: recall (shadow).
 *
 * Reads memory back as a ranked, budgeted MemoryPack. Flag-gated by
 * ATLAS_MEMORY_RECALL (default OFF) — when off, recall is an inert no-op. This
 * commit is SHADOW ONLY: it computes and returns the pack; it does NOT inject into
 * any prompt (injection is Commit 6, behind ATLAS_MEMORY_INJECT).
 *
 * Functional core / imperative shell (matches the producer pattern):
 *   • assembleMemoryPack() — PURE: isolation belt, pin/focus salience, ranking,
 *     token budget, diversity cap. Deterministic; unit-tested without mocks.
 *   • recallMemories()     — SHELL: flag check, getAllowedProjectIds, the
 *     public.atlas_recall wrapper RPC, then assembleMemoryPack. Non-throwing — a
 *     recall failure returns an empty pack and logs (never breaks the host op).
 *
 * ISOLATION (the critical guardrail, ADR v3): scope is enforced in SQL
 * (atlas_recall only returns world + allowed-project rows) AND re-checked here as
 * a defensive belt. atlas-memory-recall.test.ts pins "foreign project → 0 rows".
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds } from '../isolation'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

// ── Types ───────────────────────────────────────────────────────────────────────

/** Focus reference from View Awareness (NormalizedView record → entity ref). */
export interface FocusRef {
  entityKind: string
  entityId: string
}

/** A raw row as returned by the public.atlas_recall wrapper (snake_case). */
export interface RecallRow {
  kind: 'memory' | 'event'
  id: string
  scope: string
  project_id: string | null
  memory_class: string
  entity_kind: string
  entity_id: string
  summary: string
  confidence: number
  evidence_count: number
  last_seen_at: string
  pinned: boolean
  salience: number | string
  focus_match: boolean
}

/** One ranked item in the MemoryPack (camelCase; effective salience applied). */
export interface MemoryRecallItem {
  kind: 'memory' | 'event'
  id: string
  scope: string
  projectId: string | null
  memoryClass: string
  entityKind: string
  entityId: string
  summary: string
  confidence: number
  evidenceCount: number
  lastSeenAt: string
  pinned: boolean
  /** Effective salience: base (or pin override) + focus boost, clamped to [0,1]. */
  salience: number
  focusMatch: boolean
}

export interface MemoryPack {
  items: MemoryRecallItem[]
  /** Rows considered after the isolation belt (before budget/diversity trimming). */
  totalConsidered: number
  budgetTokens: number
  /** true when ATLAS_MEMORY_RECALL is off → nothing was recalled. */
  skipped: boolean
}

// ── Tunables ─────────────────────────────────────────────────────────────────────

const PINNED_SALIENCE = 1.0
const FOCUS_BOOST = 0.15
const DEFAULT_BUDGET_TOKENS = 1_200
const CHARS_PER_TOKEN = 4 // coarse heuristic; no tokenizer dependency
const MAX_PER_ENTITY = 3 // diversity cap so one entity can't dominate the pack

export function isRecallEnabled(): boolean {
  return process.env.ATLAS_MEMORY_RECALL === '1'
}

// ── Functional core (pure, deterministic) ────────────────────────────────────────

export interface AssembleOptions {
  /** Allowed project ids (from getAllowedProjectIds). World rows always pass. */
  allowedProjectIds: string[]
  budgetTokens?: number
  maxPerEntity?: number
}

function effectiveSalience(row: RecallRow): number {
  const base = row.pinned ? PINNED_SALIENCE : Number(row.salience)
  const boosted = base + (row.focus_match ? FOCUS_BOOST : 0)
  return Math.min(1, Math.max(0, Number.isFinite(boosted) ? boosted : 0))
}

function toItem(row: RecallRow, salience: number): MemoryRecallItem {
  return {
    kind: row.kind,
    id: row.id,
    scope: row.scope,
    projectId: row.project_id,
    memoryClass: row.memory_class,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    summary: row.summary,
    confidence: Number(row.confidence),
    evidenceCount: row.evidence_count,
    lastSeenAt: row.last_seen_at,
    pinned: row.pinned,
    salience,
    focusMatch: row.focus_match,
  }
}

/**
 * Build a ranked, budgeted MemoryPack from raw recall rows. Pure.
 *   1. Isolation belt — keep only world rows or rows whose project is allowed.
 *   2. Effective salience — pin override + focus boost.
 *   3. Rank desc (stable tiebreak on id for determinism).
 *   4. Token budget + per-entity diversity cap.
 */
export function assembleMemoryPack(rows: RecallRow[], opts: AssembleOptions): MemoryPack {
  const budgetTokens = opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS
  const maxPerEntity = opts.maxPerEntity ?? MAX_PER_ENTITY
  const allowed = new Set(opts.allowedProjectIds)

  // 1. Isolation belt.
  const scoped = rows.filter(
    (r) => r.scope === 'world' || (r.project_id != null && allowed.has(r.project_id)),
  )

  // 2 + 3. Effective salience, then deterministic rank.
  const ranked = scoped
    .map((r) => toItem(r, effectiveSalience(r)))
    .sort((a, b) => (b.salience !== a.salience ? b.salience - a.salience : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // 4. Budget + diversity.
  let charBudget = budgetTokens * CHARS_PER_TOKEN
  const perEntity = new Map<string, number>()
  const items: MemoryRecallItem[] = []
  for (const it of ranked) {
    const ek = `${it.entityKind}:${it.entityId}`
    const used = perEntity.get(ek) ?? 0
    if (used >= maxPerEntity) continue
    const cost = it.summary.length
    if (cost > charBudget) continue
    items.push(it)
    charBudget -= cost
    perEntity.set(ek, used + 1)
  }

  return { items, totalConsidered: scoped.length, budgetTokens, skipped: false }
}

// ── Imperative shell (I/O) ───────────────────────────────────────────────────────

export interface RecallArgs {
  /** Owner whose allowed projects scope the recall (manager/agent identity). */
  userId: string | null
  focus?: FocusRef[]
  episodicDays?: number
  limit?: number
  budgetTokens?: number
  db?: AnyDb
}

/**
 * Recall a MemoryPack for the given identity + focus. Shadow only (no injection).
 * Returns { skipped:true } when ATLAS_MEMORY_RECALL is off. Never throws.
 */
export async function recallMemories(args: RecallArgs): Promise<MemoryPack> {
  const budgetTokens = args.budgetTokens ?? DEFAULT_BUDGET_TOKENS

  if (!isRecallEnabled()) {
    return { items: [], totalConsidered: 0, budgetTokens, skipped: true }
  }

  try {
    const db: AnyDb = args.db ?? createAdminClient()
    const allowedProjectIds = await getAllowedProjectIds(db, args.userId)
    const focus = args.focus ?? []

    const { data, error } = await db.rpc('atlas_recall', {
      p_project_ids: allowedProjectIds,
      p_focus_kinds: focus.map((f) => f.entityKind),
      p_focus_ids: focus.map((f) => f.entityId),
      p_episodic_days: args.episodicDays ?? 90,
      p_limit: args.limit ?? 60,
    })

    if (error) {
      console.error(`[atlas-memory] recallMemories failed: ${error.message}`)
      return { items: [], totalConsidered: 0, budgetTokens, skipped: false }
    }

    return assembleMemoryPack((data ?? []) as RecallRow[], { allowedProjectIds, budgetTokens })
  } catch (err) {
    console.error(
      `[atlas-memory] recallMemories threw (swallowed): ${err instanceof Error ? err.message : String(err)}`,
    )
    return { items: [], totalConsidered: 0, budgetTokens, skipped: false }
  }
}
