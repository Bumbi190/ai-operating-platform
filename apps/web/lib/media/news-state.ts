import type { SupabaseClient } from '@supabase/supabase-js'
import { toJson } from '@/lib/supabase/json'
import { MediaEligibilityError, type EligibleNewsItem, assertNewsEditorialApproved } from '@/lib/media/eligibility'

export type NewsStatus =
  | 'new'
  | 'pending_novelty_review'
  | 'novelty_passed'
  | 'pending_editorial_review'
  | 'approved'
  | 'rejected'
  | 'scripted'
  | 'published'
  | 'duplicate_blocked'
  | 'material_update_pending'
  | 'uncertain_requires_review'

export type NewsTransitionActor = {
  id: string
  kind: 'user' | 'system' | 'agent'
}

const FAIL_CLOSED = new Set<NewsStatus>([
  'duplicate_blocked',
  'material_update_pending',
  'uncertain_requires_review',
])

const GENERIC_ALLOWED: Record<NewsStatus, NewsStatus[]> = {
  new: ['pending_novelty_review', 'rejected'],
  pending_novelty_review: ['duplicate_blocked', 'material_update_pending', 'uncertain_requires_review', 'pending_editorial_review', 'rejected'],
  novelty_passed: ['pending_editorial_review', 'approved', 'rejected'],
  pending_editorial_review: ['approved', 'rejected'],
  approved: ['scripted', 'rejected'],
  scripted: ['published', 'rejected'],
  published: [],
  rejected: [],
  duplicate_blocked: [],
  material_update_pending: [],
  uncertain_requires_review: [],
}

function asStatus(value: string | null | undefined): NewsStatus {
  return String(value ?? '') as NewsStatus
}

function assertNoveltyPassed(news: EligibleNewsItem) {
  if (news.novelty_verdict !== 'new'
      || news.novelty_policy_outcome !== 'novelty_passed'
      || !news.novelty_reviewed_at
      || !news.novelty_workflow_run_id
      || !news.novelty_input_evidence
      || !news.candidate_idempotency_key
      || !news.candidate_identity) {
    throw new MediaEligibilityError('novelty_required', 'Completed novelty review is required before this transition')
  }
}

async function auditTransition(
  db: SupabaseClient,
  input: {
    projectId: string
    newsItemId: string
    fromStatus: NewsStatus
    toStatus: NewsStatus
    actor?: NewsTransitionActor | null
    reason?: string | null
    reviewedResolution: boolean
  },
) {
  await (db.from('media_duplicate_guard_migration_audit') as any).insert({
    audit_type: input.reviewedResolution ? 'news_reviewed_resolution' : 'news_state_transition',
    project_id: input.projectId,
    affected_id: input.newsItemId,
    table_name: 'media_news_items',
    reason: input.reason ?? `News state transition ${input.fromStatus} -> ${input.toStatus}`,
    details: toJson({
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actor: input.actor ?? null,
      reviewedResolution: input.reviewedResolution,
    }),
  })
}

export async function transitionNewsItemStatus(
  db: SupabaseClient,
  input: {
    projectId: string
    newsItemId: string
    toStatus: NewsStatus
    actor?: NewsTransitionActor | null
    reason?: string | null
    reviewedResolution?: boolean
  },
) {
  const { data, error } = await (db.from('media_news_items') as any)
    .select('id, project_id, status, novelty_verdict, novelty_policy_outcome, novelty_reviewed_at, novelty_workflow_run_id, novelty_input_evidence, candidate_idempotency_key, candidate_identity, editorial_approved_at')
    .eq('id', input.newsItemId)
    .eq('project_id', input.projectId)
    .single()

  if (error || !data) throw new MediaEligibilityError('news_not_found', 'News item not found for project', 404)

  const news = data as EligibleNewsItem
  const fromStatus = asStatus(news.status)
  const toStatus = input.toStatus
  const reviewedResolution = input.reviewedResolution === true

  if (fromStatus === toStatus) return news

  if (FAIL_CLOSED.has(fromStatus) && !reviewedResolution) {
    throw new MediaEligibilityError('reviewed_resolution_required', `Cannot move ${fromStatus} through the generic transition path`)
  }
  if (reviewedResolution && (!input.reason || input.reason.trim().length < 8)) {
    throw new MediaEligibilityError('resolution_reason_required', 'A reviewed resolution reason is required')
  }
  if (!reviewedResolution && !GENERIC_ALLOWED[fromStatus]?.includes(toStatus)) {
    throw new MediaEligibilityError('invalid_news_transition', `Invalid news transition ${fromStatus} -> ${toStatus}`)
  }

  if (toStatus === 'approved') assertNoveltyPassed(news)
  if (toStatus === 'scripted') assertNewsEditorialApproved(news)

  if (reviewedResolution || toStatus === 'approved' || toStatus === 'scripted') {
    await auditTransition(db, {
      projectId: input.projectId,
      newsItemId: input.newsItemId,
      fromStatus,
      toStatus,
      actor: input.actor,
      reason: input.reason,
      reviewedResolution,
    })
  }

  const patch: Record<string, unknown> = { status: toStatus }
  if (toStatus === 'approved') {
    patch.editorial_approved_at = new Date().toISOString()
    patch.editorial_approved_by = toJson(input.actor ?? { id: 'system', kind: 'system' })
  }

  const { data: updated, error: updateError } = await (db.from('media_news_items') as any)
    .update(patch)
    .eq('id', input.newsItemId)
    .eq('project_id', input.projectId)
    .select()
    .single()

  if (updateError) throw new Error(`news status transition failed: ${updateError.message}`)
  return updated
}