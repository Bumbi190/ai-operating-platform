/**
 * memory-store.ts
 *
 * Query interface for the platform's operational memory.
 *
 * Provides:
 *   getMemory()           — get all memory for a project by category
 *   getHighConfidence()   — only return patterns above confidence threshold
 *   getContextSummary()   — build a text summary for injecting into prompts
 *   tombstoneMemoryItem() — let humans hide stale/wrong patterns without hard delete
 *
 * Design principles:
 *   - Lightweight: queries only what's asked for
 *   - Human-controllable: all patterns can be reviewed and tombstoned
 *   - Prompt-injectable: getContextSummary() returns text ready for system prompts
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createMemoryLifecycleAuditEvent } from './stage1-foundation'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'hook_patterns'
  | 'avoided_phrases'
  | 'brand_voice'
  | 'content_patterns'
  | 'rejection_triggers'

export interface MemoryItem {
  id:            string
  category:      MemoryCategory
  key:           string
  value:         Record<string, unknown>
  confidence:    number  // 0–1
  evidenceCount: number
  lastSeenAt:    string
}

export interface ProjectMemorySummary {
  totalItems:      number
  byCategory:      Record<MemoryCategory, number>
  topRejectionTriggers: MemoryItem[]
  topAvoidedPhrases:    MemoryItem[]
  highConfidenceItems:  MemoryItem[]
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get all memory items for a project, optionally filtered by category.
 */
export async function getMemory(
  projectId: string,
  category?: MemoryCategory,
  minConfidence = 0.0
): Promise<MemoryItem[]> {
  const db = createAdminClient()

  let query = db
    .from('platform_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('lifecycle_state', 'active')
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map(toMemoryItem)
}

/**
 * Get only high-confidence memory items (confidence >= threshold).
 * Good for prompt injection — you only want proven patterns.
 */
export async function getHighConfidence(
  projectId: string,
  threshold = 0.6,
  limit = 20
): Promise<MemoryItem[]> {
  const db = createAdminClient()

  const { data, error } = await db
    .from('platform_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('lifecycle_state', 'active')
    .gte('confidence', threshold)
    .order('confidence', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map(toMemoryItem)
}

/**
 * Build a concise text summary of the platform's memory.
 * Designed to be injected into agent system prompts to give them
 * operational context without stuffing in raw data.
 *
 * Returns null if no meaningful memory exists yet.
 */
export async function getContextSummary(projectId: string): Promise<string | null> {
  const items = await getHighConfidence(projectId, 0.5, 30)

  if (items.length === 0) return null

  const rejectionTriggers = items
    .filter(i => i.category === 'rejection_triggers')
    .slice(0, 5)

  const avoidedPhrases = items
    .filter(i => i.category === 'avoided_phrases')
    .slice(0, 5)

  const contentPatterns = items
    .filter(i => i.category === 'content_patterns')
    .slice(0, 5)

  const lines: string[] = ['[PLATFORM MEMORY — Learned from human feedback]']

  if (rejectionTriggers.length > 0) {
    lines.push('\nREJECTION TRIGGERS (avoid these):')
    for (const item of rejectionTriggers) {
      const note = (item.value.note as string | undefined) ?? item.key
      lines.push(`  - ${item.key}: ${note} (confidence: ${(item.confidence * 100).toFixed(0)}%)`)
    }
  }

  if (avoidedPhrases.length > 0) {
    lines.push('\nAVOIDED PHRASES (previously flagged for revision):')
    for (const item of avoidedPhrases) {
      lines.push(`  - "${item.key}"`)
    }
  }

  if (contentPatterns.length > 0) {
    lines.push('\nCONTENT PATTERNS (what has worked):')
    for (const item of contentPatterns) {
      const note = (item.value.note as string | undefined) ?? item.key
      lines.push(`  - ${note}`)
    }
  }

  return lines.join('\n')
}

/**
 * Returns a dashboard-ready summary of all memory for a project.
 */
export async function getProjectMemorySummary(projectId: string): Promise<ProjectMemorySummary> {
  const all = await getMemory(projectId)

  const byCategory = {
    hook_patterns:      0,
    avoided_phrases:    0,
    brand_voice:        0,
    content_patterns:   0,
    rejection_triggers: 0,
  } as Record<MemoryCategory, number>

  for (const item of all) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1
  }

  return {
    totalItems: all.length,
    byCategory,
    topRejectionTriggers: all
      .filter(i => i.category === 'rejection_triggers')
      .slice(0, 5),
    topAvoidedPhrases: all
      .filter(i => i.category === 'avoided_phrases')
      .slice(0, 5),
    highConfidenceItems: all
      .filter(i => i.confidence >= 0.65)
      .slice(0, 10),
  }
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Tombstone a memory item as a human correction.
 *
 * Stage 1 never performs silent physical hard delete. The row remains in
 * platform_memory for auditability and is hidden from active memory reads by
 * lifecycle_state.
 */
export async function tombstoneMemoryItem(id: string, actorId: string): Promise<void> {
  const db = createAdminClient()
  const { data: existing, error: readError } = await db
    .from('platform_memory')
    .select('audit_events')
    .eq('id', id)
    .single()

  if (readError) throw readError

  const auditEvents = Array.isArray(existing.audit_events)
    ? existing.audit_events
    : []
  const event = createMemoryLifecycleAuditEvent({
    action: 'tombstoned',
    actorId,
  })

  const { error } = await db
    .from('platform_memory')
    .update({
      lifecycle_state: 'tombstoned',
      correction_state: 'tombstoned',
      tombstoned_at: event.at,
      tombstoned_by: actorId,
      audit_events: [...auditEvents, event],
      last_seen_at: event.at,
    })
    .eq('id', id)

  if (error) throw error
}

/**
 * Manually add a memory item (e.g., from BRAND.md onboarding).
 * Useful for pre-seeding memory with known brand rules.
 */
export async function upsertMemoryItem(
  projectId: string,
  item: {
    category: MemoryCategory
    key: string
    value: Record<string, unknown>
    confidence?: number
  }
): Promise<void> {
  const db = createAdminClient()

  await db
    .from('platform_memory')
    .upsert({
      project_id:     projectId,
      category:       item.category,
      key:            item.key,
      value:          item.value,
      confidence:     item.confidence ?? 0.8,
      evidence_count: 1,
      last_seen_at:   new Date().toISOString(),
    }, {
      onConflict: 'project_id,category,key',
    })
}

/**
 * Seeds initial memory from brand configuration.
 * Call once per project to bootstrap memory with known rules.
 */
export async function seedBrandMemory(projectId: string): Promise<void> {
  const brandRules: Parameters<typeof upsertMemoryItem>[1][] = [
    // The Prompt brand voice rules
    {
      category: 'brand_voice',
      key: 'punchy_sentences',
      value: { note: 'Max 12 words per sentence. Short = punch.', source: 'BRAND.md' },
      confidence: 0.95,
    },
    {
      category: 'brand_voice',
      key: 'no_first_person_start',
      value: { note: 'Never start sentences with "I". Impersonal authority.', source: 'BRAND.md' },
      confidence: 0.95,
    },
    {
      category: 'brand_voice',
      key: 'bloomberg_tone',
      value: { note: 'Bloomberg QuickTake energy. Fast, factual, premium.', source: 'BRAND.md' },
      confidence: 0.95,
    },
    {
      category: 'avoided_phrases',
      key: 'game_changer',
      value: { note: 'Overused hype phrase. Be specific instead.', source: 'BRAND.md' },
      confidence: 0.90,
    },
    {
      category: 'avoided_phrases',
      key: 'revolutionary',
      value: { note: 'Unearned claim. Show the evidence, not the adjective.', source: 'BRAND.md' },
      confidence: 0.90,
    },
    {
      category: 'rejection_triggers',
      key: 'generic_ai_opener',
      value: { note: '"In today\'s fast-paced world" and similar — instant rejection', source: 'BRAND.md' },
      confidence: 0.90,
    },
  ]

  for (const rule of brandRules) {
    await upsertMemoryItem(projectId, rule)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMemoryItem(row: Record<string, unknown>): MemoryItem {
  return {
    id:            row.id as string,
    category:      row.category as MemoryCategory,
    key:           row.key as string,
    value:         row.value as Record<string, unknown>,
    confidence:    row.confidence as number,
    evidenceCount: row.evidence_count as number,
    lastSeenAt:    row.last_seen_at as string,
  }
}
