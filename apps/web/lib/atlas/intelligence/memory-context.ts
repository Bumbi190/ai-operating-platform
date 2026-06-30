/**
 * lib/atlas/intelligence/memory-context.ts — Atlas Memory M4 Commit 6:
 * the Memory dimension of the Context Request boundary.
 *
 * This is the ONLY bridge by which Executive Intelligence receives Memory:
 *
 *     Memory → recallMemories() → [this module] → Executive Intelligence
 *
 * EI never reads the database directly. recallMemories() is the sole access path
 * (it calls the public.atlas_recall SECURITY DEFINER wrapper); this module shapes
 * the recalled MemoryPack into the context EI consumes. Gated by
 * ATLAS_MEMORY_INJECT (default OFF) — when off it is an inert no-op and produces
 * no injection, so default behaviour is unchanged.
 *
 * Functional-core / imperative-shell:
 *   • splitMemoryPack()      — PURE: separate recall items from decision constraints.
 *   • resolveMemoryContext() — SHELL: flag gate + recallMemories() + split.
 *
 * Channel separation (roadmap C6, ADR "data not instructions"):
 *   • decision-class memories are promoted to CONSTRAINTS — never injected as
 *     recallable context.
 *   • all other memories become MemoryItem[] recall context.
 * Live-data-over-memory precedence is enforced by consumer ordering (memory is
 * placed after live signals/view); this module only separates the channels.
 */

import { recallMemories, type FocusRef, type MemoryPack } from '../memory/recall-memories'
import type { MemoryItem } from './types'

export function isMemoryInjectEnabled(): boolean {
  return process.env.ATLAS_MEMORY_INJECT === '1'
}

export interface MemoryContext {
  /** Recallable memory items (decision-class excluded). */
  items: MemoryItem[]
  /** Decision-class memories promoted to constraints (data, not instructions). */
  constraints: string[]
}

const EMPTY_CONTEXT: MemoryContext = { items: [], constraints: [] }

// ── Functional core (pure) ────────────────────────────────────────────────────

/**
 * Split a recalled MemoryPack into the two context channels. Pure/deterministic.
 * Decision-class memories become constraints; everything else becomes recall items.
 */
export function splitMemoryPack(pack: MemoryPack): MemoryContext {
  const items: MemoryItem[] = []
  const constraints: string[] = []

  for (const it of pack.items) {
    if (it.memoryClass === 'decision') {
      constraints.push(it.summary)
      continue
    }
    items.push({
      id: it.id,
      content: it.summary,
      eventType: it.kind === 'event' ? 'episodic' : it.memoryClass,
      confidence: it.confidence,
      occurredAt: it.lastSeenAt,
    })
  }

  return { items, constraints }
}

// ── Imperative shell (I/O via recallMemories only) ────────────────────────────

export interface MemoryContextRequest {
  /** EI/system scope: the project(s) being reasoned about (bounds recall). */
  projectIds?: string[]
  /** User scope (e.g. manager chat): identity whose allowed projects bound recall. */
  userId?: string | null
  focus?: FocusRef[]
}

/**
 * Resolve the Memory dimension of a Context Request. Gated by ATLAS_MEMORY_INJECT
 * (default OFF → empty). Reaches Memory only through recallMemories(). Never throws
 * (recallMemories is non-throwing; an empty pack yields an empty context).
 */
export async function resolveMemoryContext(
  req: MemoryContextRequest,
): Promise<MemoryContext> {
  if (!isMemoryInjectEnabled()) return EMPTY_CONTEXT

  const pack = await recallMemories({
    userId: req.userId ?? null,
    projectIds: req.projectIds,
    focus: req.focus,
  })
  return splitMemoryPack(pack)
}

/**
 * Convenience for orchestrator `memoryRecall` seams that consume recall items only
 * (e.g. the deterministic brief producer, which has no constraints channel).
 */
export async function resolveMemoryItems(
  req: MemoryContextRequest,
): Promise<MemoryItem[]> {
  return (await resolveMemoryContext(req)).items
}
