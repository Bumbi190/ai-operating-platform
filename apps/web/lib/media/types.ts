// ─────────────────────────────────────────────────────────────────────────────
// AI Media Automation — shared types
// ─────────────────────────────────────────────────────────────────────────────

export type NewsStatus =
  | 'new'
  | 'pending_novelty_review'
  | 'novelty_passed'
  | 'pending_editorial_review'
  | 'approved'
  | 'rejected'
  | 'scripted'
  | 'duplicate_blocked'
  | 'material_update_pending'
  | 'uncertain_requires_review'
export type ScriptStatus = 'pending_review' | 'approved' | 'rejected' | 'publishing' | 'published'
export type VoiceStatus = 'none' | 'generating' | 'ready' | 'failed'
export type ContentAngle = 'educational' | 'controversial' | 'inspiring' | 'practical'
export type TargetAudience = 'beginners' | 'intermediate' | 'advanced'

// ─── News Hunter output (returned as JSON string in runs.context.news_json) ──

export interface NewsHunterOutput {
  title: string
  summary: string
  key_insight: string
  virality_score: number          // 0–100
  target_audience: TargetAudience
  content_angle: ContentAngle
  source_url?: string
  source_name?: string
}

// ─── Script Writer output (returned as JSON string in runs.context.script_json)

export interface ScriptWriterOutput {
  hook: string
  script: string
  captions: string[]
  hashtags: string[]
  cta: string
  tone: 'educational' | 'entertaining' | 'inspiring'
  estimated_duration: string
  difficulty: 'beginner' | 'intermediate'
}

// ─── Database row shapes ──────────────────────────────────────────────────────

export interface MediaNewsItem {
  id: string
  project_id: string
  run_id: string | null
  title: string
  summary: string | null
  key_insight: string | null
  url: string | null
  source_name: string | null
  target_audience: string | null
  content_angle: string | null
  virality_score: number
  status: NewsStatus
  raw_output: NewsHunterOutput | null
  fetched_at: string
  created_at: string
}

export interface MediaScript {
  id: string
  project_id: string
  news_item_id: string | null
  run_id: string | null
  hook: string | null
  script: string | null
  captions: string[] | null
  hashtags: string[] | null
  cta: string | null
  tone: string | null
  estimated_duration: string | null
  raw_output: ScriptWriterOutput | null
  audio_url: string | null
  timing_url: string | null
  duration_ms: number | null
  voice_status: VoiceStatus
  images: string[] | null       // Ideogram-generated scene backgrounds (5 URLs)
  video_url: string | null
  video_status: string
  status: ScriptStatus
  feedback: string | null
  version: number
  generated_at: string
  reviewed_at: string | null
  published_at: string | null
}
