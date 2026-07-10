import type { SupabaseClient } from '@supabase/supabase-js'

export type MediaProductionStage =
  | 'script'
  | 'voice'
  | 'images'
  | 'music'
  | 'render'
  | 'publish'
  | 'youtube'

export type EligibleNewsItem = {
  id: string
  project_id: string
  status: string | null
  novelty_verdict: string | null
  novelty_policy_outcome: string | null
  novelty_reviewed_at: string | null
  novelty_workflow_run_id?: string | null
  novelty_input_evidence?: unknown | null
  candidate_idempotency_key?: string | null
  candidate_identity?: string | null
  editorial_approved_at?: string | null
}

export type EligibleScript = {
  id: string
  project_id: string
  news_item_id: string | null
  status: string | null
  voice_status?: string | null
  video_status?: string | null
  published_at?: string | null
  background_music_url?: string | null
  media_news_items?: EligibleNewsItem | EligibleNewsItem[] | null
}

export class MediaEligibilityError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status = 409) {
    super(message)
    this.name = 'MediaEligibilityError'
    this.code = code
    this.status = status
  }
}

const BLOCKED_NEWS_STATES = new Set([
  'pending_novelty_review',
  'duplicate_blocked',
  'material_update_pending',
  'uncertain_requires_review',
])

function relatedNews(script: EligibleScript): EligibleNewsItem | null {
  const rel = script.media_news_items
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

function assertNewsNoveltyPassed(news: EligibleNewsItem) {
  if (news.project_id == null) {
    throw new MediaEligibilityError('missing_project', 'News item is missing project identity', 422)
  }
  if (BLOCKED_NEWS_STATES.has(String(news.status))) {
    throw new MediaEligibilityError('novelty_blocked', `News item is not production eligible: ${news.status}`)
  }
  if (news.novelty_verdict !== 'new' || news.novelty_policy_outcome !== 'novelty_passed' || !news.novelty_reviewed_at) {
    throw new MediaEligibilityError('novelty_required', 'Completed novelty review is required before media production')
  }
  if (!news.novelty_workflow_run_id || !news.novelty_input_evidence) {
    throw new MediaEligibilityError('durable_novelty_evidence_required', 'Durable novelty run evidence is required before media production')
  }
  if (!news.candidate_idempotency_key || !news.candidate_identity) {
    throw new MediaEligibilityError('candidate_intake_evidence_required', 'Atomic candidate intake evidence is required before media production')
  }
}

export function assertNewsEditorialApproved(news: EligibleNewsItem) {
  assertNewsNoveltyPassed(news)
  if (!news.editorial_approved_at) {
    throw new MediaEligibilityError('editorial_approval_required', 'Editorial approval timestamp is required before production')
  }
  if (!['approved', 'scripted'].includes(String(news.status))) {
    throw new MediaEligibilityError('editorial_approval_required', `Editorial approval is required before production (status: ${news.status})`)
  }
}

export function assertScriptProductionEligible(script: EligibleScript, stage: MediaProductionStage) {
  if (!script.project_id) {
    throw new MediaEligibilityError('missing_project', 'Script is missing project identity', 422)
  }
  const news = relatedNews(script)
  if (!script.news_item_id || !news) {
    throw new MediaEligibilityError('news_relationship_required', 'Script must be linked to a reviewed news item')
  }
  if (news.project_id !== script.project_id) {
    throw new MediaEligibilityError('project_mismatch', 'Script and news item belong to different projects', 403)
  }
  assertNewsEditorialApproved(news)

  if (stage === 'script') return

  if (stage === 'publish' || stage === 'youtube') {
    if (!['approved', 'publishing', 'published'].includes(String(script.status))) {
      throw new MediaEligibilityError('publishing_approval_required', `Script is not publish eligible: ${script.status}`)
    }
    return
  }

  if (script.status !== 'approved') {
    throw new MediaEligibilityError('production_approval_required', `Script must be approved before ${stage}: ${script.status}`)
  }
  if (stage === 'music' && script.background_music_url) {
    throw new MediaEligibilityError('music_already_generated', 'Background music has already been generated for this script')
  }
}

export async function assertMediaProductionEligible(
  db: SupabaseClient,
  input: {
    projectId: string
    newsItemId?: string | null
    scriptId?: string | null
    stage: MediaProductionStage
  },
): Promise<{ newsItem: EligibleNewsItem | null; script: EligibleScript | null }> {
  if (!input.projectId) throw new MediaEligibilityError('project_required', 'projectId is required', 400)

  if (input.scriptId) {
    const { data, error } = await (db.from('media_scripts') as any)
      .select(`
        id,
        project_id,
        news_item_id,
        status,
        voice_status,
        video_status,
        published_at,
        background_music_url,
        media_news_items (
          id,
          project_id,
          status,
          novelty_verdict,
          novelty_policy_outcome,
          novelty_reviewed_at,
          novelty_workflow_run_id,
          novelty_input_evidence,
          candidate_idempotency_key,
          candidate_identity,
          editorial_approved_at
        )
      `)
      .eq('id', input.scriptId)
      .eq('project_id', input.projectId)
      .single()

    if (error || !data) throw new MediaEligibilityError('script_not_found', 'Script not found for project', 404)
    const script = data as EligibleScript
    assertScriptProductionEligible(script, input.stage)
    return { script, newsItem: relatedNews(script) }
  }

  if (input.newsItemId) {
    const { data, error } = await (db.from('media_news_items') as any)
      .select('id, project_id, status, novelty_verdict, novelty_policy_outcome, novelty_reviewed_at, novelty_workflow_run_id, novelty_input_evidence, candidate_idempotency_key, candidate_identity, editorial_approved_at')
      .eq('id', input.newsItemId)
      .eq('project_id', input.projectId)
      .single()

    if (error || !data) throw new MediaEligibilityError('news_not_found', 'News item not found for project', 404)
    const news = data as EligibleNewsItem
    assertNewsEditorialApproved(news)
    return { newsItem: news, script: null }
  }

  throw new MediaEligibilityError('target_required', 'newsItemId or scriptId is required', 400)
}

export function eligibilityResponse(error: unknown) {
  if (error instanceof MediaEligibilityError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status,
    }
  }
  return {
    body: { error: error instanceof Error ? error.message : 'Media eligibility check failed' },
    status: 500,
  }
}