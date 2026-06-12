/**
 * feedback-store.ts
 *
 * Saves human approval/rejection decisions and derives memory patterns.
 *
 * Two operations:
 *   1. saveFeedback()     — called when human approves/rejects an output
 *   2. updateMemory()     — derives and upserts platform_memory from new feedback
 *
 * Memory is built bottom-up from real feedback — not from assumptions.
 * This is the mechanism that makes the platform improve over time.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { toJson } from '@/lib/supabase/json'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeedbackDecision = 'approved' | 'rejected' | 'revised'

export interface SaveFeedbackInput {
  projectId:       string
  approvalId?:     string
  evaluationId?:   string
  outputType:      string  // 'script', 'hook', 'caption', etc.
  decision:        FeedbackDecision
  rejectionReason?: string
  revisionNotes?:   string
  contentExcerpt?:  string
  evalScoreAtDecision?: number
}

export interface FeedbackRecord {
  id:               string
  projectId:        string
  outputType:       string
  decision:         FeedbackDecision
  rejectionReason:  string | null
  revisionNotes:    string | null
  qualityPatterns:  string[]
  contentExcerpt:   string | null
  evalScore:        number | null
  createdAt:        string
}

// ─── Quality Pattern Classifier ──────────────────────────────────────────────
// Derives machine-readable patterns from free-text rejection reasons.
// Used to build platform_memory over time.

const PATTERN_CLASSIFIERS: { pattern: RegExp; tag: string }[] = [
  { pattern: /hook|opening|first.*(line|sentence)|scroll.stop/i,     tag: 'weak_hook' },
  { pattern: /generic|vague|bland|boring|templat/i,                  tag: 'too_generic' },
  { pattern: /specific|number|stat|fact|data/i,                      tag: 'needs_specificity' },
  { pattern: /slop|corporate|buzzword|jargon|cliché/i,               tag: 'slop_language' },
  { pattern: /brand|voice|tone|style|editorial/i,                    tag: 'off_brand' },
  { pattern: /pacing|long|short|sentence|rhythm|punchy/i,            tag: 'pacing_issue' },
  { pattern: /caption|hashtag|cta|call.to.action/i,                  tag: 'caption_issue' },
  { pattern: /hallucin|wrong|incorrect|false|inaccurate/i,           tag: 'factual_concern' },
  { pattern: /repetitive|repeat|already used|similar to/i,           tag: 'repetitive' },
  { pattern: /clickbait|sensational|hype|exagger/i,                  tag: 'clickbait' },
]

function classifyPatterns(text: string): string[] {
  if (!text) return []
  return PATTERN_CLASSIFIERS
    .filter(c => c.pattern.test(text))
    .map(c => c.tag)
}

// ─── Save Feedback ────────────────────────────────────────────────────────────

/**
 * Saves a human feedback decision and derives quality patterns from it.
 * Then updates platform_memory with the new evidence.
 */
export async function saveFeedback(input: SaveFeedbackInput): Promise<{ id: string }> {
  const db = createAdminClient()

  const patterns = classifyPatterns(
    [input.rejectionReason, input.revisionNotes].filter(Boolean).join(' ')
  )

  const { data, error } = await db
    .from('content_feedback')
    .insert({
      project_id:             input.projectId,
      approval_id:            input.approvalId ?? null,
      evaluation_id:          input.evaluationId ?? null,
      output_type:            input.outputType,
      decision:               input.decision,
      rejection_reason:       input.rejectionReason ?? null,
      revision_notes:         input.revisionNotes ?? null,
      quality_patterns:       patterns,
      content_excerpt:        input.contentExcerpt ?? null,
      eval_score_at_decision: input.evalScoreAtDecision ?? null,
    })
    .select('id')
    .single()

  if (error) throw error

  // Async: update memory from this new feedback (fire-and-forget, no await needed)
  // We do await here to keep it in the same transaction window
  await updateMemoryFromFeedback(input.projectId, input.decision, patterns, input.rejectionReason)

  return { id: data.id }
}

// ─── Memory Updater ───────────────────────────────────────────────────────────

/**
 * Derives platform_memory updates from a single feedback event.
 * Uses upsert with evidence_count increment to build confidence over time.
 */
async function updateMemoryFromFeedback(
  projectId: string,
  decision: FeedbackDecision,
  patterns: string[],
  rejectionReason?: string,
): Promise<void> {
  const db = createAdminClient()

  const memoryUpdates: {
    category: string
    key: string
    value: object
    confidenceDelta: number
  }[] = []

  // Rejected → add to rejection_triggers
  if (decision === 'rejected' && patterns.length > 0) {
    for (const pattern of patterns) {
      memoryUpdates.push({
        category: 'rejection_triggers',
        key: pattern,
        value: {
          pattern,
          note: rejectionReason?.slice(0, 200) ?? 'Rejected by reviewer',
          last_rejection: new Date().toISOString(),
        },
        confidenceDelta: 0.1,
      })
    }
  }

  // Approved → record as content_patterns that work
  if (decision === 'approved' && patterns.length > 0) {
    for (const pattern of patterns) {
      // If a previously flagged pattern is now in an approved item, lower its confidence
      memoryUpdates.push({
        category: 'content_patterns',
        key: `approved_despite_${pattern}`,
        value: { note: `Content with "${pattern}" was approved`, pattern },
        confidenceDelta: 0.05,
      })
    }
  }

  // Revised → add to avoided_phrases (it needed change)
  if (decision === 'revised' && patterns.length > 0) {
    for (const pattern of patterns) {
      memoryUpdates.push({
        category: 'avoided_phrases',
        key: pattern,
        value: {
          pattern,
          note: rejectionReason?.slice(0, 200) ?? 'Required revision',
        },
        confidenceDelta: 0.07,
      })
    }
  }

  // Upsert each memory item
  for (const update of memoryUpdates) {
    const { data: existing } = await db
      .from('platform_memory')
      .select('id, confidence, evidence_count, value')
      .eq('project_id', projectId)
      .eq('category', update.category)
      .eq('key', update.key)
      .single()

    if (existing) {
      const newConfidence = Math.min(0.99, existing.confidence + update.confidenceDelta)
      const newValue = { ...(existing.value as object), ...update.value }
      await db
        .from('platform_memory')
        .update({
          confidence:     newConfidence,
          evidence_count: existing.evidence_count + 1,
          value:          newValue,
          last_seen_at:   new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await db
        .from('platform_memory')
        .insert({
          project_id:     projectId,
          category:       update.category,
          key:            update.key,
          value:          toJson(update.value),
          confidence:     0.3 + update.confidenceDelta,
          evidence_count: 1,
        })
        .select()
    }
  }
}

// ─── Feedback Query Helpers ───────────────────────────────────────────────────

/**
 * Returns recent feedback for a project, useful for showing in the Memory page.
 */
export async function getRecentFeedback(
  projectId: string,
  limit = 20
): Promise<FeedbackRecord[]> {
  const db = createAdminClient()

  const { data, error } = await db
    .from('content_feedback')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map(row => ({
    id:              row.id,
    projectId:       row.project_id,
    outputType:      row.output_type,
    decision:        row.decision as FeedbackDecision,
    rejectionReason: row.rejection_reason,
    revisionNotes:   row.revision_notes,
    qualityPatterns: row.quality_patterns ?? [],
    contentExcerpt:  row.content_excerpt,
    evalScore:       row.eval_score_at_decision,
    createdAt:       row.created_at,
  }))
}

/**
 * Returns pattern frequency stats — useful for detecting recurring issues.
 */
export async function getPatternStats(projectId: string): Promise<{
  pattern: string
  rejections: number
  revisions: number
  approvals: number
}[]> {
  const db = createAdminClient()

  const { data } = await db
    .from('content_feedback')
    .select('decision, quality_patterns')
    .eq('project_id', projectId)

  if (!data || data.length === 0) return []

  const stats: Record<string, { rejections: number; revisions: number; approvals: number }> = {}

  for (const row of data) {
    const patterns: string[] = row.quality_patterns ?? []
    for (const p of patterns) {
      if (!stats[p]) stats[p] = { rejections: 0, revisions: 0, approvals: 0 }
      if (row.decision === 'rejected') stats[p].rejections++
      else if (row.decision === 'revised') stats[p].revisions++
      else if (row.decision === 'approved') stats[p].approvals++
    }
  }

  return Object.entries(stats)
    .map(([pattern, counts]) => ({ pattern, ...counts }))
    .sort((a, b) => (b.rejections + b.revisions) - (a.rejections + a.revisions))
}
